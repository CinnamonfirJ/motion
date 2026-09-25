import { db } from "./db.js";

/**
 * Per-stream moderation: bans (permanent) and timeouts (auto-expiring). A banned/timed-out user
 * loses chat + mic-request + guest eligibility (enforced in the routes). State is authoritative in
 * Postgres; changes broadcast over the realtime hub so clients react immediately.
 */

export type BanKind = "ban" | "timeout";
export interface BanRow {
  userId: string;
  kind: BanKind;
  expiresAt: number | null;
  createdAt: number;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export const Moderation = {
  /** Ban (permanent) or timeout (durationMs) a user in a stream. Idempotent upsert by (stream,user). */
  async apply(streamId: string, userId: string, kind: BanKind, byUserId: string, durationMs?: number): Promise<void> {
    const now = Date.now();
    const expiresAt = kind === "timeout" ? now + Math.max(1_000, durationMs ?? 10 * 60_000) : null;
    await db.execute(
      `INSERT INTO stream_bans (streamId, userId, kind, expiresAt, createdAt, byUserId)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT(streamId, userId) DO UPDATE SET kind = excluded.kind, expiresAt = excluded.expiresAt, createdAt = excluded.createdAt, byUserId = excluded.byUserId`,
      [streamId, userId, kind, expiresAt, now, byUserId]
    );
  },

  async remove(streamId: string, userId: string): Promise<void> {
    await db.execute("DELETE FROM stream_bans WHERE streamId = $1 AND userId = $2", [streamId, userId]);
  },

  /** True when the user has an ACTIVE ban/timeout. Expired timeouts are lazily cleared. */
  async isBanned(streamId: string, userId: string): Promise<boolean> {
    const [row] = await db.query<{ expiresAt: number | null | string }>(
      'SELECT expiresAt AS "expiresAt" FROM stream_bans WHERE streamId = $1 AND userId = $2',
      [streamId, userId]
    );
    if (!row) return false;
    const expiresAt = num(row.expiresAt);
    if (expiresAt != null && expiresAt <= Date.now()) {
      await this.remove(streamId, userId);
      return false;
    }
    return true;
  },

  /** Active bans/timeouts for a stream (host view), joined with the user's display info. */
  async list(streamId: string): Promise<BanRow[]> {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT b.userId AS "userId", b.kind AS "kind", b.expiresAt AS "expiresAt", b.createdAt AS "createdAt",
              u.displayName AS "displayName", u.handle AS "handle", u.avatarUrl AS "avatarUrl"
         FROM stream_bans b JOIN users u ON u.id = b.userId
        WHERE b.streamId = $1 ORDER BY b.createdAt DESC`,
      [streamId]
    );
    const now = Date.now();
    const active: BanRow[] = [];
    for (const r of rows) {
      const expiresAt = num(r.expiresAt);
      if (expiresAt != null && expiresAt <= now) { void this.remove(streamId, String(r.userId)); continue; }
      active.push({
        userId: String(r.userId),
        kind: r.kind as BanKind,
        expiresAt,
        createdAt: Number(r.createdAt),
        displayName: String(r.displayName),
        handle: String(r.handle),
        avatarUrl: r.avatarUrl ? String(r.avatarUrl) : null,
      });
    }
    return active;
  },
};
