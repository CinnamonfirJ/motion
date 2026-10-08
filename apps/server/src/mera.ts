import { ethers } from "ethers";
import { env } from "./env.js";
import { consumeChallenge, issueChallenge } from "./passkey.js";
import { getChain, submitSettlerTx } from "./chain.js";

/**
 * Mera sign-in. The client derives a Monad EOA from its passkey (WebAuthn PRF) entirely on
 * device; the server never sees a passkey, PRF output or key. It only issues a single-use
 * challenge and checks an EIP-191 signature over it, so the account *is* the address:
 * any device holding the passkey reconstructs it and signs in to the same user.
 */

const PREFIX = "ENNOIA sign-in";

function host(): string {
  try { return new URL(env.PUBLIC_WEB_URL).host; } catch { return "ennoia"; }
}

function messageFor(nonce: string): string {
  return [
    PREFIX,
    "",
    `${host()} wants you to prove you control this passkey account. This is free and sends no transaction.`,
    "",
    `Chain ID: ${env.MONAD_CHAIN_ID}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function issueMeraChallenge(): { message: string } {
  return { message: messageFor(issueChallenge()) };
}

/**
 * Verifies the signed challenge and returns the signer's checksummed address.
 * Throws `challenge-expired` / `invalid-signature`.
 */
export function verifyMeraSignIn(message: string, signature: string): string {
  const nonce = /\nNonce: ([A-Za-z0-9_-]+)$/.exec(message)?.[1];
  // Rebuild rather than trust the text: only messages we would have issued are accepted.
  if (!nonce || message !== messageFor(nonce)) throw new Error("invalid-signature");
  if (!consumeChallenge(nonce)) throw new Error("challenge-expired");
  try {
    return ethers.verifyMessage(message, signature);
  } catch {
    throw new Error("invalid-signature");
  }
}

// ---------- onboarding gas ----------
// A brand-new passkey account holds 0 MON. On testnet we send it a small drip at signup so the
// user's first in-app transaction works without a faucet detour. Serialized so concurrent
// signups never reuse a nonce.
let queue: Promise<unknown> = Promise.resolve();

export function fundNewAccount(address: string, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): void {
  const chain = getChain();
  const key = env.FAUCET_PRIVATE_KEY || env.SETTLER_PRIVATE_KEY;
  if (!chain.enabled || !chain.provider || !key || env.ONBOARD_DRIP_WEI <= 0n) return;
  if (env.MONAD_CHAIN_ID !== 10143) return; // testnet only
  const sharesSettlerKey = !env.FAUCET_PRIVATE_KEY && !!chain.signer;
  const faucet = new ethers.Wallet(key, chain.provider);
  queue = queue.then(async () => {
    try {
      if ((await chain.provider!.getBalance(address)) >= env.ONBOARD_DRIP_WEI) return;
      const request = { to: address, value: env.ONBOARD_DRIP_WEI };
      const tx = sharesSettlerKey
        ? await submitSettlerTx(() => chain.signer!.sendTransaction(request))
        : await faucet.sendTransaction(request);
      log.info({ address, hash: tx.hash }, "mera onboarding drip sent");
      await tx.wait(1, 30_000);
    } catch (error) {
      log.warn({ error, address }, "mera onboarding drip failed");
    }
  });
}
