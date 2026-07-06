import { count, desc, eq, sql } from 'drizzle-orm';
import type { ChatMention, ChatSessionMeta, SemanticHit, StoredChatMessage } from '@shared/types';
import { db } from './index';
import { chatMessages, chatSessions } from './schema';

/**
 * Saved Assistant conversations. A session is created lazily by the chat
 * handler on the first message and every completed exchange is appended, so
 * conversations can be reopened and continued later. Follows the layer's
 * single-statement-mutation discipline; messages cascade with their session.
 */

/** Hard cap on stored sessions — the oldest are trimmed past this. */
const MAX_SESSIONS = 100;
/** Longest auto-derived session title. */
export const MAX_TITLE = 64;

/** Derive a session title from the first message ("/find tax form 2025" style). */
export function titleFor(prompt: string, command?: string): string {
  const text = [command ? `/${command}` : '', prompt.replace(/\s+/g, ' ').trim()]
    .filter(Boolean)
    .join(' ');
  const title = text || 'New conversation';
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

/** Create a session row (id minted by the caller). */
export async function createSession(id: string, title: string, modelId?: string): Promise<void> {
  const now = Date.now();
  await db()
    .insert(chatSessions)
    .values({ id, title, modelId: modelId ?? null, createdAt: now, updatedAt: now });
  // Trim the oldest sessions past the cap (cascade removes their messages).
  await db().run(sql`
    DELETE FROM chat_sessions WHERE id NOT IN
      (SELECT id FROM chat_sessions ORDER BY updated_at DESC LIMIT ${MAX_SESSIONS})
  `);
}

/** Bump a session's recency (and record the model it last used). */
export async function touchSession(id: string, modelId?: string): Promise<void> {
  await db()
    .update(chatSessions)
    .set({ updatedAt: Date.now(), ...(modelId ? { modelId } : {}) })
    .where(eq(chatSessions.id, id));
}

/** Append one message to a session. */
export async function appendMessage(
  sessionId: string,
  message: {
    role: 'user' | 'assistant';
    content: string;
    command?: string;
    mentions?: ChatMention[];
    sources?: SemanticHit[];
  },
): Promise<void> {
  await db().insert(chatMessages).values({
    sessionId,
    role: message.role,
    content: message.content,
    command: message.command ?? null,
    mentions: message.mentions?.length ? JSON.stringify(message.mentions) : null,
    sources: message.sources?.length ? JSON.stringify(message.sources) : null,
    createdAt: Date.now(),
  });
}

/** All sessions, most recently active first, with message counts. */
export async function listSessions(): Promise<ChatSessionMeta[]> {
  const rows = await db()
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      modelId: chatSessions.modelId,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
      messageCount: count(chatMessages.id),
    })
    .from(chatSessions)
    .leftJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
    .groupBy(chatSessions.id)
    .orderBy(desc(chatSessions.updatedAt));
  return rows.map((r) => ({ ...r, modelId: r.modelId ?? undefined }));
}

/** JSON.parse that shrugs off corrupt snapshots instead of failing the load. */
function parseJson<T>(text: string | null): T | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** A session's messages, oldest first. */
export async function listMessages(sessionId: string): Promise<StoredChatMessage[]> {
  const rows = await db()
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.id);
  return rows.map((r) => ({
    id: r.id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    command: r.command ?? undefined,
    mentions: parseJson<ChatMention[]>(r.mentions),
    sources: parseJson<SemanticHit[]>(r.sources),
    createdAt: r.createdAt,
  }));
}

export async function renameSession(id: string, title: string): Promise<void> {
  await db().update(chatSessions).set({ title }).where(eq(chatSessions.id, id));
}

/** Delete a session; its messages cascade. */
export async function removeSession(id: string): Promise<void> {
  await db().delete(chatSessions).where(eq(chatSessions.id, id));
}
