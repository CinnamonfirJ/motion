/**
 * MOMENT centralized configuration (spec: "Configuration — centralize / avoid magic numbers").
 *
 * Single source of truth for feature flags, spike detection, curator scoring, success
 * thresholds, reward split, anti-cheat and demo tuning. Imported by the backend engine and
 * (read-only) by clients. Nothing here is scattered through components.
 *
 * Product name is MOMENT; ENNOIA is the internal/lore namespace.
 */

// ---------------------------------------------------------------------------
// FEATURES — legacy AXIA features are preserved in code but hidden by default.
// (motion never implemented these; the flags exist so nav/flows can gate them.)
// ---------------------------------------------------------------------------
export const FEATURES = {
  clapBattles: false,
  creatorKeys: false,
  bondingCurves: false,
  reputationTiers: false,
  backstageRooms: false,
} as const;
export type FeatureName = keyof typeof FEATURES;
export function isFeatureEnabled(name: FeatureName): boolean {
  return Boolean(FEATURES[name]);
}

// ---------------------------------------------------------------------------
// SPIKE_CONFIG — server-side, per stream. Counts UNIQUE ELIGIBLE reactors, not raw taps.
// ---------------------------------------------------------------------------
export const SPIKE_CONFIG = {
  recentWindowSeconds: 5,
  baselineWindowSeconds: 60,
  minimumUniqueReactors: 4, // N_min
  multiplier: 4, // uniqueReactors5s >= max(N_min, multiplier × rollingBaseline)
  cooldownSeconds: 30,
  /** A reactor only counts toward a spike after this much continuous watch time. */
  minimumWatchSeconds: 15,
} as const;

// ---------------------------------------------------------------------------
// CURATOR_SCORE_CONFIG — weighted early-discovery score (NOT first-five-clicks).
// Weights are relative; they are normalized at scoring time.
// ---------------------------------------------------------------------------
export const CURATOR_SCORE_CONFIG = {
  timingWeight: 0.45, // earlier qualifying reaction = higher
  watchTimeWeight: 0.25, // more genuine watch time = higher
  reputationWeight: 0.2, // basic reputation (moments found/settled)
  antiBotWeight: 0.1, // anti-bot signal (1 = clean, 0 = suspicious)
  maxFoundingCurators: 5,
} as const;

// ---------------------------------------------------------------------------
// MOMENT_SUCCESS_CONFIG — when a Moment becomes eligible for settlement.
// In DEMO_MODE the threshold is intended to resolve in ~10s so the loop is visible.
// ---------------------------------------------------------------------------
export const MOMENT_SUCCESS_CONFIG = {
  minimumViews: 25,
  minimumLikes: 8,
  minimumShares: 0,
  /** Demo shortcut: settle after this many ms once published (fast-forward drives it). */
  demoSettleAfterMs: 10_000,
} as const;

// ---------------------------------------------------------------------------
// REWARD_SPLIT — percentages total 100. Mirrored in packages/core/config.ts (basis points)
// and enforced on-chain; documented here as the human-readable source.
// ---------------------------------------------------------------------------
export const REWARD_SPLIT = {
  creator: 70,
  curators: 20,
  platform: 10,
} as const;

// ---------------------------------------------------------------------------
// ANTI_CHEAT_CONFIG — make fabricated engagement economically unattractive (MVP).
// ---------------------------------------------------------------------------
export const ANTI_CHEAT_CONFIG = {
  minimumWatchSeconds: 15,
  /** Max reactions counted per account per stream per minute (extra still animate). */
  maxReactionsPerMinute: 20,
  /** Device/IP clustering: flag-only stub; never hard-blocks legitimate use in MVP. */
  deviceClusteringEnabled: false,
  /** Rewards stay pending in escrow until settlement. */
  escrowUntilSettled: true,
  /** Minimum earned before withdrawal is offered (smallest units). */
  withdrawalThresholdUnits: 1_000_000_000_000_000n, // 0.001 MON
  /** Slashing is a stub hook only in MVP. */
  slashingEnabled: false,
} as const;

// ---------------------------------------------------------------------------
// DEMO_CONFIG — DEMO_MODE simulates INPUTS (crowd reactions) into the real pipeline;
// it must never fake settlement outputs.
// ---------------------------------------------------------------------------
export const DEMO_CONFIG = {
  /** Label shown on every simulated participant. Never disguise them as real users. */
  crowdLabel: "Demo crowd",
  defaultCrowdSize: 12,
  /** Fallback demo clip used only when the provider can't cut a real clip. */
  fallbackClipEnabled: true,
  /** Force-spike burst sends this many eligible reactions over ~4s into the real engine. */
  forceSpikeReactions: 24,
} as const;

/** Reaction → Moment category (dominant reaction wins). */
export const CATEGORY_BY_REACTION = {
  laugh: "Funny",
  fire: "Hype",
  wow: "Wow",
} as const;
export type MomentCategory = (typeof CATEGORY_BY_REACTION)[keyof typeof CATEGORY_BY_REACTION];
