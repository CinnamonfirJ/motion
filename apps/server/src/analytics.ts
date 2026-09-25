import { db } from "./db.js";

/**
 * Read-only stream analytics from the primary DB. Realtime presence (viewers/peak/unique/watch
 * time) comes from the hub; these are the persisted counters (reactions, Moments, followers).
 */

export interface LatestFollower {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  at: number;
}

export const Analytics = {
  async reactionCount(streamId: string): Promise<number> {
    const [r] = await db.query<{ c: number | string }>("SELECT COUNT(*) AS c FROM reactions WHERE streamId = $1", [streamId]);
    return Number(r?.c ?? 0);
  },
  async momentCount(streamId: string): Promise<number> {
    const [r] = await db.query<{ c: number | string }>("SELECT COUNT(*) AS c FROM moments WHERE streamId = $1", [streamId]);
    return Number(r?.c ?? 0);
  },
  async followerCount(creatorId: string): Promise<number> {
    const [r] = await db.query<{ c: number | string }>("SELECT COUNT(*) AS c FROM follows WHERE followingId = $1", [creatorId]);
    return Number(r?.c ?? 0);
  },
  /** Followers gained since the stream went live (real "new followers", not an estimate). */
  async newFollowers(creatorId: string, sinceMs: number): Promise<number> {
    const [r] = await db.query<{ c: number | string }>("SELECT COUNT(*) AS c FROM follows WHERE followingId = $1 AND createdAt >= $2", [creatorId, sinceMs]);
    return Number(r?.c ?? 0);
  },
  async latestFollower(creatorId: string): Promise<LatestFollower | null> {
    const [r] = await db.query<Record<string, unknown>>(
      `SELECT u.displayName AS "displayName", u.handle AS "handle", u.avatarUrl AS "avatarUrl", f.createdAt AS "at"
         FROM follows f JOIN users u ON u.id = f.followerId
        WHERE f.followingId = $1 ORDER BY f.createdAt DESC LIMIT 1`,
      [creatorId]
    );
    return r ? { displayName: String(r.displayName), handle: String(r.handle), avatarUrl: r.avatarUrl ? String(r.avatarUrl) : null, at: Number(r.at) } : null;
  },
};
