import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import postgres, { type Sql } from "postgres";
import { env } from "./env.js";

type Primitive = string | number | boolean | null;
type Params = readonly Primitive[];
type SqlitePrimitive = string | number | null;

export interface DatabaseClient {
  readonly dialect: "postgres" | "sqlite";
  query<T extends Record<string, unknown>>(statement: string, params?: Params): Promise<T[]>;
  execute(statement: string, params?: Params): Promise<number>;
  transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function sqliteStatement(statement: string, params: Params): { statement: string; params: SqlitePrimitive[] } {
  const ordered: SqlitePrimitive[] = [];
  const converted = statement.replace(/\$(\d+)/g, (_match, index) => {
    const item = params[Number(index) - 1] ?? null;
    ordered.push(typeof item === "boolean" ? Number(item) : item);
    return "?";
  });
  return { statement: converted, params: ordered };
}

function sqliteClient(path: string): DatabaseClient {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const client: DatabaseClient = {
    dialect: "sqlite",
    async query<T extends Record<string, unknown>>(statement: string, params: Params = []): Promise<T[]> {
      const converted = sqliteStatement(statement, params);
      return sqlite.prepare(converted.statement).all(...converted.params) as T[];
    },
    async execute(statement: string, params: Params = []): Promise<number> {
      const converted = sqliteStatement(statement, params);
      const result = sqlite.prepare(converted.statement).run(...converted.params);
      return Number(result.changes);
    },
    async transaction<T>(work: (transaction: DatabaseClient) => Promise<T>): Promise<T> {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = await work(client);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async close(): Promise<void> {
      sqlite.close();
    },
  };
  return client;
}

function postgresClient(url: string, existing?: Sql): DatabaseClient {
  const sql = existing ?? postgres(url, {
    max: Number(process.env.DB_POOL_SIZE ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: "require",
    transform: { undefined: null },
  });

  return {
    dialect: "postgres",
    async query<T extends Record<string, unknown>>(statement: string, params: Params = []): Promise<T[]> {
      return (await sql.unsafe(statement, [...params] as never[])) as unknown as T[];
    },
    async execute(statement: string, params: Params = []): Promise<number> {
      const result = await sql.unsafe(statement, [...params] as never[]);
      return result.count;
    },
    async transaction<T>(work: (transaction: DatabaseClient) => Promise<T>): Promise<T> {
      return sql.begin(async (transactionSql) => work(postgresClient(url, transactionSql as unknown as Sql))) as Promise<T>;
    },
    async close(): Promise<void> {
      if (!existing) await sql.end({ timeout: 5 });
    },
  };
}

export const db: DatabaseClient = env.DATABASE_URL ? postgresClient(env.DATABASE_URL) : sqliteClient(env.DB_PATH);

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  authId TEXT UNIQUE NOT NULL,
  privyId TEXT,
  displayName TEXT NOT NULL,
  handle TEXT NOT NULL,
  avatarUrl TEXT,
  walletAddress TEXT NOT NULL,
  isCreator BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_privy_unique ON users(privyId) WHERE privyId IS NOT NULL;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credentialId TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publicKey TEXT,
  createdAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credentials(userId);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  creatorId TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  videoUrl TEXT NOT NULL DEFAULT '',
  durationSec DOUBLE PRECISION NOT NULL DEFAULT 0,
  thumbnailUrl TEXT,
  startedAt BIGINT NOT NULL,
  endedAt BIGINT,
  isLive BOOLEAN NOT NULL DEFAULT TRUE,
  egressId TEXT,
  recordingPrefix TEXT,
  recordingStartedAt BIGINT,
  createdAt BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS stream_presence (
  streamId TEXT PRIMARY KEY REFERENCES streams(id) ON DELETE CASCADE,
  hostConnected BOOLEAN NOT NULL DEFAULT FALSE,
  hostDisconnectedAt BIGINT,
  updatedAt BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS stream_speakers (
  streamId TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  canCamera BOOLEAN NOT NULL DEFAULT FALSE,
  canScreenShare BOOLEAN NOT NULL DEFAULT FALSE,
  updatedAt BIGINT NOT NULL,
  PRIMARY KEY (streamId, userId)
);
CREATE INDEX IF NOT EXISTS idx_stream_speakers_status ON stream_speakers(streamId, status);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  eventId TEXT UNIQUE NOT NULL,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  walletAddress TEXT NOT NULL,
  streamId TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  streamTimeMs BIGINT NOT NULL,
  serverTimeMs BIGINT NOT NULL,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  watchTimeMs BIGINT NOT NULL DEFAULT 0,
  batchId TEXT
);
CREATE INDEX IF NOT EXISTS idx_reactions_stream_time ON reactions(streamId, serverTimeMs);

CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  streamId TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  creatorId TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL,
  spikeStreamTimeMs BIGINT NOT NULL,
  detectedAt BIGINT NOT NULL,
  confirmedAt BIGINT,
  clip TEXT NOT NULL,
  metrics TEXT NOT NULL,
  settlement TEXT,
  cooldownUntil BIGINT,
  createdAt BIGINT NOT NULL,
  updatedAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moments_stream ON moments(streamId);
CREATE INDEX IF NOT EXISTS idx_moments_state ON moments(state);

CREATE TABLE IF NOT EXISTS moment_views (
  momentId TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  viewerKey TEXT NOT NULL,
  viewedAt BIGINT NOT NULL,
  PRIMARY KEY (momentId, viewerKey)
);
CREATE INDEX IF NOT EXISTS idx_moment_views_time ON moment_views(momentId, viewedAt);

CREATE TABLE IF NOT EXISTS founding_curators (
  momentId TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  walletAddress TEXT NOT NULL,
  rank INTEGER NOT NULL,
  qualifyingStreamTimeMs BIGINT NOT NULL,
  qualifyingServerTimeMs BIGINT NOT NULL,
  rewardUnits TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (momentId, userId)
);
CREATE INDEX IF NOT EXISTS idx_curators_user ON founding_curators(userId);

CREATE TABLE IF NOT EXISTS reaction_batches (
  id TEXT PRIMARY KEY,
  streamId TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  fromServerTimeMs BIGINT NOT NULL,
  toServerTimeMs BIGINT NOT NULL,
  reactionCount INTEGER NOT NULL,
  commitment TEXT NOT NULL,
  chainStatus TEXT NOT NULL,
  txHash TEXT,
  createdAt BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporterId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  createdAt BIGINT NOT NULL,
  resolvedAt BIGINT
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, createdAt);

CREATE TABLE IF NOT EXISTS blocked_users (
  blockerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blockedId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt BIGINT NOT NULL,
  PRIMARY KEY (blockerId, blockedId)
);

CREATE TABLE IF NOT EXISTS follows (
  followerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followingId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt BIGINT NOT NULL,
  PRIMARY KEY (followerId, followingId)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(followingId);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ownerId TEXT NOT NULL REFERENCES users(id),
  createdAt BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_members (
  communityId TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joinedAt BIGINT NOT NULL,
  PRIMARY KEY (communityId, userId)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  authorId TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL DEFAULT '',
  mediaJson TEXT NOT NULL DEFAULT '[]',
  linkUrl TEXT,
  streamId TEXT REFERENCES streams(id),
  momentId TEXT REFERENCES moments(id),
  communityId TEXT REFERENCES communities(id),
  replyToId TEXT REFERENCES posts(id),
  quotePostId TEXT REFERENCES posts(id),
  repostOfId TEXT REFERENCES posts(id),
  createdAt BIGINT NOT NULL,
  deletedAt BIGINT
);
CREATE INDEX IF NOT EXISTS idx_posts_recent ON posts(createdAt);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(authorId, createdAt);
CREATE INDEX IF NOT EXISTS idx_posts_reply ON posts(replyToId, createdAt);
CREATE INDEX IF NOT EXISTS idx_posts_community ON posts(communityId, createdAt);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_one_repost ON posts(authorId, repostOfId) WHERE repostOfId IS NOT NULL AND deletedAt IS NULL;

CREATE TABLE IF NOT EXISTS post_likes (
  postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt BIGINT NOT NULL,
  PRIMARY KEY (postId, userId)
);
CREATE TABLE IF NOT EXISTS post_views (
  postId TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewerKey TEXT NOT NULL,
  viewedAt BIGINT NOT NULL,
  PRIMARY KEY (postId, viewerKey)
);
CREATE TABLE IF NOT EXISTS post_uploads (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  objectKey TEXT UNIQUE NOT NULL,
  contentType TEXT NOT NULL,
  maxBytes BIGINT NOT NULL,
  createdAt BIGINT NOT NULL,
  usedAt BIGINT
);

CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL,
  privyId TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  lastError TEXT,
  createdAt BIGINT NOT NULL,
  updatedAt BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_status ON account_deletion_jobs(status, updatedAt);
`;

export async function migrateDatabase(): Promise<void> {
  if (db.dialect === "sqlite") {
    const sqlite = db as DatabaseClient;
    const legacyColumns = await sqlite.query<{ name: string }>("PRAGMA table_info(moment_views)");
    if (legacyColumns.length > 0 && !legacyColumns.some((column) => column.name === "viewerKey")) {
      await sqlite.transaction(async (transaction) => {
        await transaction.execute("ALTER TABLE moment_views RENAME TO moment_views_legacy");
        await transaction.execute(`CREATE TABLE moment_views (
          momentId TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
          viewerKey TEXT NOT NULL,
          viewedAt BIGINT NOT NULL,
          PRIMARY KEY (momentId, viewerKey)
        )`);
        const legacy = await transaction.query<{ momentId: string; count: number }>(
          "SELECT momentId, count FROM moment_views_legacy"
        );
        const migratedAt = Date.now();
        for (const row of legacy) {
          for (let index = 0; index < Number(row.count); index++) {
            await transaction.execute(
              "INSERT INTO moment_views (momentId, viewerKey, viewedAt) VALUES ($1, $2, $3)",
              [row.momentId, `legacy:${index}`, migratedAt]
            );
          }
        }
        await transaction.execute("DROP TABLE moment_views_legacy");
      });
    }
    for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) {
      await sqlite.execute(statement);
    }
    const streamColumns = await sqlite.query<{ name: string }>("PRAGMA table_info(streams)");
    if (!streamColumns.some((column) => column.name === "recordingStartedAt")) {
      await sqlite.execute("ALTER TABLE streams ADD COLUMN recordingStartedAt BIGINT");
    }
    return;
  }
  await db.execute(schema);
  await db.execute("ALTER TABLE streams ADD COLUMN IF NOT EXISTS recordingStartedAt BIGINT");
}

export async function databaseReady(): Promise<boolean> {
  try {
    const rows = await db.query<{ ok: number }>("SELECT 1 AS ok");
    return Number(rows[0]?.ok) === 1;
  } catch {
    return false;
  }
}
