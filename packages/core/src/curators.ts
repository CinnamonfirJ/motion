/**
 * Moment confirmation + Founding Curator selection (PRD §16, §17).
 *
 * Deterministic and platform-independent: the same reaction set always yields the same
 * curator list and ranks, regardless of which client the reactions came from. One user
 * occupies at most one founding slot (PRD §17/§35 multi-device abuse).
 */
import type { ConfirmationConfig, CuratorConfig } from "./config.js";
import type { ReactionType } from "./types.js";

export interface CuratorReaction {
  userId: string;
  walletAddress: string;
  type: ReactionType;
  streamTimeMs: number;
  serverTimeMs: number;
}

export interface ConfirmationResult {
  confirmed: boolean;
  totalReactions: number;
  uniqueReactors: number;
  reason: "confirmed" | "below-total" | "below-unique";
}

/**
 * Decide whether a candidate Moment has enough independent, sustained participation to
 * become a confirmed Moment. Evaluated over the reactions belonging to the candidate
 * (from spike window start through the confirmation deadline).
 */
export function evaluateConfirmation(
  reactions: CuratorReaction[],
  cfg: ConfirmationConfig
): ConfirmationResult {
  const unique = new Set(reactions.map((r) => r.userId));
  const totalReactions = reactions.length;
  const uniqueReactors = unique.size;

  if (totalReactions < cfg.minTotalReactions) {
    return { confirmed: false, totalReactions, uniqueReactors, reason: "below-total" };
  }
  if (uniqueReactors < cfg.minUniqueReactors) {
    return { confirmed: false, totalReactions, uniqueReactors, reason: "below-unique" };
  }
  return { confirmed: true, totalReactions, uniqueReactors, reason: "confirmed" };
}

export interface SelectedCurator {
  userId: string;
  walletAddress: string;
  rank: number;
  qualifyingStreamTimeMs: number;
  qualifyingServerTimeMs: number;
}

/**
 * Deterministically select Founding Curators.
 *
 * Rules (PRD §17):
 *  - Only reactions at or before `confirmationServerTimeMs` qualify.
 *  - Each user is represented by their EARLIEST qualifying reaction.
 *  - Ordering is by authoritative server time, then stream time, then userId (total order).
 *  - The first N unique users become Founding Curators, ranked 1..N.
 *  - Immutable once produced by the caller at confirmation time.
 */
export function selectFoundingCurators(
  reactions: CuratorReaction[],
  confirmationServerTimeMs: number,
  cfg: CuratorConfig
): SelectedCurator[] {
  // Earliest qualifying reaction per user.
  const earliest = new Map<string, CuratorReaction>();
  for (const r of reactions) {
    if (r.serverTimeMs > confirmationServerTimeMs) continue;
    const cur = earliest.get(r.userId);
    if (!cur || isEarlier(r, cur)) earliest.set(r.userId, r);
  }

  const ordered = [...earliest.values()].sort(compareReactions);

  return ordered.slice(0, cfg.maxFoundingCurators).map((r, i) => ({
    userId: r.userId,
    walletAddress: r.walletAddress,
    rank: i + 1,
    qualifyingStreamTimeMs: r.streamTimeMs,
    qualifyingServerTimeMs: r.serverTimeMs,
  }));
}

function isEarlier(a: CuratorReaction, b: CuratorReaction): boolean {
  return compareReactions(a, b) < 0;
}

/** Total, stable ordering — authoritative server time first, deterministic tiebreaks. */
function compareReactions(a: CuratorReaction, b: CuratorReaction): number {
  if (a.serverTimeMs !== b.serverTimeMs) return a.serverTimeMs - b.serverTimeMs;
  if (a.streamTimeMs !== b.streamTimeMs) return a.streamTimeMs - b.streamTimeMs;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}
