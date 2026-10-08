/**
 * Centralized, single-source-of-truth configuration for Moment's product logic.
 *
 * PRD §13/§15/§16/§17/§18 require configurable thresholds and reward parameters
 * with NO magic numbers scattered through clients. Every tunable lives here and is
 * imported by the backend Moment engine and (for display/preview) by clients.
 *
 * All windows are in milliseconds. All reward math operates on integer "units"
 * (smallest indivisible token unit, e.g. wei) to stay deterministic — see rewards.ts.
 */

export interface SpikeConfig {
  /** Recent activity window — "what's happening right now". PRD §13 ≈ 10s. */
  recentWindowMs: number;
  /** Baseline activity window — the stream's normal rhythm. PRD §13 ≈ 60s. */
  baselineWindowMs: number;
  /** recentRate / baselineRate must meet or exceed this to be a candidate. PRD §13 = 3x. */
  spikeMultiplier: number;
  /** Absolute floor of reactions inside the recent window (protects tiny streams). */
  minRecentReactions: number;
  /** Distinct users who must have reacted in the recent window. PRD §13/§35. */
  minUniqueReactors: number;
  /**
   * Cold-start baseline floor (reactions-per-baseline-window equivalent). New streams
   * have no history; without a floor, rate ratios explode. PRD §15/§35.
   */
  baselineFloor: number;
  /** Ignore spike detection entirely for the first N ms of a stream. PRD §15. */
  coldStartGraceMs: number;
  /** After a Moment is detected, suppress new candidates for this long. PRD §35 (two spikes close together). */
  cooldownMs: number;
}

export interface ConfirmationConfig {
  /** How long a CANDIDATE stays open for continued participation before it resolves. */
  windowMs: number;
  /** Total reactions (across the candidate's lifetime) required to confirm. PRD §16. */
  minTotalReactions: number;
  /** Distinct users required to confirm — proves "multiple viewers agree". PRD §16. */
  minUniqueReactors: number;
}

export interface ClipConfig {
  /** Seconds of pre-roll captured before the spike timestamp. PRD §6/§16 = 15s. */
  preRollSec: number;
  /** Seconds of post-roll captured after the spike timestamp. PRD §6 = 20s. */
  postRollSec: number;
}

export type CuratorDistribution = "equal" | "rank-weighted";

export interface CuratorConfig {
  /** Max Founding Curator slots per Moment. PRD §17 example = 5. */
  maxFoundingCurators: number;
  /**
   * A reaction only qualifies its author for founding status if it landed at or
   * before (confirmationTimestamp). We additionally require it to be within the
   * candidate lifetime. PRD §17.
   */
  distribution: CuratorDistribution;
  /** Rank weights used when distribution === "rank-weighted". PRD §18 Option B. */
  rankWeights: number[];
}

export interface RewardConfig {
  /** Default reward pool per confirmed Moment, in smallest token units (wei). */
  defaultPoolUnits: bigint;
  /** Creator share in basis points (7000 = 70%). ENNOIA REWARD_SPLIT. */
  creatorShareBps: number;
  /** Founding-Curator pool share in basis points (3000 = 30%). */
  curatorShareBps: number;
  /** Platform share in basis points (0 by default). creator + curator + platform = 10000. */
  platformShareBps: number;
}

export interface MomentConfig {
  spike: SpikeConfig;
  confirmation: ConfirmationConfig;
  clip: ClipConfig;
  curator: CuratorConfig;
  reward: RewardConfig;
}

export const BASIS_POINTS = 10_000;

/** Production/demo defaults. Override per-stream or via backend env without touching call sites. */
export const DEFAULT_CONFIG: MomentConfig = {
  spike: {
    recentWindowMs: 10_000,
    baselineWindowMs: 60_000,
    spikeMultiplier: 3,
    minRecentReactions: 6,
    minUniqueReactors: 3,
    baselineFloor: 4,
    coldStartGraceMs: 8_000,
    cooldownMs: 45_000,
  },
  confirmation: {
    windowMs: 12_000,
    minTotalReactions: 12,
    minUniqueReactors: 4,
  },
  clip: {
    preRollSec: 15,
    postRollSec: 20,
  },
  curator: {
    maxFoundingCurators: 5,
    distribution: "rank-weighted",
    rankWeights: [5, 4, 3, 2, 1],
  },
  reward: {
    // 0.02 MON per Moment by default (18-decimal token) — a small, safe demo pool draw.
    defaultPoolUnits: 20_000_000_000_000_000n,
    // PRD §18 demo split — creator pool 70% / Founding-Curator pool 30% (no platform cut).
    creatorShareBps: 7_000,
    curatorShareBps: 3_000,
    platformShareBps: 0,
  },
};

/** Deep-merge a partial override onto DEFAULT_CONFIG. Keeps unspecified fields intact. */
export function makeConfig(overrides: DeepPartial<MomentConfig> = {}): MomentConfig {
  const d = DEFAULT_CONFIG;
  return {
    spike: { ...d.spike, ...overrides.spike },
    confirmation: { ...d.confirmation, ...overrides.confirmation },
    clip: { ...d.clip, ...overrides.clip },
    curator: {
      ...d.curator,
      ...overrides.curator,
      rankWeights: overrides.curator?.rankWeights ?? d.curator.rankWeights,
    },
    reward: { ...d.reward, ...overrides.reward },
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends ReadonlyArray<unknown>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};
