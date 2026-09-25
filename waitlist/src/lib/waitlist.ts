import "server-only";
import { randomBytes } from "node:crypto";
import { ensureSchema, sql } from "./db";

export const ROLES = ["scout", "creator", "both"] as const;
export type Role = (typeof ROLES)[number];

export interface JoinResult {
  ok: true;
  already: boolean;
  position: number;
  referrals: number;
  referralCode: string;
  count: number;
}

export type ParsedSignup =
  | { kind: "bot" }
  | { kind: "invalid"; error: "invalid-email" }
  | { kind: "ok"; email: string; name: string | null; role: Role; ref: string | null };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const REFERRAL = /^[a-f0-9]{8}$/;

export function parseSignup(body: unknown): ParsedSignup {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  // Honeypot: people never see this field.
  if (typeof b.website === "string" && b.website.trim()) return { kind: "bot" };

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) return { kind: "invalid", error: "invalid-email" };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) || null : null;
  const role: Role = ROLES.includes(b.role as Role) ? (b.role as Role) : "scout";
  const ref = typeof b.ref === "string" && REFERRAL.test(b.ref) ? b.ref : null;
  return { kind: "ok", email, name, role, ref };
}

export async function count(): Promise<number> {
  await ensureSchema();
  const rows = await sql()`SELECT COUNT(*)::int AS count FROM waitlist`;
  return Number(rows[0]?.count ?? 0);
}

export async function join(input: { email: string; name: string | null; role: Role; ref: string | null }): Promise<JoinResult> {
  await ensureSchema();
  const q = sql();

  // ON CONFLICT DO NOTHING returns no row for an existing email, so a repeat signup keeps its
  // original place in line (including under concurrent submits of the same address).
  const inserted = await q`
    INSERT INTO waitlist (email, name, role, referral_code, referred_by)
    VALUES (${input.email}, ${input.name}, ${input.role}, ${randomBytes(4).toString("hex")}, ${input.ref})
    ON CONFLICT (email) DO NOTHING
    RETURNING id`;

  const [standing] = await q`
    WITH me AS (SELECT id, referral_code, created_at FROM waitlist WHERE email = ${input.email})
    SELECT
      me.referral_code AS "referralCode",
      (SELECT COUNT(*)::int FROM waitlist w
         WHERE w.created_at < me.created_at OR (w.created_at = me.created_at AND w.id <= me.id)) AS position,
      (SELECT COUNT(*)::int FROM waitlist w WHERE w.referred_by = me.referral_code) AS referrals,
      (SELECT COUNT(*)::int FROM waitlist) AS count
    FROM me`;
  if (!standing) throw new Error("waitlist row missing after insert");

  return {
    ok: true,
    already: inserted.length === 0,
    position: Number(standing.position),
    referrals: Number(standing.referrals),
    referralCode: String(standing.referralCode),
    count: Number(standing.count),
  };
}
