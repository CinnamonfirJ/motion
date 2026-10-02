import { db, type DatabaseClient } from "./db.js";
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
} from "@ennoia/core";

type Row = Record<string, unknown>;

const value = (row: Row, name: string): unknown => row[name] ?? row[name.toLowerCase()];
const number = (row: Row, name: string): number => Number(value(row, name) ?? 0);
const bool = (input: unknown): boolean => input === true || input === 1 || input === "1" || input === "true";

function serializeSettlement(settlement: Settlement | null): string | null {
  if (!settlement) return null;
  return JSON.stringify({
    ...settlement,
    creatorAmountUnits: settlement.creatorAmountUnits.toString(),
    curatorPoolUnits: settlement.curatorPoolUnits.toString(),
    totalUnits: settlement.totalUnits.toString(),
  });
}

function parseSettlement(json: string | null): Settlement | null {
  if (!json) return null;
  const parsed = JSON.parse(json);
  return {
    ...parsed,
    creatorAmountUnits: BigInt(parsed.creatorAmountUnits),
    curatorPoolUnits: BigInt(parsed.curatorPoolUnits),
    totalUnits: BigInt(parsed.totalUnits),
  };
}

export const Users = {
  async byAuthId(authId: string): Promise<User | null> {
    const [row] = await db.query<Row>("SELECT * FROM users WHERE authId = $1", [authId]);
    return row ? mapUser(row) : null;
  },
  async byId(id: string): Promise<User | null> {
    const [row] = await db.query<Row>("SELECT * FROM users WHERE id = $1", [id]);
    return row ? mapUser(row) : null;
  },
  async byPrivyId(privyId: string): Promise<User | null> {
    const [row] = await db.query<Row>("SELECT * FROM users WHERE privyId = $1", [privyId]);
    return row ? mapUser(row) : null;
  },
  async byHandle(handle: string): Promise<User | null> {
    const [row] = await db.query<Row>("SELECT * FROM users WHERE LOWER(handle) = $1", [handle.toLowerCase()]);
    return row ? mapUser(row) : null;
  },
  async updateProfile(id: string, profile: { displayName: string; handle: string; avatarUrl: string | null }): Promise<void> {
    await db.execute("UPDATE users SET displayName = $1, handle = $2, avatarUrl = $3 WHERE id = $4", [profile.displayName, profile.handle, profile.avatarUrl, id]);
  },
  async create(input: Omit<User, "id" | "createdAt"> & { id?: string }): Promise<User> {
    const user: User = {
      ...input,
      id: input.id ?? newId("usr"),
      createdAt: Date.now(),
      privyId: input.privyId ?? null,
    } as User;
    await db.execute(
      `INSERT INTO users (id, authId, privyId, displayName, handle, avatarUrl, walletAddress, isCreator, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user.id, user.authId, user.privyId ?? null, user.displayName, user.handle, user.avatarUrl, user.walletAddress, user.isCreator, user.createdAt]
    );
    return user;
  },
  async linkPrivy(id: string, privyId: string, walletAddress?: string): Promise<void> {
    if (walletAddress) await db.execute("UPDATE users SET privyId = $1, walletAddress = $2 WHERE id = $3", [privyId, walletAddress, id]);
    else await db.execute("UPDATE users SET privyId = $1 WHERE id = $2", [privyId, id]);
  },
  async delete(id: string): Promise<void> {
    await db.execute("DELETE FROM users WHERE id = $1", [id]);
  },
  async anonymize(id: string): Promise<void> {
    await db.transaction((transaction) => anonymizeUser(transaction, id));
  },
};

async function anonymizeUser(transaction: DatabaseClient, id: string): Promise<void> {
  const zeroWallet = "0x0000000000000000000000000000000000000000";
  await transaction.execute("DELETE FROM passkey_credentials WHERE userId = $1", [id]);
  await transaction.execute("DELETE FROM reports WHERE reporterId = $1", [id]);
  await transaction.execute("DELETE FROM blocked_users WHERE blockerId = $1 OR blockedId = $1", [id]);
  await transaction.execute("DELETE FROM follows WHERE followerId = $1 OR followingId = $1", [id]);
  await transaction.execute("DELETE FROM community_members WHERE userId = $1", [id]);
  await transaction.execute("DELETE FROM post_likes WHERE userId = $1", [id]);
  await transaction.execute("DELETE FROM post_views WHERE viewerKey = $1", [`user:${id}`]);
  await transaction.execute("UPDATE posts SET body = '', mediaJson = '[]', linkUrl = NULL, deletedAt = $1 WHERE authorId = $2", [Date.now(), id]);
  await transaction.execute("UPDATE reactions SET walletAddress = $1 WHERE userId = $2", [zeroWallet, id]);
  await transaction.execute("UPDATE founding_curators SET walletAddress = $1 WHERE userId = $2", [zeroWallet, id]);
  await transaction.execute(
    "UPDATE users SET authId = $1, privyId = NULL, displayName = 'Deleted user', handle = $2, avatarUrl = NULL, walletAddress = $3, isCreator = $4 WHERE id = $5",
    [`deleted:${id}`, `deleted-${id.slice(-8)}`, zeroWallet, false, id]
  );
}

export interface AccountDeletionJob {
  id: string;
  userId: string;
  privyId: string | null;
  status: "pending" | "complete";
  attempts: number;
}

function mapAccountDeletion(row: Row): AccountDeletionJob {
  return {
    id: String(value(row, "id")),
    userId: String(value(row, "userId")),
    privyId: value(row, "privyId") ? String(value(row, "privyId")) : null,
    status: String(value(row, "status")) as AccountDeletionJob["status"],
    attempts: number(row, "attempts"),
  };
}

export const AccountDeletions = {
  async stage(user: User): Promise<AccountDeletionJob> {
    const now = Date.now();
    const job: AccountDeletionJob = {
      id: newId("del"),
      userId: user.id,
      privyId: user.privyId ?? null,
      status: "pending",
      attempts: 0,
    };
    await db.transaction(async (transaction) => {
      await transaction.execute(
        `INSERT INTO account_deletion_jobs (id, userId, privyId, status, attempts, createdAt, updatedAt)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(userId) DO UPDATE SET privyId = excluded.privyId, status = 'pending', lastError = NULL, updatedAt = excluded.updatedAt`,
        [job.id, job.userId, job.privyId, job.status, job.attempts, now, now]
      );
      await anonymizeUser(transaction, user.id);
    });
    const [stored] = await db.query<Row>("SELECT * FROM account_deletion_jobs WHERE userId = $1", [user.id]);
    if (!stored) throw new Error("account-deletion-job-not-persisted");
    return mapAccountDeletion(stored);
  },
  async byId(id: string): Promise<AccountDeletionJob | null> {
    const [row] = await db.query<Row>("SELECT * FROM account_deletion_jobs WHERE id = $1", [id]);
    return row ? mapAccountDeletion(row) : null;
  },
  async pending(limit = 20): Promise<AccountDeletionJob[]> {
    return (await db.query<Row>(
      "SELECT * FROM account_deletion_jobs WHERE status = 'pending' ORDER BY updatedAt ASC LIMIT $1",
      [limit]
    )).map(mapAccountDeletion);
  },
  async complete(id: string): Promise<void> {
    await db.execute(
      "UPDATE account_deletion_jobs SET status = 'complete', privyId = NULL, attempts = attempts + 1, lastError = NULL, updatedAt = $1 WHERE id = $2",
      [Date.now(), id]
    );
  },
  async failed(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await db.execute(
      "UPDATE account_deletion_jobs SET attempts = attempts + 1, lastError = $1, updatedAt = $2 WHERE id = $3",
      [message.slice(0, 500), Date.now(), id]
    );
  },
};

function mapUser(row: Row): User {
  return {
    id: String(value(row, "id")),
    authId: String(value(row, "authId")),
    privyId: value(row, "privyId") ? String(value(row, "privyId")) : null,
    displayName: String(value(row, "displayName")),
    handle: String(value(row, "handle")),
    avatarUrl: value(row, "avatarUrl") ? String(value(row, "avatarUrl")) : null,
    walletAddress: String(value(row, "walletAddress")),
    isCreator: bool(value(row, "isCreator")),
    createdAt: number(row, "createdAt"),
  };
}

export interface StreamRecording {
  egressId: string | null;
  recordingPrefix: string | null;
  recordingStartedAt: number | null;
  endedAt: number | null;
}

export const Streams = {
  async all(): Promise<Stream[]> {
    return (await db.query<Row>("SELECT * FROM streams ORDER BY createdAt DESC")).map(mapStream);
  },
  async live(): Promise<Stream[]> {
    return (await db.query<Row>("SELECT * FROM streams WHERE isLive = $1 ORDER BY createdAt DESC", [true])).map(mapStream);
  },
  async byId(id: string): Promise<Stream | null> {
    const [row] = await db.query<Row>("SELECT * FROM streams WHERE id = $1", [id]);
    return row ? mapStream(row) : null;
  },
  async recording(id: string): Promise<StreamRecording | null> {
    const [row] = await db.query<Row>("SELECT egressId, recordingPrefix, recordingStartedAt, endedAt FROM streams WHERE id = $1", [id]);
    if (!row) return null;
    return {
      egressId: value(row, "egressId") ? String(value(row, "egressId")) : null,
      recordingPrefix: value(row, "recordingPrefix") ? String(value(row, "recordingPrefix")) : null,
      recordingStartedAt: value(row, "recordingStartedAt") == null ? null : number(row, "recordingStartedAt"),
      endedAt: value(row, "endedAt") == null ? null : number(row, "endedAt"),
    };
  },
  async upsert(stream: Stream): Promise<Stream> {
    await db.execute(
      `INSERT INTO streams (id, creatorId, title, videoUrl, durationSec, thumbnailUrl, startedAt, isLive, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, isLive = excluded.isLive, startedAt = excluded.startedAt`,
      [stream.id, stream.creatorId, stream.title, stream.videoUrl, stream.durationSec, stream.thumbnailUrl, stream.startedAt, stream.isLive, stream.createdAt]
    );
    return stream;
  },
  async setRecording(id: string, egressId: string, recordingPrefix: string, recordingStartedAt: number): Promise<void> {
    await db.execute(
      "UPDATE streams SET egressId = $1, recordingPrefix = $2, recordingStartedAt = $3 WHERE id = $4",
      [egressId, recordingPrefix, recordingStartedAt, id]
    );
  },
  async end(id: string, endedAt = Date.now()): Promise<void> {
    await db.execute("UPDATE streams SET isLive = $1, endedAt = $2 WHERE id = $3", [false, endedAt, id]);
  },
};

function mapStream(row: Row): Stream {
  return {
    id: String(value(row, "id")),
    creatorId: String(value(row, "creatorId")),
    title: String(value(row, "title")),
    videoUrl: String(value(row, "videoUrl") ?? ""),
    durationSec: number(row, "durationSec"),
    thumbnailUrl: value(row, "thumbnailUrl") ? String(value(row, "thumbnailUrl")) : null,
    startedAt: number(row, "startedAt"),
    isLive: bool(value(row, "isLive")),
    createdAt: number(row, "createdAt"),
  };
}

export const Reactions = {
  async insert(reaction: Reaction & { eventId: string }): Promise<{ reaction: Reaction; created: boolean }> {
    const [existing] = await db.query<Row>("SELECT * FROM reactions WHERE eventId = $1", [reaction.eventId]);
    if (existing) return { reaction: mapReaction(existing), created: false };
    try {
      await db.execute(
        `INSERT INTO reactions (id, eventId, userId, walletAddress, streamId, streamTimeMs, serverTimeMs, type, platform, watchTimeMs, batchId)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [reaction.id, reaction.eventId, reaction.userId, reaction.walletAddress, reaction.streamId, reaction.streamTimeMs, reaction.serverTimeMs, reaction.type, reaction.platform, reaction.watchTimeMs ?? 0, reaction.batchId ?? null]
      );
      return { reaction, created: true };
    } catch (error) {
      const [duplicate] = await db.query<Row>("SELECT * FROM reactions WHERE eventId = $1", [reaction.eventId]);
      if (duplicate) return { reaction: mapReaction(duplicate), created: false };
      throw error;
    }
  },
  async inWindow(streamId: string, fromServerTime: number, toServerTime: number): Promise<Reaction[]> {
    return (await db.query<Row>(
      "SELECT * FROM reactions WHERE streamId = $1 AND serverTimeMs > $2 AND serverTimeMs <= $3 ORDER BY serverTimeMs ASC",
      [streamId, fromServerTime, toServerTime]
    )).map(mapReaction);
  },
  async countForStream(streamId: string): Promise<number> {
    const [row] = await db.query<Row>("SELECT COUNT(*) AS count FROM reactions WHERE streamId = $1", [streamId]);
    return Number(value(row ?? {}, "count") ?? 0);
  },
  async countForUserSince(streamId: string, userId: string, since: number): Promise<number> {
    const [row] = await db.query<Row>(
      "SELECT COUNT(*) AS count FROM reactions WHERE streamId = $1 AND userId = $2 AND serverTimeMs >= $3",
      [streamId, userId, since]
    );
    return Number(value(row ?? {}, "count") ?? 0);
  },
  async uncommitted(streamId: string, toServerTime: number): Promise<Reaction[]> {
    return (await db.query<Row>(
      "SELECT * FROM reactions WHERE streamId = $1 AND batchId IS NULL AND serverTimeMs <= $2 ORDER BY serverTimeMs ASC",
      [streamId, toServerTime]
    )).map(mapReaction);
  },
  async markBatched(ids: string[], batchId: string): Promise<void> {
    await db.transaction(async (transaction) => {
      for (const id of ids) await transaction.execute("UPDATE reactions SET batchId = $1 WHERE id = $2", [batchId, id]);
    });
  },
};

function mapReaction(row: Row): Reaction & { eventId: string } {
  return {
    id: String(value(row, "id")),
    eventId: String(value(row, "eventId")),
    userId: String(value(row, "userId")),
    walletAddress: String(value(row, "walletAddress")),
    streamId: String(value(row, "streamId")),
    streamTimeMs: number(row, "streamTimeMs"),
    serverTimeMs: number(row, "serverTimeMs"),
    type: String(value(row, "type")) as ReactionType,
    platform: String(value(row, "platform")) as Platform,
    watchTimeMs: number(row, "watchTimeMs"),
    batchId: value(row, "batchId") ? String(value(row, "batchId")) : null,
  };
}

export const Moments = {
  async byId(id: string): Promise<Moment | null> {
    const [row] = await db.query<Row>("SELECT * FROM moments WHERE id = $1", [id]);
    return row ? hydrateMoment(row) : null;
  },
  async cooldownUntil(streamId: string): Promise<number> {
    const [row] = await db.query<Row>("SELECT MAX(cooldownUntil) AS maximum FROM moments WHERE streamId = $1", [streamId]);
    return Number(value(row ?? {}, "maximum") ?? 0);
  },
  async activeForStream(streamId: string): Promise<Moment[]> {
    return hydrateMoments(await db.query<Row>(
      "SELECT * FROM moments WHERE streamId = $1 AND state IN ('CANDIDATE','DETECTING','CONFIRMED','CLIPPING','SETTLING') ORDER BY createdAt DESC",
      [streamId]
    ));
  },
  async publicFeed(limit = 50): Promise<Moment[]> {
    return hydrateMoments(await db.query<Row>(
      "SELECT * FROM moments WHERE state IN ('PUBLISHED','SETTLED') ORDER BY confirmedAt DESC LIMIT $1",
      [limit]
    ));
  },
  async needingWork(): Promise<Moment[]> {
    return hydrateMoments(await db.query<Row>(
      "SELECT * FROM moments WHERE state IN ('CANDIDATE','DETECTING','CONFIRMED','CLIPPING','SETTLING','PUBLISHED')"
    ));
  },
  async insert(moment: Moment, cooldownUntil: number): Promise<void> {
    await db.execute(
      `INSERT INTO moments (id, streamId, creatorId, state, spikeStreamTimeMs, detectedAt, confirmedAt, clip, metrics, settlement, cooldownUntil, createdAt, updatedAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [moment.id, moment.streamId, moment.creatorId, moment.state, moment.spikeStreamTimeMs, moment.detectedAt, moment.confirmedAt, JSON.stringify(moment.clip), JSON.stringify(moment.metrics), serializeSettlement(moment.settlement), cooldownUntil, moment.createdAt, moment.updatedAt]
    );
  },
  async update(moment: Moment): Promise<void> {
    await db.execute(
      "UPDATE moments SET state = $1, confirmedAt = $2, clip = $3, metrics = $4, settlement = $5, updatedAt = $6 WHERE id = $7",
      [moment.state, moment.confirmedAt, JSON.stringify(moment.clip), JSON.stringify(moment.metrics), serializeSettlement(moment.settlement), Date.now(), moment.id]
    );
  },
  async setCurators(momentId: string, curators: FoundingCurator[]): Promise<void> {
    await db.transaction(async (transaction) => {
      await transaction.execute("DELETE FROM founding_curators WHERE momentId = $1", [momentId]);
      for (const curator of curators) {
        await transaction.execute(
          `INSERT INTO founding_curators (momentId, userId, walletAddress, rank, qualifyingStreamTimeMs, qualifyingServerTimeMs, rewardUnits)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [curator.momentId, curator.userId, curator.walletAddress, curator.rank, curator.qualifyingStreamTimeMs, curator.qualifyingServerTimeMs, curator.rewardUnits.toString()]
        );
      }
    });
  },
  async curatorsFor(momentId: string): Promise<FoundingCurator[]> {
    return (await db.query<Row>("SELECT * FROM founding_curators WHERE momentId = $1 ORDER BY rank ASC", [momentId])).map(mapCurator);
  },
  async recordView(momentId: string, viewerKey: string, viewedAt = Date.now()): Promise<boolean> {
    const changes = await db.execute(
      "INSERT INTO moment_views (momentId, viewerKey, viewedAt) VALUES ($1,$2,$3) ON CONFLICT(momentId, viewerKey) DO NOTHING",
      [momentId, viewerKey, viewedAt]
    );
    return changes > 0;
  },
  async viewsFor(momentId: string): Promise<number> {
    const [row] = await db.query<Row>("SELECT COUNT(*) AS count FROM moment_views WHERE momentId = $1", [momentId]);
    return Number(value(row ?? {}, "count") ?? 0);
  },
  async reputationFor(userId: string): Promise<number> {
    const [row] = await db.query<Row>("SELECT COUNT(*) AS count FROM founding_curators WHERE userId = $1", [userId]);
    return Number(value(row ?? {}, "count") ?? 0);
  },
  async curatorMomentsFor(userId: string): Promise<{ moment: Moment; curator: FoundingCurator }[]> {
    const rows = await db.query<Row>("SELECT momentId FROM founding_curators WHERE userId = $1", [userId]);
    const output: { moment: Moment; curator: FoundingCurator }[] = [];
    for (const row of rows) {
      const moment = await this.byId(String(value(row, "momentId")));
      const curator = moment?.foundingCurators.find((entry) => entry.userId === userId);
      if (moment && curator) output.push({ moment, curator });
    }
    return output;
  },
  async createdByCreator(creatorId: string): Promise<Moment[]> {
    return hydrateMoments(await db.query<Row>(
      "SELECT * FROM moments WHERE creatorId = $1 AND state IN ('PUBLISHED','SETTLED') ORDER BY confirmedAt DESC",
      [creatorId]
    ));
  },
  async curatorLeaderboard(limit = 20): Promise<{ userId: string; totalUnits: bigint; firstFinds: number; momentsCurated: number }[]> {
    const rows = await db.query<Row>(
      `SELECT fc.userId, fc.rewardUnits, fc.rank
         FROM founding_curators fc
         JOIN moments m ON m.id = fc.momentId
        WHERE m.state IN ('PUBLISHED','SETTLED')`
    );
    const aggregate = new Map<string, { totalUnits: bigint; firstFinds: number; momentsCurated: number }>();
    for (const row of rows) {
      const userId = String(value(row, "userId"));
      const current = aggregate.get(userId) ?? { totalUnits: 0n, firstFinds: 0, momentsCurated: 0 };
      current.totalUnits += BigInt(String(value(row, "rewardUnits") ?? "0"));
      current.momentsCurated += 1;
      if (number(row, "rank") === 1) current.firstFinds += 1;
      aggregate.set(userId, current);
    }
    return [...aggregate.entries()]
      .map(([userId, totals]) => ({ userId, ...totals }))
      .sort((left, right) => (right.totalUnits > left.totalUnits ? 1 : right.totalUnits < left.totalUnits ? -1 : 0))
      .slice(0, limit);
  },
};

function mapCurator(row: Row): FoundingCurator {
  return {
    momentId: String(value(row, "momentId")),
    userId: String(value(row, "userId")),
    walletAddress: String(value(row, "walletAddress")),
    rank: number(row, "rank"),
    qualifyingStreamTimeMs: number(row, "qualifyingStreamTimeMs"),
    qualifyingServerTimeMs: number(row, "qualifyingServerTimeMs"),
    rewardUnits: BigInt(String(value(row, "rewardUnits") ?? "0")),
  };
}

export async function hydrateMoment(row: Row): Promise<Moment> {
  const clip = JSON.parse(String(value(row, "clip"))) as Clip;
  const metrics = JSON.parse(String(value(row, "metrics"))) as MomentMetrics;
  const id = String(value(row, "id"));
  return {
    id,
    streamId: String(value(row, "streamId")),
    creatorId: String(value(row, "creatorId")),
    state: String(value(row, "state")) as MomentState,
    spikeStreamTimeMs: number(row, "spikeStreamTimeMs"),
    detectedAt: number(row, "detectedAt"),
    confirmedAt: value(row, "confirmedAt") == null ? null : number(row, "confirmedAt"),
    clip,
    metrics,
    foundingCurators: await Moments.curatorsFor(id),
    settlement: parseSettlement(value(row, "settlement") ? String(value(row, "settlement")) : null),
    createdAt: number(row, "createdAt"),
    updatedAt: number(row, "updatedAt"),
  };
}

async function hydrateMoments(rows: Row[]): Promise<Moment[]> {
  return Promise.all(rows.map(hydrateMoment));
}

export const Batches = {
  async insert(batch: ReactionBatch): Promise<void> {
    await db.execute(
      `INSERT INTO reaction_batches (id, streamId, fromServerTimeMs, toServerTimeMs, reactionCount, commitment, chainStatus, txHash, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [batch.id, batch.streamId, batch.fromServerTimeMs, batch.toServerTimeMs, batch.reactionCount, batch.commitment, batch.chainStatus, batch.txHash, batch.createdAt]
    );
  },
  async setStatus(id: string, status: string, txHash: string | null): Promise<void> {
    await db.execute("UPDATE reaction_batches SET chainStatus = $1, txHash = $2 WHERE id = $3", [status, txHash, id]);
  },
};

export type ReportTarget = "stream" | "moment" | "post" | "user";

export const Safety = {
  async report(reporterId: string, targetType: ReportTarget, targetId: string, reason: string, details?: string): Promise<string> {
    const id = newId("rpt");
    await db.execute(
      "INSERT INTO reports (id, reporterId, targetType, targetId, reason, details, status, createdAt) VALUES ($1,$2,$3,$4,$5,$6,'open',$7)",
      [id, reporterId, targetType, targetId, reason, details?.trim() || null, Date.now()]
    );
    return id;
  },
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new Error("cannot-block-self");
    await db.execute(
      "INSERT INTO blocked_users (blockerId, blockedId, createdAt) VALUES ($1,$2,$3) ON CONFLICT(blockerId, blockedId) DO NOTHING",
      [blockerId, blockedId, Date.now()]
    );
  },
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await db.execute("DELETE FROM blocked_users WHERE blockerId = $1 AND blockedId = $2", [blockerId, blockedId]);
  },
  async blockedIds(blockerId: string): Promise<string[]> {
    return (await db.query<Row>("SELECT blockedId FROM blocked_users WHERE blockerId = $1", [blockerId]))
      .map((row) => String(value(row, "blockedId")));
  },
  async openReports(): Promise<Row[]> {
    return db.query<Row>("SELECT * FROM reports WHERE status = 'open' ORDER BY createdAt ASC");
  },
  async resolveReport(id: string, status: "resolved" | "dismissed"): Promise<void> {
    await db.execute("UPDATE reports SET status = $1, resolvedAt = $2 WHERE id = $3", [status, Date.now(), id]);
  },
};
