import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./env.js";

/**
 * Single SQLite database (built-in node:sqlite — no native build step).
 * The backend is the authoritative store for identity, streams, reactions, Moments,
 * curators, batches and settlements (PRD §9). bigint reward units are stored as TEXT.
 */
mkdirSync(dirname(env.DB_PATH), { recursive: true });
export const db = new DatabaseSync(env.DB_PATH);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  authId TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  handle TEXT NOT NULL,
  avatarUrl TEXT,
  walletAddress TEXT NOT NULL,
  isCreator INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  creatorId TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  videoUrl TEXT NOT NULL,
  durationSec REAL NOT NULL,
  thumbnailUrl TEXT,
  startedAt INTEGER NOT NULL,
  isLive INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  eventId TEXT UNIQUE NOT NULL,
  userId TEXT NOT NULL REFERENCES users(id),
  walletAddress TEXT NOT NULL,
  streamId TEXT NOT NULL REFERENCES streams(id),
  streamTimeMs INTEGER NOT NULL,
  serverTimeMs INTEGER NOT NULL,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  batchId TEXT
);
CREATE INDEX IF NOT EXISTS idx_reactions_stream_time ON reactions(streamId, serverTimeMs);

CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  streamId TEXT NOT NULL REFERENCES streams(id),
  creatorId TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL,
  spikeStreamTimeMs INTEGER NOT NULL,
  detectedAt INTEGER NOT NULL,
  confirmedAt INTEGER,
  clip TEXT NOT NULL,        -- json
  metrics TEXT NOT NULL,     -- json
  settlement TEXT,           -- json (bigints as strings)
  cooldownUntil INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moments_stream ON moments(streamId);
CREATE INDEX IF NOT EXISTS idx_moments_state ON moments(state);

CREATE TABLE IF NOT EXISTS founding_curators (
  momentId TEXT NOT NULL REFERENCES moments(id),
  userId TEXT NOT NULL REFERENCES users(id),
  walletAddress TEXT NOT NULL,
  rank INTEGER NOT NULL,
  qualifyingStreamTimeMs INTEGER NOT NULL,
  qualifyingServerTimeMs INTEGER NOT NULL,
  rewardUnits TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (momentId, userId)
);
CREATE INDEX IF NOT EXISTS idx_curators_user ON founding_curators(userId);

CREATE TABLE IF NOT EXISTS reaction_batches (
  id TEXT PRIMARY KEY,
  streamId TEXT NOT NULL REFERENCES streams(id),
  fromServerTimeMs INTEGER NOT NULL,
  toServerTimeMs INTEGER NOT NULL,
  reactionCount INTEGER NOT NULL,
  commitment TEXT NOT NULL,
  chainStatus TEXT NOT NULL,
  txHash TEXT,
  createdAt INTEGER NOT NULL
);
`);
