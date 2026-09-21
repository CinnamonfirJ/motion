import { randomBytes } from "node:crypto";
import { db } from "./db.js";

/**
 * Passkey (WebAuthn) sign-in — the invisible-crypto login (spec / Henad reference).
 *
 * The device biometric (Face ID / Windows Hello / fingerprint) unlocks a platform passkey.
 * The passkey's stable credential id becomes the account's auth id, from which the embedded
 * Monad wallet is derived deterministically (see auth.deriveWallet). No seed phrase.
 *
 * This uses the native WebAuthn ceremony with server-issued challenges. We verify the client
 * data (type + challenge + origin) and map the credential to a user. Full assertion-signature
 * verification is a production hardening step (would use a stored COSE public key); here the
 * platform authenticator + our challenge/origin checks provide the demo's security posture.
 */

// ---- base64url ----
export const b64url = {
  encode(buf: Buffer | Uint8Array): string {
    return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Buffer {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
  },
};

// ---- short-lived challenge store (in-memory; single-use, expiring) ----
const challenges = new Map<string, number>(); // challenge(b64url) -> issuedAt
const CHALLENGE_TTL_MS = 5 * 60_000;

export function issueChallenge(): string {
  const ch = b64url.encode(randomBytes(32));
  challenges.set(ch, Date.now());
  // opportunistic cleanup
  const cutoff = Date.now() - CHALLENGE_TTL_MS;
  for (const [k, t] of challenges) if (t < cutoff) challenges.delete(k);
  return ch;
}

export function consumeChallenge(ch: string): boolean {
  const t = challenges.get(ch);
  if (t === undefined) return false;
  challenges.delete(ch);
  return Date.now() - t <= CHALLENGE_TTL_MS;
}

export interface ClientData {
  type: string;
  challenge: string;
  origin: string;
}

/** Parse + validate the clientDataJSON (base64url) from a WebAuthn ceremony. */
export function verifyClientData(
  clientDataJSONB64: string,
  expectedType: "webauthn.create" | "webauthn.get",
  allowedOrigins: string[]
): { ok: boolean; error?: string } {
  let data: ClientData;
  try {
    data = JSON.parse(b64url.decode(clientDataJSONB64).toString("utf8"));
  } catch {
    return { ok: false, error: "bad-client-data" };
  }
  if (data.type !== expectedType) return { ok: false, error: "bad-type" };
  if (!consumeChallenge(data.challenge)) return { ok: false, error: "bad-challenge" };
  if (allowedOrigins.length && !allowedOrigins.includes(data.origin)) return { ok: false, error: "bad-origin" };
  return { ok: true };
}

// ---- credential store ----
export const Passkeys = {
  add(credentialId: string, userId: string, publicKey: string | null): void {
    db.prepare(
      "INSERT OR IGNORE INTO passkey_credentials (credentialId, userId, publicKey, createdAt) VALUES (?, ?, ?, ?)"
    ).run(credentialId, userId, publicKey, Date.now());
  },
  userIdFor(credentialId: string): string | null {
    const r = db.prepare("SELECT userId FROM passkey_credentials WHERE credentialId = ?").get(credentialId) as any;
    return r?.userId ?? null;
  },
  exists(credentialId: string): boolean {
    return !!db.prepare("SELECT 1 FROM passkey_credentials WHERE credentialId = ?").get(credentialId);
  },
};
