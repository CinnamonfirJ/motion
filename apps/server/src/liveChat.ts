import { db } from "./db.js";
import { newId, type User } from "@ennoia/core";

/**
 * Live text chat for streams. Complements ENNOIA's reaction-curation model: reactions drive
 * Moments/rewards, chat is the room's conversation. Messages persist (short history + moderation)
 * and broadcast over the realtime hub. Host or author may delete a message.
 */

export const CHAT_MAX_LEN = 300;
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 6; // per user, per stream — matches the reaction anti-spam posture

export interface ChatAuthor {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}
export interface ChatMessageDTO {
  id: string;
  streamId: string;
  body: string;
  createdAt: number;
  author: ChatAuthor;
}

const buckets = new Map<string, number[]>(); // `${streamId}:${userId}` -> recent send timestamps

function rateLimited(streamId: string, userId: string, now: number): boolean {
  const key = `${streamId}:${userId}`;
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

function mapRow(r: any): ChatMessageDTO {
  return {
    id: r.id,
    streamId: r.streamId,
    body: r.body,
    createdAt: Number(r.createdAt),
    author: { id: r.userId, displayName: r.displayName, handle: r.handle, avatarUrl: r.avatarUrl ?? null },
  };
}

export const LiveChat = {
  /** Validate + persist a message. Returns the stored DTO, or an error code. */
  async send(streamId: string, user: User, raw: string): Promise<{ ok: true; message: ChatMessageDTO } | { ok: false; error: "empty" | "too-long" | "rate-limited" }> {
    const body = raw.replace(/\s+/g, " ").trim();
    if (!body) return { ok: false, error: "empty" };
    if (body.length > CHAT_MAX_LEN) return { ok: false, error: "too-long" };
    const now = Date.now();
    if (rateLimited(streamId, user.id, now)) return { ok: false, error: "rate-limited" };

    const id = newId("msg");
    await db.execute(
      "INSERT INTO stream_messages (id, streamId, userId, body, createdAt) VALUES ($1,$2,$3,$4,$5)",
      [id, streamId, user.id, body, now]
    );
    return {
      ok: true,
      message: { id, streamId, body, createdAt: now, author: { id: user.id, displayName: user.displayName, handle: user.handle, avatarUrl: user.avatarUrl } },
    };
  },

  /** Recent messages, oldest→newest, excluding deleted. `before` paginates older history. */
  async recent(streamId: string, limit = 50, before?: number): Promise<ChatMessageDTO[]> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const rows = await db.query<Record<string, unknown>>(
      `SELECT m.id AS "id", m.streamId AS "streamId", m.userId AS "userId", m.body AS "body", m.createdAt AS "createdAt",
              u.displayName AS "displayName", u.handle AS "handle", u.avatarUrl AS "avatarUrl"
         FROM stream_messages m JOIN users u ON u.id = m.userId
        WHERE m.streamId = $1 AND m.deletedAt IS NULL AND ($2 = 0 OR m.createdAt < $2)
        ORDER BY m.createdAt DESC LIMIT $3`,
      [streamId, before ?? 0, capped]
    );
    return rows.map(mapRow).reverse();
  },

  /** Soft-delete a message. Host or the message author only (authorization enforced in the route). */
  async remove(messageId: string, byUserId: string): Promise<boolean> {
    const changed = await db.execute(
      "UPDATE stream_messages SET deletedAt = $1, deletedBy = $2 WHERE id = $3 AND deletedAt IS NULL",
      [Date.now(), byUserId, messageId]
    );
    return changed > 0;
  },

  async authorOf(messageId: string): Promise<{ userId: string; streamId: string } | null> {
    const [row] = await db.query<{ userId: string; streamId: string }>(
      'SELECT userId AS "userId", streamId AS "streamId" FROM stream_messages WHERE id = $1',
      [messageId]
    );
    return row ?? null;
  },
};
