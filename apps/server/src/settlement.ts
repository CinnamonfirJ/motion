import {
  distributeReward,
  type Moment,
  type MomentConfig,
  type Settlement,
  type FoundingCurator,
} from "@moment/core";
import { getChain, momentIdHash } from "./chain.js";
import { env } from "./env.js";
import { ethers } from "ethers";

export interface SettlementOutcome {
  settlement: Settlement;
  curators: FoundingCurator[]; // with rewardUnits filled
  simulated: boolean;
}

/**
 * Settle a confirmed Moment (PRD §19, §20, §28, §35, §42).
 *
 * - Computes the reward split with @moment/core (single source of truth).
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
  const curators = [...moment.foundingCurators].sort((a, b) => a.rank - b.rank);
  const pool = cfg.reward.defaultPoolUnits;
  const dist = distributeReward(pool, curators.length, cfg.reward, cfg.curator);

  const curatorsWithReward: FoundingCurator[] = curators.map((c, i) => ({
    ...c,
    rewardUnits: dist.curatorUnits[i] ?? 0n,
  }));

  const base: Settlement = {
    momentId: moment.id,
    status: "pending",
    txHash: moment.settlement?.txHash ?? null,
    creatorAmountUnits: dist.creatorUnits,
    curatorPoolUnits: dist.curatorPoolUnits,
    totalUnits: dist.totalUnits,
    submittedAt: Date.now(),
    confirmedAt: null,
    error: null,
  };

  const chain = getChain();
  const idHash = momentIdHash(moment.id);
  const curatorAddresses = curatorsWithReward.map((c) => c.walletAddress);
  const curatorAmounts = curatorsWithReward.map((c) => c.rewardUnits);

  if (!chain.enabled || !chain.contract) {
    // Honest local simulation — deterministic pseudo-hash, idempotent by construction.
    const simHash = ethers.keccak256(ethers.toUtf8Bytes(`sim:${moment.id}`));
    return {
      settlement: { ...base, status: "confirmed", txHash: simHash, confirmedAt: Date.now() },
      curators: curatorsWithReward,
      simulated: true,
    };
  }

  const contract = chain.contract as any;
  try {
    // Reconcile if already settled on-chain (a prior attempt succeeded but we lost the receipt).
    const already: boolean = await contract.isMomentSettled(idHash);
    if (already) {
      return {
        settlement: { ...base, status: "confirmed", confirmedAt: Date.now(), error: null },
        curators: curatorsWithReward,
        simulated: false,
      };
    }

    const platformAddress = env.PLATFORM_ADDRESS || (await (chain.contract as any).runner?.getAddress?.()) || creatorWalletAddress;
    const tx = await contract.settleMoment(
      idHash,
      creatorWalletAddress,
      dist.creatorUnits,
      platformAddress,
      dist.platformUnits,
      curatorAddresses,
      curatorAmounts
    );
    const submitted: Settlement = { ...base, status: "submitted", txHash: tx.hash, submittedAt: Date.now() };
    const receipt = await tx.wait(1);
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
    return {
      settlement: { ...base, status: "failed", error: friendlyError(msg) },
      curators: curatorsWithReward,
      simulated: false,
    };
  }
}

/** Never surface raw RPC errors to users (PRD §21 UX / design §21). */
function friendlyError(_raw: string): string {
  return "Settlement is retrying automatically.";
}
