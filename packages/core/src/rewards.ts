/**
 * Reward math (PRD §18, §35 "reward rounding", §42 settlement determinism).
 *
 * Works entirely in integer smallest-units (bigint) so it is exact and reproducible on
 * every platform and inside the smart contract. INVARIANT: the sum of every allocation
 * equals the total pool exactly — no unit is ever created or lost.
 */
import { BASIS_POINTS, type CuratorConfig, type RewardConfig } from "./config.js";

export interface RewardDistribution {
  totalUnits: bigint;
  creatorUnits: bigint;
  curatorPoolUnits: bigint;
  /** Platform cut (MOMENT REWARD_SPLIT — 10% by default). */
  platformUnits: bigint;
  /** Per-curator allocation, index i => rank i+1. */
  curatorUnits: bigint[];
}

/**
 * Split a Moment's reward pool three ways — creator / Founding-Curator pool / platform —
 * per MOMENT REWARD_SPLIT (70 / 20 / 10). `curatorCount` is the number of confirmed
 * Founding Curators (0..N). INVARIANT: creator + curatorPool + platform === total exactly.
 */
export function distributeReward(
  totalUnits: bigint,
  curatorCount: number,
  reward: RewardConfig,
  curator: CuratorConfig
): RewardDistribution {
  if (totalUnits < 0n) throw new Error("totalUnits must be non-negative");

  const bps = BigInt(BASIS_POINTS);
  const creatorFloor = (totalUnits * BigInt(reward.creatorShareBps)) / bps;
  const curatorFloor = (totalUnits * BigInt(reward.curatorShareBps)) / bps;
  const platformUnits = (totalUnits * BigInt(reward.platformShareBps)) / bps;
  // Any rounding dust from the bps split goes to the creator (deterministic, conserves total).
  let creatorUnits = creatorFloor + (totalUnits - creatorFloor - curatorFloor - platformUnits);
  const curatorPoolUnits = curatorFloor;

  // No curators (e.g. confirmation with zero qualifying scouts) — pool folds to creator.
  if (curatorCount <= 0) {
    creatorUnits += curatorPoolUnits;
    return { totalUnits, creatorUnits, curatorPoolUnits: 0n, platformUnits, curatorUnits: [] };
  }

  const weights = resolveWeights(curatorCount, curator);
  const curatorUnits = allocateByWeights(curatorPoolUnits, weights);

  // Sanity: conservation.
  const sum = curatorUnits.reduce((a, b) => a + b, 0n);
  if (sum !== curatorPoolUnits) {
    throw new Error("reward allocation did not conserve curator pool");
  }
  return { totalUnits, creatorUnits, curatorPoolUnits, platformUnits, curatorUnits };
}

function resolveWeights(count: number, cfg: CuratorConfig): number[] {
  if (cfg.distribution === "equal") return new Array(count).fill(1);
  const w: number[] = [];
  for (let i = 0; i < count; i++) {
    // Fall back to weight 1 for ranks beyond the configured table.
    w.push(cfg.rankWeights[i] ?? 1);
  }
  return w;
}

/**
 * Allocate `pool` across `weights` proportionally, giving leftover units one-at-a-time to
 * the earliest ranks. Deterministic; sum of result === pool exactly.
 */
function allocateByWeights(pool: bigint, weights: number[]): bigint[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return weights.map(() => 0n);

  const tw = BigInt(totalWeight);
  const base = weights.map((wt) => (pool * BigInt(wt)) / tw);
  let distributed = base.reduce((a, b) => a + b, 0n);
  let remainder = pool - distributed;

  // Hand out remaining units to earliest ranks (index order) — one unit each.
  const out = [...base];
  let i = 0;
  while (remainder > 0n) {
    out[i % out.length] = (out[i % out.length] ?? 0n) + 1n;
    remainder -= 1n;
    i++;
  }
  return out;
}

/** Convert integer token units to a human display string (e.g. USD-pegged demo value). */
export function formatUsd(units: bigint, unitsPerUsd: bigint, fractionDigits = 2): string {
  if (unitsPerUsd <= 0n) return "$0.00";
  const scale = 10n ** BigInt(fractionDigits);
  const scaled = (units * scale) / unitsPerUsd; // integer cents (or finer)
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(fractionDigits, "0");
  return `$${whole.toString()}.${frac}`;
}
