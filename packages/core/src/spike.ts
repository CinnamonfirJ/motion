/**
 * Deterministic, stream-relative spike detection (PRD §13, §14, §15).
 *
 * No AI. Pure function of the reaction history so it is trivially debuggable and testable.
 * Measures *unusual attention relative to the stream's own baseline* so small creators
 * are not disadvantaged (PRD §14).
 */
import type { SpikeConfig } from "./config.js";

/** Minimal reaction shape the detector needs. */
export interface SpikeSample {
  serverTimeMs: number;
  userId: string;
}

export interface SpikeEvaluation {
  isCandidate: boolean;
  /** Machine reason code (never shown to users — PRD §7.8). */
  reason:
    | "spike"
    | "cold-start-grace"
    | "cooldown"
    | "below-min-reactions"
    | "below-min-unique"
    | "below-multiplier";
  recentCount: number;
  uniqueRecent: number;
  recentRatePerSec: number;
  baselineRatePerSec: number;
  ratio: number;
}

export interface SpikeContext {
  now: number;
  streamStartedAt: number;
  /** Server time until which new candidates are suppressed (cooldown / prior Moment). */
  cooldownUntil?: number;
}

function countWindow(
  reactions: SpikeSample[],
  fromMs: number,
  toMs: number
): { count: number; unique: Set<string> } {
  const unique = new Set<string>();
  let count = 0;
  for (const r of reactions) {
    if (r.serverTimeMs > fromMs && r.serverTimeMs <= toMs) {
      count++;
      unique.add(r.userId);
    }
  }
  return { count, unique };
}

/**
 * Evaluate whether the stream is currently spiking.
 * `reactions` should contain at least the last `baselineWindowMs` of history; extra is fine.
 */
export function evaluateSpike(
  reactions: SpikeSample[],
  ctx: SpikeContext,
  cfg: SpikeConfig
): SpikeEvaluation {
  const { now, streamStartedAt, cooldownUntil } = ctx;

  const recent = countWindow(reactions, now - cfg.recentWindowMs, now);
  const baseline = countWindow(reactions, now - cfg.baselineWindowMs, now);

  const recentRatePerSec = recent.count / (cfg.recentWindowMs / 1000);
  const baselineEffective = Math.max(baseline.count, cfg.baselineFloor);
  const baselineRatePerSec = baselineEffective / (cfg.baselineWindowMs / 1000);
  const ratio = baselineRatePerSec > 0 ? recentRatePerSec / baselineRatePerSec : 0;

  const base = {
    recentCount: recent.count,
    uniqueRecent: recent.unique.size,
    recentRatePerSec,
    baselineRatePerSec,
    ratio,
  };

  // Cold-start grace: don't detect in a brand-new stream's opening seconds. PRD §15.
  if (now - streamStartedAt < cfg.coldStartGraceMs) {
    return { isCandidate: false, reason: "cold-start-grace", ...base };
  }
  // Cooldown after a prior detection / merge window. PRD §35.
  if (cooldownUntil && now < cooldownUntil) {
    return { isCandidate: false, reason: "cooldown", ...base };
  }
  // Absolute activity floor — protects tiny streams from a 2-reaction "spike". PRD §14/§35.
  if (recent.count < cfg.minRecentReactions) {
    return { isCandidate: false, reason: "below-min-reactions", ...base };
  }
  // Independent-crowd requirement. PRD §13/§35 (reaction spam / one loud user).
  if (recent.unique.size < cfg.minUniqueReactors) {
    return { isCandidate: false, reason: "below-min-unique", ...base };
  }
  // The relative acceleration test. PRD §13.
  if (ratio < cfg.spikeMultiplier) {
    return { isCandidate: false, reason: "below-multiplier", ...base };
  }

  return { isCandidate: true, reason: "spike", ...base };
}
