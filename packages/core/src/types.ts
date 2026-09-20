/**
 * Domain types shared by backend + every client (PRD §34). One definition, no drift.
 */

export type Platform = "web" | "ios" | "android";

export type ReactionType = "fire" | "laugh" | "wow";

export const REACTION_TYPES: ReactionType[] = ["fire", "laugh", "wow"];

/** PRD §11 — deterministic Moment lifecycle, persisted on the backend. */
export type MomentState =
  | "NORMAL"
  | "CANDIDATE"
  | "DETECTING"
  | "CONFIRMED"
  | "CLIPPING"
  | "SETTLING"
  | "PUBLISHED"
  | "SETTLED"
  | "EXPIRED"; // candidate that failed confirmation — terminal, never rewarded

export type SettlementStatus = "pending" | "submitted" | "confirmed" | "failed";

export interface User {
  id: string;
  /** Auth identity (email or oauth subject). Never the wallet. */
  authId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  /** Embedded wallet address — provisioned silently, identical across platforms. PRD §22. */
  walletAddress: string;
  isCreator: boolean;
  createdAt: number;
}

export interface Stream {
  id: string;
  creatorId: string;
  title: string;
  /** Source video URL that is played back as synchronized "live". */
  videoUrl: string;
  /** Total loopable duration of the source video, seconds. */
  durationSec: number;
  thumbnailUrl: string | null;
  /** Server-authoritative epoch ms the stream "went live". Drives all playback + timing. PRD §8/§40. */
  startedAt: number;
  isLive: boolean;
  createdAt: number;
}

export interface Reaction {
  id: string;
  userId: string;
  walletAddress: string;
  streamId: string;
  /** Position within the stream timeline, ms since stream start. Authoritative. PRD §12/§35. */
  streamTimeMs: number;
  /** Server receive time, epoch ms. Authoritative ordering key. */
  serverTimeMs: number;
  type: ReactionType;
  platform: Platform;
  /** Set once the reaction is folded into an on-chain batch commitment. */
  batchId: string | null;
}

export interface ReactionBatch {
  id: string;
  streamId: string;
  fromServerTimeMs: number;
  toServerTimeMs: number;
  reactionCount: number;
  /** keccak256 Merkle-style root over the batch's reaction leaves. PRD §20. */
  commitment: string;
  chainStatus: SettlementStatus;
  txHash: string | null;
  createdAt: number;
}

export interface MomentMetrics {
  totalReactions: number;
  uniqueReactors: number;
  /** Per-type totals for the reaction mix display. */
  mix: Record<ReactionType, number>;
  /** Peak reactions-per-second observed, for the graph peak marker. */
  peakRate: number;
  /** Offset within the clip (seconds) where the reaction peak occurred. §34 accessible summary. */
  peakOffsetSec: number;
}

export interface Clip {
  startStreamTimeMs: number;
  endStreamTimeMs: number;
  durationSec: number;
  url: string | null;
  /** true once processing finished (or was retried successfully). */
  ready: boolean;
}

export interface FoundingCurator {
  momentId: string;
  userId: string;
  walletAddress: string;
  /** 1-based rank. #1 = earliest qualifying reaction. */
  rank: number;
  /** Authoritative stream time of their qualifying reaction. */
  qualifyingStreamTimeMs: number;
  /** Authoritative server time of their qualifying reaction (tiebreak). */
  qualifyingServerTimeMs: number;
  /** Reward units allocated to this curator (filled at settlement). */
  rewardUnits: bigint;
}

export interface Settlement {
  momentId: string;
  status: SettlementStatus;
  txHash: string | null;
  creatorAmountUnits: bigint;
  curatorPoolUnits: bigint;
  totalUnits: bigint;
  submittedAt: number | null;
  confirmedAt: number | null;
  /** Human-readable failure reason, never a raw RPC dump shown to users. */
  error: string | null;
}

export interface Moment {
  id: string;
  streamId: string;
  creatorId: string;
  state: MomentState;
  /** Detection timestamp T within the stream timeline (ms). Clip pivots on this. */
  spikeStreamTimeMs: number;
  /** Server epoch ms when the spike was detected. */
  detectedAt: number;
  /** Server epoch ms when confirmation resolved (immutably freezes curators). PRD §17. */
  confirmedAt: number | null;
  clip: Clip;
  metrics: MomentMetrics;
  foundingCurators: FoundingCurator[];
  settlement: Settlement | null;
  createdAt: number;
  updatedAt: number;
}

/** Wire shape for a reaction submitted by a client (server fills the authoritative fields). */
export interface ReactionInput {
  streamId: string;
  type: ReactionType;
  /** Client-estimated stream time; server clamps/validates against authoritative clock. */
  clientStreamTimeMs: number;
  platform: Platform;
  /** Client-generated idempotency key — dedupes retries/multi-device. PRD §12/§35. */
  eventId: string;
}
