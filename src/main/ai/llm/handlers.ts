import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import { Channels, Events } from '@shared/channels';
import type {
  AppError,
  ChatSendPayload,
  ChatSessionMeta,
  ChatStreamEvent,
  ChatTurn,
  LlmModelStatus,
  Result,
  StoredChatMessage,
} from '@shared/types';
import {
  DEFAULT_LLM_MODEL_ID,
  getLlmModelDef,
  LLM_MODELS,
  resolveLlmConfig,
  type LlmModelDef,
  type LlmSystemSpecs,
} from '@shared/llmModels';
import { getPrefs } from '../../prefs';
import { listDir } from '../../fs/service';
import * as chats from '../../db/chats';
import { extractText } from '../index/extract';
import { searchIndex } from '../index/handlers';
import { buildChat, type ChatContextDeps } from './context';
import { LlmManager } from './manager';

/**
 * IPC surface for the Assistant chat. Owns the single {@link LlmManager}
 * (one utilityProcess, one resident model) and streams generation to the
 * requesting renderer over `Events.chatStream` — mirroring how ai/handlers.ts
 * forwards download progress. Every exchange is persisted to `db/chats.ts`
 * (session minted lazily on the first message) so conversations can be
 * reopened and continued. Mutating calls follow the `wrap()` convention.
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

/** Most prior turns replayed to the model, each capped, so context stays bounded. */
const MAX_HISTORY_TURNS = 8;
const MAX_TURN_CHARS = 2_000;

function capHistory(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((t) => ({
    role: t.role,
    content: t.content.length > MAX_TURN_CHARS ? `${t.content.slice(0, MAX_TURN_CHARS)}…` : t.content,
  }));
}

/** A model definition by id — the built-in catalog plus the user's custom models. */
async function modelDefOf(modelId: string): Promise<LlmModelDef | undefined> {
  const builtIn = getLlmModelDef(modelId);
  if (builtIn) return builtIn;
  return (await getPrefs()).ai?.llmCustomModels?.find((m) => m.id === modelId);
}

/** Register the chat LLM IPC handlers. Call once at startup. */
export function registerLlmHandlers(): void {
  ipcMain.handle(Channels.llmModels, () =>
    wrap<LlmModelStatus[]>(async () => {
      const custom = (await getPrefs()).ai?.llmCustomModels ?? [];
      return manager.models([...LLM_MODELS.map((m) => m.id), ...custom.map((m) => m.id)]);
    }),
  );

  ipcMain.handle(Channels.llmDownload, (e, modelId: string) =>
    wrap<void>(async () => {
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

  ipcMain.handle(Channels.llmRemove, (_e, modelId: string) =>
    wrap<void>(async () => {
      // No catalog check: a just-forgotten custom model must still be removable.
      if (typeof modelId !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(modelId)) {
        throw Object.assign(new Error('Invalid model id.'), { code: 'EINVAL' });
      }
      await manager.remove(modelId);
    }),
  );

  ipcMain.handle(Channels.llmSpecs, () => wrap<LlmSystemSpecs>(() => manager.specs()));

  ipcMain.handle(Channels.chatSend, (e, payload: ChatSendPayload) =>
    wrap<{ sessionId: string }>(async () => {
      const requestId = payload.requestId;
      const send = (event: ChatStreamEvent) => {
        if (!e.sender.isDestroyed()) e.sender.send(Events.chatStream, event);
      };
      const prefs = await getPrefs();
      const modelId = payload.modelId ?? prefs.ai?.llmModelId ?? DEFAULT_LLM_MODEL_ID;
      // The user's per-model settings (Settings → Assistant), defaults applied.
      const config = resolveLlmConfig(modelId, prefs.ai?.llmConfigs?.[modelId]);

      // Persist the user's message up front (a fresh conversation mints its
      // session here); the assistant's reply lands when generation settles.
      const sessionId = payload.sessionId ?? randomUUID();
      if (!payload.sessionId) {
        await chats.createSession(sessionId, chats.titleFor(payload.prompt, payload.command), modelId);
      }
      await chats.appendMessage(sessionId, {
        role: 'user',
        content: payload.prompt,
        command: payload.command,
        mentions: payload.mentions,
      });

      try {
        const built = await buildChat(payload, contextDeps);
        if (built.hits) send({ requestId, type: 'sources', hits: built.hits });
        const offChunk = manager.onChunk((rid, text) => {
          if (rid === requestId) send({ requestId, type: 'chunk', text });
        });
        // The user's standing instructions ride along with the system prompt.
        const system = config.systemPrompt
          ? `${built.system}\n\nAdditional instructions from the user: ${config.systemPrompt}`
          : built.system;
        let answer: string;
        try {
          answer = await manager.chat({
            modelId,
            requestId,
            system,
            history: capHistory(payload.history),
            prompt: built.prompt,
            config,
          });
        } finally {
          offChunk();
        }
        await chats.appendMessage(sessionId, {
          role: 'assistant',
          content: answer,
          sources: built.hits,
        });
        await chats.touchSession(sessionId, modelId);
        send({ requestId, type: 'done' });
        return { sessionId };
      } catch (err) {
        const er = err as Error & { code?: string };
        await chats.touchSession(sessionId, modelId);
        send({
          requestId,
          type: 'error',
          error: { code: er.code ?? 'ELLMFAILED', message: er.message ?? 'Chat failed.' },
        });
        throw err;
      }
    }),
  );

  ipcMain.handle(Channels.chatStop, (_e, requestId: string) =>
    wrap<void>(() => manager.stopChat(requestId)),
  );

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
