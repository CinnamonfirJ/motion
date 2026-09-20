import { ethers } from "ethers";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

/**
 * Walletless-feeling identity (PRD §22).
 *
 * A user signs in with a familiar identity (email / provider subject). Behind the scenes
 * we deterministically derive an embedded wallet from a server master mnemonic + a path
 * seeded by the auth id. The SAME auth id always resolves to the SAME wallet on web, iOS
 * and Android — no seed phrase, no extension, no network switching, no gas prompts.
 *
 * This is a self-contained embedded-wallet adapter. The seam is intentionally narrow so a
 * hosted provider (Privy / Web3Auth / Dynamic) can replace `deriveWallet` without touching
 * the rest of the product.
 */
export function deriveWallet(authId: string): { address: string; privateKey: string } {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(`moment:${authId}`));
  // uint31 index for a BIP-44 path.
  const index = Number(BigInt(hash) % 2_147_483_647n);
  const path = `m/44'/60'/0'/0/${index}`;
  const node = ethers.HDNodeWallet.fromPhrase(env.WALLET_MASTER_MNEMONIC, undefined, path);
  return { address: node.address, privateKey: node.privateKey };
}

export interface SessionClaims {
  userId: string;
}

export function issueToken(userId: string): string {
  return jwt.sign({ userId } satisfies SessionClaims, env.JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): SessionClaims | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as SessionClaims;
  } catch {
    return null;
  }
}

/** Normalize an email/handle-ish input into a stable auth id. */
export function normalizeAuthId(provider: string, subject: string): string {
  return `${provider}:${subject.trim().toLowerCase()}`;
}
