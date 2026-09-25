-- ENNOIA waitlist. Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS waitlist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'scout' CHECK (role IN ('scout', 'creator', 'both')),
  referral_code TEXT NOT NULL UNIQUE,
  referred_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist (created_at, id);
CREATE INDEX IF NOT EXISTS idx_waitlist_referred_by ON waitlist (referred_by);
