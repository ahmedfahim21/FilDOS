import { homedir } from 'node:os';
import { sep } from 'node:path';
import { ipcMain, shell } from 'electron';
import { Channels, Events } from '@shared/channels';
import type {
  AccountRecord,
  AppError,
  ChatSendPayload,
  ChatSessionMeta,
  ChatStreamEvent,
  LlmModelStatus,
  Result,
  StoredChatMessage,
} from '@shared/types';
import {
  getLlmModelDef,
  LLM_MODELS,
  type LlmModelDef,
  type LlmSystemSpecs,
} from '@shared/llmModels';
import {
  cloudProviderOfAccount,
  isCloudModelId,
  isLlmAccountProvider,
  type CloudLlmTestResult,
} from '@shared/cloudLlm';
import { getPrefs, setPrefs } from '../../prefs';
import { listDir } from '../../fs/service';
import * as chats from '../../db/chats';
import * as accountsDb from '../../db/accounts';
import { remapPaths } from '../../db';
import * as aiIndex from '../../db/aiIndex';
import { extractText } from '../index/extract';
import { searchIndex } from '../index/handlers';
import { buildChat, type ChatContextDeps } from './context';
import { type ChatToolDeps } from './tools';
import { LlmManager } from './manager';
import { sendChat, type SendChatDeps } from './sendChat';
import { bedrockCheck, cloudChat, stopCloudChat, testCloudModel } from './cloudChat';
import {
  connectCloudProvider,
  disconnectCloudAccount,
  verifyCredentials,
  type CloudAccountsDeps,
} from './cloudAccounts';

/**
 * IPC surface for the Assistant chat. Owns the single {@link LlmManager}
 * (one utilityProcess, one resident model) plus the BYO-key cloud engine, and
 * streams generation to the requesting renderer over `Events.chatStream` —
 * mirroring how ai/handlers.ts forwards download progress. Every exchange is
 * persisted to `db/chats.ts` (session minted lazily on the first message) so
 * conversations can be reopened and continued. Mutating calls follow the
 * `wrap()` convention.
 */

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = err as Error & { code?: string };
    const error: AppError = {
      code: e.code ?? 'EUNKNOWN',
      message: e.message ?? 'Something went wrong.',
    };
    return { ok: false, error };
  }
}

const manager = new LlmManager();

/** Real deps for the context builder (tests inject fakes via buildChat directly). */
const contextDeps: ChatContextDeps = {
  extract: extractText,
  list: listDir,
  search: (query, k) => searchIndex(query, { k }),
};

/** Real environment for the file tools (tests inject fakes via executeChatTool). */
const toolDeps: ChatToolDeps = {
  trashItem: (path) => shell.trashItem(path),
  remap: (oldPath, newPath) => remapPaths(oldPath, newPath, sep),
  // Mirrors the fs trash handler: drop index rows for the path + descendants.
  dropIndex: async (path) => {
    const under = (await aiIndex.statesUnder(path)).map((s) => s.path);
    if (under.length) await aiIndex.remove(under);
  },
  extract: extractText,
  search: (query, k) => searchIndex(query, { k }),
  home: homedir,
};

/** A model definition by id — the built-in catalog plus the user's custom models. */
async function modelDefOf(modelId: string): Promise<LlmModelDef | undefined> {
  const builtIn = getLlmModelDef(modelId);
  if (builtIn) return builtIn;
  return (await getPrefs()).ai?.llmCustomModels?.find((m) => m.id === modelId);
}

/** Real deps for the cloud connection flows. */
const cloudAccountsDeps: CloudAccountsDeps = {
  fetchFn: fetch,
  saveAccount: accountsDb.saveConfigAccount,
  deleteAccount: accountsDb.deleteAccount,
  getPrefs,
  setPrefs,
  bedrockCheck,
};

/** Real deps for {@link sendChat}. */
const sendChatDeps: Omit<SendChatDeps, 'send'> = {
  getPrefs,
  chats,
  buildChat,
  contextDeps,
  toolDeps,
  local: manager,
  cloud: cloudChat,
  getCredentials: accountsDb.getConfig,
  modelDefOf,
};

/** Register the chat LLM IPC handlers. Call once at startup. */
export function registerLlmHandlers(): void {
  ipcMain.handle(Channels.llmModels, () =>
    wrap<LlmModelStatus[]>(async () => {
      const ai = (await getPrefs()).ai;
      const custom = ai?.llmCustomModels ?? [];
      const local = await manager.models([
        ...LLM_MODELS.map((m) => m.id),
        ...custom.map((m) => m.id),
      ]);
      // Cloud models have no weights: nothing to download, always ready.
      const cloud = (ai?.cloudModels ?? []).map(
        (m): LlmModelStatus => ({ modelId: m.id, state: 'ready' }),
      );
      return [...local, ...cloud];
    }),
  );

  ipcMain.handle(Channels.llmDownload, (e, modelId: string) =>
    wrap<void>(async () => {
      if (isCloudModelId(modelId)) {
        throw Object.assign(new Error('Cloud models are not downloaded.'), { code: 'EINVAL' });
      }
      const def = await modelDefOf(modelId);
      if (!def) {
        throw Object.assign(new Error(`Unknown chat model: ${modelId}`), { code: 'EINVAL' });
      }
      const off = manager.onProgress((status) => {
        if (!e.sender.isDestroyed()) e.sender.send(Events.llmModelProgress, status);
      });
      try {
        await manager.download(modelId, def.uri);
      } finally {
        off();
      }
    }),
  );

  ipcMain.handle(Channels.llmCancelDownload, (_e, modelId: string) =>
    wrap<void>(() => manager.cancelDownload(modelId)),
  );

  ipcMain.handle(Channels.llmRemove, (_e, modelId: string) =>
    wrap<void>(async () => {
      // No catalog check: a just-forgotten custom model must still be removable.
      if (typeof modelId !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(modelId)) {
        throw Object.assign(new Error('Invalid model id.'), { code: 'EINVAL' });
      }
      if (isCloudModelId(modelId)) {
        throw Object.assign(new Error('Cloud models have no local weights.'), { code: 'EINVAL' });
      }
      await manager.remove(modelId);
    }),
  );

  ipcMain.handle(Channels.llmSpecs, () => wrap<LlmSystemSpecs>(() => manager.specs()));

  ipcMain.handle(Channels.chatSend, (e, payload: ChatSendPayload) =>
    wrap<{ sessionId: string }>(() =>
      sendChat(payload, {
        ...sendChatDeps,
        send: (event: ChatStreamEvent) => {
          if (!e.sender.isDestroyed()) e.sender.send(Events.chatStream, event);
        },
      }),
    ),
  );

  ipcMain.handle(Channels.chatStop, (_e, requestId: string) =>
    wrap<void>(async () => {
      // One of the two engines owns the request; each no-ops on unknown ids.
      stopCloudChat(requestId);
      await manager.stopChat(requestId);
    }),
  );

  // --- BYO-key cloud connections -----------------------------------------

  ipcMain.handle(
    Channels.llmCloudConnect,
    (_e, providerId: string, options: Record<string, string>) =>
      wrap<{ account: AccountRecord; unverified?: boolean }>(() =>
        connectCloudProvider(providerId, options, cloudAccountsDeps),
      ),
  );

  ipcMain.handle(Channels.llmCloudAccounts, () =>
    wrap<AccountRecord[]>(async () =>
      (await accountsDb.listAccounts()).filter((a) => isLlmAccountProvider(a.provider)),
    ),
  );

  ipcMain.handle(Channels.llmCloudDisconnect, (_e, accountId: string) =>
    wrap<void>(() => disconnectCloudAccount(accountId, cloudAccountsDeps)),
  );

  ipcMain.handle(Channels.llmCloudTest, (_e, accountId: string, remoteId?: string) =>
    wrap<CloudLlmTestResult>(async () => {
      const accounts = await accountsDb.listAccounts();
      const account = accounts.find((a) => a.id === accountId);
      const provider = account && cloudProviderOfAccount(account.provider);
      if (!provider) {
        throw Object.assign(new Error('This cloud connection no longer exists.'), {
          code: 'EINVAL',
        });
      }
      const credentials = await accountsDb.getConfig(accountId);
      if (!credentials) {
        throw Object.assign(
          new Error('The stored credentials could not be read — reconnect the provider.'),
          { code: 'EAUTH' },
        );
      }
      // With a model: the truthful end-to-end check (one tiny generation).
      if (remoteId) return testCloudModel(provider, remoteId, credentials);
      return verifyCredentials(provider, credentials, cloudAccountsDeps);
    }),
  );

  // --- Saved conversations ------------------------------------------------

  ipcMain.handle(Channels.chatsList, () =>
    wrap<ChatSessionMeta[]>(() => chats.listSessions()),
  );

  ipcMain.handle(Channels.chatsMessages, (_e, sessionId: string) =>
    wrap<StoredChatMessage[]>(() => chats.listMessages(sessionId)),
  );

  ipcMain.handle(Channels.chatsRename, (_e, sessionId: string, title: string) =>
    wrap<void>(() => chats.renameSession(sessionId, title.trim() || 'Untitled')),
  );

  ipcMain.handle(Channels.chatsRemove, (_e, sessionId: string) =>
    wrap<void>(() => chats.removeSession(sessionId)),
  );
}
