import { db } from "./db.js";
import {
  newId,
  type User,
  type Stream,
  type Reaction,
  type Moment,
  type MomentState,
  type FoundingCurator,
  type Settlement,
  type Clip,
  type MomentMetrics,
  type ReactionType,
  type Platform,
  type ReactionBatch,
} from "@moment/core";

// ---------- helpers ----------
const bool = (n: unknown) => Number(n) === 1;
function serializeSettlement(s: Settlement | null): string | null {
  if (!s) return null;
  return JSON.stringify({
    ...s,
    creatorAmountUnits: s.creatorAmountUnits.toString(),
    curatorPoolUnits: s.curatorPoolUnits.toString(),
    totalUnits: s.totalUnits.toString(),
  });
}
function parseSettlement(json: string | null): Settlement | null {
  if (!json) return null;
  const o = JSON.parse(json);
  return {
    ...o,
    creatorAmountUnits: BigInt(o.creatorAmountUnits),
    curatorPoolUnits: BigInt(o.curatorPoolUnits),
    totalUnits: BigInt(o.totalUnits),
  };
}

// ---------- users ----------
export const Users = {
  byAuthId(authId: string): User | null {
    const r = db.prepare("SELECT * FROM users WHERE authId = ?").get(authId) as any;
    return r ? mapUser(r) : null;
  },
  byId(id: string): User | null {
    const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    return r ? mapUser(r) : null;
  },
  create(u: Omit<User, "id" | "createdAt"> & { id?: string }): User {
    const user: User = { id: u.id ?? newId("usr"), createdAt: Date.now(), ...u } as User;
    db.prepare(
      `INSERT INTO users (id, authId, displayName, handle, avatarUrl, walletAddress, isCreator, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.id,
      user.authId,
      user.displayName,
      user.handle,
      user.avatarUrl,
      user.walletAddress,
      user.isCreator ? 1 : 0,
      user.createdAt
    );
    return user;
  },
};
function mapUser(r: any): User {
  return {
    id: r.id,
    authId: r.authId,
    displayName: r.displayName,
    handle: r.handle,
    avatarUrl: r.avatarUrl,
    walletAddress: r.walletAddress,
    isCreator: bool(r.isCreator),
    createdAt: r.createdAt,
  };
}

// ---------- streams ----------
export const Streams = {
  all(): Stream[] {
    return (db.prepare("SELECT * FROM streams ORDER BY createdAt DESC").all() as any[]).map(mapStream);
  },
  live(): Stream[] {
    return (db.prepare("SELECT * FROM streams WHERE isLive = 1 ORDER BY createdAt DESC").all() as any[]).map(mapStream);
  },
  byId(id: string): Stream | null {
    const r = db.prepare("SELECT * FROM streams WHERE id = ?").get(id) as any;
    return r ? mapStream(r) : null;
  },
  upsert(s: Stream): Stream {
    db.prepare(
      `INSERT INTO streams (id, creatorId, title, videoUrl, durationSec, thumbnailUrl, startedAt, isLive, createdAt)
       VALUES (@id,@creatorId,@title,@videoUrl,@durationSec,@thumbnailUrl,@startedAt,@isLive,@createdAt)
       ON CONFLICT(id) DO UPDATE SET title=@title, isLive=@isLive, startedAt=@startedAt`
    ).run({ ...s, isLive: s.isLive ? 1 : 0 });
    return s;
  },
};
function mapStream(r: any): Stream {
  return {
    id: r.id,
    creatorId: r.creatorId,
    title: r.title,
    videoUrl: r.videoUrl,
    durationSec: r.durationSec,
    thumbnailUrl: r.thumbnailUrl,
    startedAt: r.startedAt,
    isLive: bool(r.isLive),
    createdAt: r.createdAt,
  };
}

// ---------- reactions ----------
export const Reactions = {
  /** Insert a reaction idempotently by eventId. Returns the stored reaction (existing or new). */
  insert(r: Reaction & { eventId: string }): { reaction: Reaction; created: boolean } {
    const existing = db.prepare("SELECT * FROM reactions WHERE eventId = ?").get(r.eventId) as any;
    if (existing) return { reaction: mapReaction(existing), created: false };
    db.prepare(
      `INSERT INTO reactions (id, eventId, userId, walletAddress, streamId, streamTimeMs, serverTimeMs, type, platform, watchTimeMs, batchId)
       VALUES (@id,@eventId,@userId,@walletAddress,@streamId,@streamTimeMs,@serverTimeMs,@type,@platform,@watchTimeMs,@batchId)`
    ).run({ ...r, watchTimeMs: r.watchTimeMs ?? 0, batchId: r.batchId ?? null });
    return { reaction: r, created: true };
  },
  /** Reactions for a stream within [fromServerTime, toServerTime]. */
  inWindow(streamId: string, fromServerTime: number, toServerTime: number): Reaction[] {
    return (
      db
        .prepare(
          "SELECT * FROM reactions WHERE streamId = ? AND serverTimeMs > ? AND serverTimeMs <= ? ORDER BY serverTimeMs ASC"
        )
        .all(streamId, fromServerTime, toServerTime) as any[]
    ).map(mapReaction);
  },
  countForStream(streamId: string): number {
    const r = db.prepare("SELECT COUNT(*) c FROM reactions WHERE streamId = ?").get(streamId) as any;
    return r.c;
  },
  uncommitted(streamId: string, toServerTime: number): Reaction[] {
    return (
      db
        .prepare("SELECT * FROM reactions WHERE streamId = ? AND batchId IS NULL AND serverTimeMs <= ? ORDER BY serverTimeMs ASC")
        .all(streamId, toServerTime) as any[]
    ).map(mapReaction);
  },
  markBatched(ids: string[], batchId: string): void {
    const stmt = db.prepare("UPDATE reactions SET batchId = ? WHERE id = ?");
    const tx = db.prepare("SELECT 1"); // noop to keep style
    void tx;
    for (const id of ids) stmt.run(batchId, id);
  },
};
function mapReaction(r: any): Reaction & { eventId: string } {
  return {
    id: r.id,
    eventId: r.eventId,
    userId: r.userId,
    walletAddress: r.walletAddress,
    streamId: r.streamId,
    streamTimeMs: r.streamTimeMs,
    serverTimeMs: r.serverTimeMs,
    type: r.type as ReactionType,
    platform: r.platform as Platform,
    watchTimeMs: r.watchTimeMs ?? 0,
    batchId: r.batchId,
  };
}

// ---------- moments ----------
export const Moments = {
  byId(id: string): Moment | null {
    const r = db.prepare("SELECT * FROM moments WHERE id = ?").get(id) as any;
    return r ? hydrateMoment(r) : null;
  },
  cooldownUntil(streamId: string): number {
    const r = db
      .prepare("SELECT MAX(cooldownUntil) m FROM moments WHERE streamId = ?")
      .get(streamId) as any;
    return r?.m ?? 0;
  },
  activeForStream(streamId: string): Moment[] {
    return (
      db
        .prepare("SELECT * FROM moments WHERE streamId = ? AND state IN ('CANDIDATE','DETECTING','CONFIRMED','CLIPPING','SETTLING') ORDER BY createdAt DESC")
        .all(streamId) as any[]
    ).map(hydrateMoment);
  },
  publicFeed(limit = 50): Moment[] {
    return (
      db
        .prepare("SELECT * FROM moments WHERE state IN ('PUBLISHED','SETTLED') ORDER BY confirmedAt DESC LIMIT ?")
        .all(limit) as any[]
    ).map(hydrateMoment);
  },
  needingWork(): Moment[] {
    return (
      db
        .prepare("SELECT * FROM moments WHERE state IN ('CANDIDATE','DETECTING','CONFIRMED','CLIPPING','SETTLING','PUBLISHED')")
        .all() as any[]
    ).map(hydrateMoment);
  },
  insert(m: Moment, cooldownUntil: number): void {
    db.prepare(
      `INSERT INTO moments (id, streamId, creatorId, state, spikeStreamTimeMs, detectedAt, confirmedAt, clip, metrics, settlement, cooldownUntil, createdAt, updatedAt)
       VALUES (@id,@streamId,@creatorId,@state,@spikeStreamTimeMs,@detectedAt,@confirmedAt,@clip,@metrics,@settlement,@cooldownUntil,@createdAt,@updatedAt)`
    ).run({
      id: m.id,
      streamId: m.streamId,
      creatorId: m.creatorId,
      state: m.state,
      spikeStreamTimeMs: m.spikeStreamTimeMs,
      detectedAt: m.detectedAt,
      confirmedAt: m.confirmedAt,
      clip: JSON.stringify(m.clip),
      metrics: JSON.stringify(m.metrics),
      settlement: serializeSettlement(m.settlement),
      cooldownUntil,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    });
  },
  update(m: Moment): void {
    db.prepare(
      `UPDATE moments SET state=@state, confirmedAt=@confirmedAt, clip=@clip, metrics=@metrics, settlement=@settlement, updatedAt=@updatedAt WHERE id=@id`
    ).run({
      id: m.id,
      state: m.state,
      confirmedAt: m.confirmedAt,
      clip: JSON.stringify(m.clip),
      metrics: JSON.stringify(m.metrics),
      settlement: serializeSettlement(m.settlement),
      updatedAt: Date.now(),
    });
  },
  setCurators(momentId: string, curators: FoundingCurator[]): void {
    const del = db.prepare("DELETE FROM founding_curators WHERE momentId = ?");
    del.run(momentId);
    const ins = db.prepare(
      `INSERT INTO founding_curators (momentId, userId, walletAddress, rank, qualifyingStreamTimeMs, qualifyingServerTimeMs, rewardUnits)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of curators) {
      ins.run(c.momentId, c.userId, c.walletAddress, c.rank, c.qualifyingStreamTimeMs, c.qualifyingServerTimeMs, c.rewardUnits.toString());
    }
  },
  curatorsFor(momentId: string): FoundingCurator[] {
    return (
      db.prepare("SELECT * FROM founding_curators WHERE momentId = ? ORDER BY rank ASC").all(momentId) as any[]
    ).map(mapCurator);
  },
  /** Moment views (success signal). */
  incrementViews(momentId: string): number {
    db.prepare(
      "INSERT INTO moment_views (momentId, count) VALUES (?, 1) ON CONFLICT(momentId) DO UPDATE SET count = count + 1"
    ).run(momentId);
    return this.viewsFor(momentId);
  },
  viewsFor(momentId: string): number {
    const r = db.prepare("SELECT count FROM moment_views WHERE momentId = ?").get(momentId) as any;
    return r?.count ?? 0;
  },
  /** Basic reputation: how many Moments this user has been a Founding Curator of. */
  reputationFor(userId: string): number {
    const r = db.prepare("SELECT COUNT(*) c FROM founding_curators WHERE userId = ?").get(userId) as any;
    return r?.c ?? 0;
  },
  curatorMomentsFor(userId: string): { moment: Moment; curator: FoundingCurator }[] {
    const rows = db.prepare("SELECT momentId FROM founding_curators WHERE userId = ?").all(userId) as any[];
    const out: { moment: Moment; curator: FoundingCurator }[] = [];
    for (const row of rows) {
      const moment = this.byId(row.momentId);
      if (!moment) continue;
      const curator = moment.foundingCurators.find((c) => c.userId === userId);
      if (curator) out.push({ moment, curator });
    }
    return out;
  },
  createdByCreator(creatorId: string): Moment[] {
    return (
      db.prepare("SELECT * FROM moments WHERE creatorId = ? AND state IN ('PUBLISHED','SETTLED') ORDER BY confirmedAt DESC").all(creatorId) as any[]
    ).map(hydrateMoment);
  },
};
function mapCurator(r: any): FoundingCurator {
  return {
    momentId: r.momentId,
    userId: r.userId,
    walletAddress: r.walletAddress,
    rank: r.rank,
    qualifyingStreamTimeMs: r.qualifyingStreamTimeMs,
    qualifyingServerTimeMs: r.qualifyingServerTimeMs,
    rewardUnits: BigInt(r.rewardUnits),
  };
}
function hydrateMoment(r: any): Moment {
  const clip = JSON.parse(r.clip) as Clip;
  const metrics = JSON.parse(r.metrics) as MomentMetrics;
  const foundingCurators = Moments.curatorsFor(r.id);
  return {
    id: r.id,
    streamId: r.streamId,
    creatorId: r.creatorId,
    state: r.state as MomentState,
    spikeStreamTimeMs: r.spikeStreamTimeMs,
    detectedAt: r.detectedAt,
    confirmedAt: r.confirmedAt,
    clip,
    metrics,
    foundingCurators,
    settlement: parseSettlement(r.settlement),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ---------- batches ----------
export const Batches = {
  insert(b: ReactionBatch): void {
    db.prepare(
      `INSERT INTO reaction_batches (id, streamId, fromServerTimeMs, toServerTimeMs, reactionCount, commitment, chainStatus, txHash, createdAt)
       VALUES (@id,@streamId,@fromServerTimeMs,@toServerTimeMs,@reactionCount,@commitment,@chainStatus,@txHash,@createdAt)`
    ).run(b as any);
  },
  setStatus(id: string, status: string, txHash: string | null): void {
    db.prepare("UPDATE reaction_batches SET chainStatus = ?, txHash = ? WHERE id = ?").run(status, txHash, id);
  },
};

export { hydrateMoment };
