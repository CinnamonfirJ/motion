import {
  distributeReward,
  type Moment,
  type MomentConfig,
  type Settlement,
  type FoundingCurator,
} from "@ennoia/core";
import { ethers } from "ethers";
import { getChain, momentIdHash, submitSettlerTx } from "./chain.js";
import { env } from "./env.js";

/** A payable, non-zero EVM address. */
const isPayable = (a: string | null | undefined): a is string =>
  !!a && ethers.isAddress(a) && a.toLowerCase() !== ethers.ZeroAddress;

export interface SettlementOutcome {
  settlement: Settlement;
  curators: FoundingCurator[]; // with rewardUnits filled
  simulated: boolean;
}

/**
 * Settle a confirmed Moment (PRD §19, §20, §28, §35, §42).
 *
 * - Computes the reward split with @ennoia/core (single source of truth).
 * - Sends a REAL Monad transaction via MomentRewards.settleMoment when the chain is
 *   configured. The contract enforces one-settlement-per-Moment, so this is safe to retry.
 * - If the same Moment is already settled on-chain, we reconcile instead of double paying.
 * - When no RPC/settler key is configured, we run a clearly-flagged local simulation that
 *   is ALSO idempotent (the caller only settles a Moment whose settlement isn't confirmed).
 *
 * NEVER double-pays: idempotency is guaranteed on-chain (AlreadySettled) and in the engine
 * (state machine + settlement.status checks).
 */
export async function settleMoment(
  moment: Moment,
  cfg: MomentConfig,
  creatorWalletAddress: string
): Promise<SettlementOutcome> {
  // Only payable wallets can receive on-chain. An invalid/zero curator address used to make the
  // whole transaction throw and retry forever, so nobody (creator included) got paid. Ranks stay
  // as frozen at confirmation; the curator pool is split across the payable curators.
  const curators = [...moment.foundingCurators].sort((a, b) => a.rank - b.rank);
  const payable = curators.filter((c) => isPayable(c.walletAddress));
  if (payable.length !== curators.length) {
    console.warn(`[settlement] ${moment.id}: ${curators.length - payable.length} curator(s) without a payable wallet were skipped`);
  }
  const pool = cfg.reward.defaultPoolUnits;
  const dist = distributeReward(pool, payable.length, cfg.reward, cfg.curator);
  const payableReward = new Map(payable.map((c, i) => [c.userId, dist.curatorUnits[i] ?? 0n]));

  const curatorsWithReward: FoundingCurator[] = curators.map((c) => ({
    ...c,
    rewardUnits: payableReward.get(c.userId) ?? 0n,
  }));

  const base: Settlement = {
    momentId: moment.id,
    status: "pending",
    txHash: moment.settlement?.txHash ?? null,
    simulated: false,
    creatorAmountUnits: dist.creatorUnits,
    curatorPoolUnits: dist.curatorPoolUnits,
    totalUnits: dist.totalUnits,
    submittedAt: Date.now(),
    confirmedAt: null,
    error: null,
  };

  const chain = getChain();
  const idHash = momentIdHash(moment.id);
  const curatorAddresses = payable.map((c) => c.walletAddress);
  const curatorAmounts = payable.map((c) => payableReward.get(c.userId) ?? 0n);

  if (!chain.enabled || !chain.contract) {
    // Local simulation must never masquerade as a public-chain transaction.
    return {
      settlement: { ...base, status: "confirmed", txHash: null, simulated: true, confirmedAt: Date.now() },
      curators: curatorsWithReward,
      simulated: true,
    };
  }

  const contract = chain.contract as any;
  try {
    // Reconcile if already settled on-chain (a prior attempt succeeded but we lost the receipt).
    const already: boolean = await withRpcRetry("isMomentSettled", () => contract.isMomentSettled(idHash));
    if (already) {
      return {
        settlement: { ...base, status: "confirmed", confirmedAt: Date.now(), error: null },
        curators: curatorsWithReward,
        simulated: false,
      };
    }

    if (!isPayable(creatorWalletAddress)) {
      console.error(`[settlement] ${moment.id}: creator ${moment.creatorId} has no payable wallet (${creatorWalletAddress || "empty"})`);
      return {
        settlement: { ...base, status: "failed", error: "Creator wallet unavailable." },
        curators: curatorsWithReward,
        simulated: false,
      };
    }

    const settlerAddress = await chain.signer?.getAddress();
    const platformAddress = isPayable(env.PLATFORM_ADDRESS) ? env.PLATFORM_ADDRESS : (settlerAddress ?? creatorWalletAddress);
    // Resending after a transient failure is safe: the contract reverts AlreadySettled.
    const tx: ethers.ContractTransactionResponse = await withRpcRetry("settleMoment", () =>
      submitSettlerTx(() =>
        contract.settleMoment(
          idHash,
          creatorWalletAddress,
          dist.creatorUnits,
          platformAddress,
          dist.platformUnits,
          curatorAddresses,
          curatorAmounts
        )
      )
    );
    console.log(`[settlement] ${moment.id} submitted tx=${tx.hash}`);
    const submitted: Settlement = { ...base, status: "submitted", txHash: tx.hash, submittedAt: Date.now() };
    // Once broadcast, only retry waiting on the known hash — never resend.
    const receipt = await withRpcRetry("waitForReceipt", () => chain.provider!.waitForTransaction(tx.hash, 1, 60_000));
    console.log(`[settlement] ${moment.id} receipt status=${receipt?.status} tx=${tx.hash}`);
    return {
      settlement: {
        ...submitted,
        status: receipt && receipt.status === 1 ? "confirmed" : "failed",
        confirmedAt: Date.now(),
        error: receipt && receipt.status === 1 ? null : "Transaction reverted",
      },
      curators: curatorsWithReward,
      simulated: false,
    };
  } catch (err: any) {
    // If it reverted because it was already settled, treat as success (idempotent).
    const msg = String(err?.shortMessage ?? err?.message ?? err);
    if (/AlreadySettled/i.test(msg)) {
      return {
        settlement: { ...base, status: "confirmed", confirmedAt: Date.now() },
        curators: curatorsWithReward,
        simulated: false,
      };
    }
    console.error(`[settlement] ${moment.id} failed: ${msg}`);
    return {
      settlement: { ...base, status: "failed", error: friendlyError(msg) },
      curators: curatorsWithReward,
      simulated: false,
    };
  }
}

/** Transient Monad RPC failures worth retrying. Reverts (AlreadySettled, InsufficientPool) are not. */
function isTransientRpcError(err: any): boolean {
  const code = err?.code;
  if (code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "SERVER_ERROR" || code === "UNKNOWN_ERROR") return true;
  const msg = String(err?.shortMessage ?? err?.message ?? err);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|socket hang up|429|rate limit|timeout|nonce too low|replacement/i.test(msg);
}

/** Exponential backoff (1s, 2s, 4s) for transient RPC errors; rethrows anything else immediately. */
async function withRpcRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i >= attempts || !isTransientRpcError(err)) throw err;
      const delayMs = 1000 * 2 ** (i - 1);
      console.warn(`[settlement] ${label} failed (attempt ${i}/${attempts}), retrying in ${delayMs}ms:`, err?.shortMessage ?? err?.message ?? err);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Never surface raw RPC errors to users (PRD §21 UX / design §21). */
function friendlyError(_raw: string): string {
  return "Settlement is retrying automatically.";
}
