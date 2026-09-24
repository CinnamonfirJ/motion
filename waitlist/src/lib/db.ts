import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon's HTTP driver: one short request per query, no pool to keep warm. Suits serverless
// hosts and long-lived Node servers alike.

let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  client ??= neon(url);
  return client;
}

/** Creates the table on first use so a fresh deploy works without a manual migration. */
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS waitlist (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT NOT NULL UNIQUE,
      name          TEXT,
      role          TEXT NOT NULL DEFAULT 'scout' CHECK (role IN ('scout', 'creator', 'both')),
      referral_code TEXT NOT NULL UNIQUE,
      referred_by   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist (created_at, id)`;
    await q`CREATE INDEX IF NOT EXISTS idx_waitlist_referred_by ON waitlist (referred_by)`;
  })().catch((error) => {
    ready = null; // let the next request retry
    throw error;
  });
  return ready;
}
