/**
 * ENNOIA Step 4 logic — unique-reactor spike detection, watch-time eligibility, weighted
 * Founding-Curator scoring, reaction category and per-second histogram.
 *
 * Pure + deterministic; imported by the backend engine and (read-only) by clients. All
 * thresholds/weights come from momentConfig.ts (SPIKE_CONFIG / CURATOR_SCORE_CONFIG) — no
 * magic numbers here.
 */
import { SPIKE_CONFIG, CURATOR_SCORE_CONFIG, CATEGORY_BY_REACTION, type MomentCategory } from "./momentConfig.js";
import type { ReactionType } from "./types.js";

// ---------------------------------------------------------------------------
// Unique-reactor spike detection (5s recent window vs rolling 60s baseline, 4× multiplier).
// Counts UNIQUE ELIGIBLE reactors, not raw taps. A reactor is eligible only after
// SPIKE_CONFIG.minimumWatchSeconds of watch time.
// ---------------------------------------------------------------------------
export interface ReactorSample {
  userId: string;
  serverTimeMs: number;
  /** Continuous watch time (ms) this user had accrued when the reaction landed. */
  watchMs: number;
}

export interface UniqueSpikeResult {
  isSpike: boolean;
  uniqueRecent: number;
  baselinePer5s: number;
  threshold: number;
  reason: "spike" | "cooldown" | "below-threshold";
}

export interface UniqueSpikeContext {
  now: number;
  /** Server time until which detection is suppressed (30s cooldown after a Moment). */
  cooldownUntil?: number;
  cfg?: { [K in keyof typeof SPIKE_CONFIG]: number };
}

/** True when enough distinct fresh viewers react inside the cold-start burst window. */
export function hasFreshReactorBurst(
  samples: ReactorSample[],
  now: number,
  windowMs: number,
  minimumWatchMs: number,
  minimumReactors: number
): boolean {
  const reactors = new Set(
    samples
      .filter((sample) =>
        sample.watchMs < minimumWatchMs
        && sample.serverTimeMs >= now - windowMs
        && sample.serverTimeMs <= now
      )
      .map((sample) => sample.userId)
  );
  return reactors.size >= minimumReactors;
}

export interface ReactorBurstResult {
  isBurst: boolean;
  uniqueRecent: number;
  threshold: number;
}

/**
 * Early-reactor burst: distinct reactors (ANY watch time) inside the last `windowMs`, versus
 * the stream's normal distinct-reactor rate over the preceding baseline. Lets "the first five
 * Scouts who tapped" surface a Moment even when they tap a few seconds apart or a mix of new
 * and long-watching viewers react — cases the strict 5s eligible-only spike misses.
 */
export function evaluateReactorBurst(
  samples: ReactorSample[],
  now: number,
  opts: { windowMs: number; baselineMs: number; minimumReactors: number; multiplier: number }
): ReactorBurstResult {
  const recent = new Set<string>();
  const baseline = new Set<string>();
  for (const s of samples) {
    if (s.serverTimeMs > now) continue;
    if (s.serverTimeMs >= now - opts.windowMs) recent.add(s.userId);
    else if (s.serverTimeMs >= now - opts.baselineMs) baseline.add(s.userId);
  }
  const windows = Math.max(1, (opts.baselineMs - opts.windowMs) / opts.windowMs);
  const threshold = Math.max(opts.minimumReactors, Math.ceil(opts.multiplier * (baseline.size / windows)));
  return { isBurst: recent.size >= threshold, uniqueRecent: recent.size, threshold };
}

export function evaluateUniqueSpike(samples: ReactorSample[], ctx: UniqueSpikeContext): UniqueSpikeResult {
  const cfg = ctx.cfg ?? SPIKE_CONFIG;
  const now = ctx.now;
  const recentMs = cfg.recentWindowSeconds * 1000;
  const baselineMs = cfg.baselineWindowSeconds * 1000;
  const minWatchMs = cfg.minimumWatchSeconds * 1000;

  const eligible = samples.filter((s) => s.watchMs >= minWatchMs);

  const recentUsers = new Set<string>();
  const baselineUsers = new Set<string>();
  for (const s of eligible) {
    if (s.serverTimeMs > now - recentMs && s.serverTimeMs <= now) recentUsers.add(s.userId);
    // Baseline = pre-spike normal: the 60s window EXCLUDING the recent 5s so the spike
    // itself doesn't inflate its own baseline.
    else if (s.serverTimeMs > now - baselineMs && s.serverTimeMs <= now - recentMs) baselineUsers.add(s.userId);
  }
  const uniqueRecent = recentUsers.size;
  // Expected unique reactors per 5s window under normal (pre-spike) activity.
  const windows = (baselineMs - recentMs) / recentMs; // 11 for (60-5)/5
  const baselinePer5s = baselineUsers.size / windows;
  const threshold = Math.max(cfg.minimumUniqueReactors, Math.ceil(cfg.multiplier * baselinePer5s));

  if (ctx.cooldownUntil && now < ctx.cooldownUntil) {
    return { isSpike: false, uniqueRecent, baselinePer5s, threshold, reason: "cooldown" };
  }
  if (uniqueRecent >= threshold) {
    return { isSpike: true, uniqueRecent, baselinePer5s, threshold, reason: "spike" };
  }
  return { isSpike: false, uniqueRecent, baselinePer5s, threshold, reason: "below-threshold" };
}

// ---------------------------------------------------------------------------
// Category (dominant reaction) + per-second histogram.
// ---------------------------------------------------------------------------
export function categoryFromMix(mix: Record<ReactionType, number>): MomentCategory {
  let best: ReactionType = "fire";
  let bestN = -1;
  // Deterministic tie order: fire, laugh, wow.
  for (const t of ["fire", "laugh", "wow"] as ReactionType[]) {
    if (mix[t] > bestN) {
      bestN = mix[t];
      best = t;
    }
  }
  return CATEGORY_BY_REACTION[best];
}

export interface HistogramBucket {
  second: number;
  fire: number;
  laugh: number;
  wow: number;
}

export interface HistogramReaction {
  streamTimeMs: number;
  type: ReactionType;
}

/** Per-second reaction histogram over [clipStartMs, clipStartMs + durationSec*1000). */
export function buildHistogram(
  reactions: HistogramReaction[],
  clipStartMs: number,
  durationSec: number
): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];
  for (let s = 0; s < Math.ceil(durationSec); s++) buckets.push({ second: s, fire: 0, laugh: 0, wow: 0 });
  for (const r of reactions) {
    const sec = Math.floor((r.streamTimeMs - clipStartMs) / 1000);
    if (sec < 0 || sec >= buckets.length) continue;
    buckets[sec]![r.type]++;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Weighted Founding-Curator scoring — reward legitimate EARLY discovery, not spam clicking.
// ---------------------------------------------------------------------------
export interface CandidateReactor {
  userId: string;
  walletAddress: string;
  /** Earliest qualifying reaction (authoritative server time). */
  firstServerTimeMs: number;
  firstStreamTimeMs: number;
  /** Accrued watch time (ms) at the qualifying reaction. */
  watchMs: number;
  /** Basic reputation counter (e.g. moments found + settled). */
  reputation: number;
  /** Anti-bot confidence in [0,1]; 1 = clean, lower = suspicious. */
  antiBotScore: number;
}

export interface ScoredCurator {
  userId: string;
  walletAddress: string;
  rank: number;
  score: number;
  qualifyingStreamTimeMs: number;
  qualifyingServerTimeMs: number;
}

/** Caps used to normalize raw factors into [0,1]. */
const WATCH_CAP_MS = 120_000; // 2 min of watch => full watch score
const REPUTATION_CAP = 20; // 20 prior moments => full reputation score

/**
 * Score and rank candidate reactors, returning the top `maxFoundingCurators`.
 * Window bounds are the candidate's [start, confirmation] server times; earlier reactions
 * inside the window score higher on timing. Deterministic: ties break by earliest server
 * time, then userId. Users are already deduplicated by the caller (one entry per user).
 */
export function scoreFoundingCurators(
  reactors: CandidateReactor[],
  windowStartMs: number,
  windowEndMs: number,
  cfg: typeof CURATOR_SCORE_CONFIG = CURATOR_SCORE_CONFIG
): ScoredCurator[] {
  const span = Math.max(1, windowEndMs - windowStartMs);
  const scored = reactors.map((r) => {
    const timing = clamp01(1 - (r.firstServerTimeMs - windowStartMs) / span); // earlier = higher
    const watch = clamp01(r.watchMs / WATCH_CAP_MS);
    const reputation = clamp01(r.reputation / REPUTATION_CAP);
    const antiBot = clamp01(r.antiBotScore);
    const score =
      cfg.timingWeight * timing +
      cfg.watchTimeWeight * watch +
      cfg.reputationWeight * reputation +
      cfg.antiBotWeight * antiBot;
    return { r, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.r.firstServerTimeMs !== b.r.firstServerTimeMs) return a.r.firstServerTimeMs - b.r.firstServerTimeMs;
    return a.r.userId < b.r.userId ? -1 : a.r.userId > b.r.userId ? 1 : 0;
  });

  return scored.slice(0, cfg.maxFoundingCurators).map((s, i) => ({
    userId: s.r.userId,
    walletAddress: s.r.walletAddress,
    rank: i + 1,
    score: Math.round(s.score * 1e6) / 1e6,
    qualifyingStreamTimeMs: s.r.firstStreamTimeMs,
    qualifyingServerTimeMs: s.r.firstServerTimeMs,
  }));
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
