import {
  DEFAULT_CONFIG,
  evaluateSpike,
  evaluateConfirmation,
  selectFoundingCurators,
  distributeReward,
  streamTimeMs,
  reconcileStreamTime,
  streamPositionSec,
  computeCommitment,
  formatUsd,
  newId,
  newEventId,
  type MomentConfig,
  type Moment,
  type Reaction,
  type ReactionType,
  type ReactionInput,
  type User,
  type FoundingCurator,
  type MomentMetrics,
  type SpikeSample,
  type CuratorReaction,
  type Clip,
  REACTION_TYPES,
} from "@moment/core";
import { assertTransition } from "@moment/core";
import { Streams, Reactions, Moments, Users, Batches } from "./store.js";
import { hub } from "./realtime.js";
import { settleMoment } from "./settlement.js";
import { getChain, hashFns, toBytes32 } from "./chain.js";
import { env } from "./env.js";

/** Product config. In a fuller build this could be per-stream; here it is one source of truth. */
export const config: MomentConfig = DEFAULT_CONFIG;

const CLIP_PROCESSING_MS = 1_500; // simulated clip build time (design §19 "Building your Moment…")

// ---------- reaction ingestion ----------
export interface IngestResult {
  ok: boolean;
  reaction?: Reaction;
  duplicate?: boolean;
  error?: string;
}

export function ingestReaction(user: User, input: ReactionInput): IngestResult {
  const stream = Streams.byId(input.streamId);
  if (!stream || !stream.isLive) return { ok: false, error: "stream-not-live" };
  if (!REACTION_TYPES.includes(input.type)) return { ok: false, error: "bad-type" };

  const now = Date.now();
  const streamTime = reconcileStreamTime(input.clientStreamTimeMs, stream.startedAt, now);

  const reaction: Reaction & { eventId: string } = {
    id: newId("rxn"),
    eventId: input.eventId || newEventId(),
    userId: user.id,
    walletAddress: user.walletAddress,
    streamId: stream.id,
    streamTimeMs: streamTime,
    serverTimeMs: now,
    type: input.type,
    platform: input.platform,
    batchId: null,
  };

  const { reaction: stored, created } = Reactions.insert(reaction);
  if (!created) return { ok: true, reaction: stored, duplicate: true };

  // Immediate client feedback + realtime propagation (PRD §12 / design §7.6).
  hub.broadcastStream(stream.id, {
    t: "reaction",
    streamId: stream.id,
    reactionType: reaction.type,
    streamTimeMs: reaction.streamTimeMs,
  });
  broadcastActivity(stream.id, now);

  // Detection runs on ingest for responsiveness; the tick loop is the safety net.
  try {
    detect(stream.id, now);
  } catch (e) {
    console.error("detect error", e);
  }

  return { ok: true, reaction: stored };
}

function broadcastActivity(streamId: string, now: number) {
  const recent = Reactions.inWindow(streamId, now - config.spike.recentWindowMs, now);
  const ratePerSec = recent.length / (config.spike.recentWindowMs / 1000);
  const recentByType = { fire: 0, laugh: 0, wow: 0 } as Record<ReactionType, number>;
  for (const r of recent) recentByType[r.type]++;

  // "Heating up": rising but not yet a Moment (design §7.4/§7.7). Never expose numbers.
  const evalr = evaluateSpike(toSamples(Reactions.inWindow(streamId, now - config.spike.baselineWindowMs, now)), {
    now,
    streamStartedAt: Streams.byId(streamId)?.startedAt ?? now,
    cooldownUntil: Moments.cooldownUntil(streamId),
  }, config.spike);
  const heatingUp = !evalr.isCandidate && evalr.ratio >= config.spike.spikeMultiplier * 0.55 && recent.length >= 3;

  hub.broadcastStream(streamId, { t: "activity", streamId, ratePerSec, recentByType, heatingUp });
}

const toSamples = (rs: Reaction[]): SpikeSample[] => rs.map((r) => ({ serverTimeMs: r.serverTimeMs, userId: r.userId }));

// ---------- detection ----------
function detect(streamId: string, now: number) {
  const stream = Streams.byId(streamId);
  if (!stream || !stream.isLive) return;
  // One active candidate per stream at a time (PRD §35 overlapping Moments -> cooldown/merge).
  if (Moments.activeForStream(streamId).length > 0) return;

  const history = Reactions.inWindow(streamId, now - config.spike.baselineWindowMs, now);
  const evalr = evaluateSpike(toSamples(history), {
    now,
    streamStartedAt: stream.startedAt,
    cooldownUntil: Moments.cooldownUntil(streamId),
  }, config.spike);
  if (!evalr.isCandidate) return;

  const spikeStreamTime = streamTimeMs(stream.startedAt, now);
  const moment: Moment = {
    id: newId("mom"),
    streamId,
    creatorId: stream.creatorId,
    state: "CANDIDATE",
    spikeStreamTimeMs: spikeStreamTime,
    detectedAt: now,
    confirmedAt: null,
    clip: emptyClip(spikeStreamTime),
    metrics: emptyMetrics(),
    foundingCurators: [],
    settlement: null,
    createdAt: now,
    updatedAt: now,
  };
  const cooldownUntil = now + config.spike.cooldownMs;
  Moments.insert(moment, cooldownUntil);

  // CANDIDATE -> DETECTING immediately: the UI shows "Moment detected" (design §7.8).
  transition(moment, "DETECTING");
  hub.broadcastStream(streamId, {
    t: "moment_detected",
    streamId,
    momentId: moment.id,
    spikeStreamTimeMs: spikeStreamTime,
  });
  console.log(`[moment] detected ${moment.id} on ${streamId} @${spikeStreamTime}ms (ratio ${evalr.ratio.toFixed(2)})`);
}

// ---------- lifecycle tick ----------
export async function tick() {
  const now = Date.now();
  for (const stream of Streams.live()) detectSafe(stream.id, now);

  for (const moment of Moments.needingWork()) {
    try {
      await advance(moment, now);
    } catch (e) {
      console.error(`advance error ${moment.id}`, e);
    }
  }
}

function detectSafe(streamId: string, now: number) {
  try {
    detect(streamId, now);
  } catch (e) {
    console.error("detect(tick) error", e);
  }
}

async function advance(moment: Moment, now: number) {
  switch (moment.state) {
    case "DETECTING":
      if (now - moment.detectedAt >= config.confirmation.windowMs) resolveConfirmation(moment, now);
      return;
    case "CONFIRMED":
      startClipping(moment, now);
      return;
    case "CLIPPING":
      if (moment.clip.ready || now - (moment.confirmedAt ?? now) >= CLIP_PROCESSING_MS) finishClipping(moment);
      return;
    case "SETTLING":
      await runSettlement(moment, now);
      return;
    case "PUBLISHED":
      // Retry settlement idempotently until confirmed (PRD §35 settlement fails).
      if (!moment.settlement || moment.settlement.status !== "confirmed") {
        await runSettlement(moment, now);
      }
      return;
  }
}

// ---------- confirmation + curators ----------
function candidateReactions(moment: Moment, deadline: number): Reaction[] {
  const from = moment.detectedAt - config.spike.recentWindowMs;
  return Reactions.inWindow(moment.streamId, from, deadline);
}

function resolveConfirmation(moment: Moment, now: number) {
  const deadline = now;
  const reactions = candidateReactions(moment, deadline);
  const curatorReactions: CuratorReaction[] = reactions.map((r) => ({
    userId: r.userId,
    walletAddress: r.walletAddress,
    type: r.type,
    streamTimeMs: r.streamTimeMs,
    serverTimeMs: r.serverTimeMs,
  }));

  const conf = evaluateConfirmation(curatorReactions, config.confirmation);
  if (!conf.confirmed) {
    transition(moment, "EXPIRED");
    hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "EXPIRED" });
    console.log(`[moment] expired ${moment.id} (${conf.reason})`);
    return;
  }

  // Freeze Founding Curators deterministically (PRD §17 immutable after confirmation).
  const selected = selectFoundingCurators(curatorReactions, deadline, config.curator);

  // Compute reward split now so the celebration can show the amount immediately ("Settling").
  const dist = distributeReward(config.reward.defaultPoolUnits, selected.length, config.reward, config.curator);
  const curators: FoundingCurator[] = selected.map((c, i) => ({
    momentId: moment.id,
    userId: c.userId,
    walletAddress: c.walletAddress,
    rank: c.rank,
    qualifyingStreamTimeMs: c.qualifyingStreamTimeMs,
    qualifyingServerTimeMs: c.qualifyingServerTimeMs,
    rewardUnits: dist.curatorUnits[i] ?? 0n,
  }));

  moment.metrics = computeMetrics(reactions, moment.spikeStreamTimeMs);
  moment.confirmedAt = now;
  moment.foundingCurators = curators;
  moment.settlement = {
    momentId: moment.id,
    status: "pending",
    txHash: null,
    creatorAmountUnits: dist.creatorUnits,
    curatorPoolUnits: dist.curatorPoolUnits,
    totalUnits: dist.totalUnits,
    submittedAt: null,
    confirmedAt: null,
    error: null,
  };

  Moments.setCurators(moment.id, curators);
  transition(moment, "CONFIRMED");

  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "CONFIRMED" });
  // Personal celebration to each Founding Curator (design §7.10, PRD §23.5).
  for (const c of curators) {
    hub.sendToUser(c.userId, {
      t: "curator",
      momentId: moment.id,
      streamId: moment.streamId,
      rank: c.rank,
      rewardUnits: c.rewardUnits.toString(),
      rewardUsd: formatUsd(c.rewardUnits, env.UNITS_PER_USD),
    });
  }

  // Commit reaction provenance for this Moment as a batch (PRD §20/§21).
  void commitBatch(moment, reactions, deadline);
  console.log(`[moment] confirmed ${moment.id} with ${curators.length} founding curators`);
}

// ---------- clipping ----------
function startClipping(moment: Moment, now: number) {
  const stream = Streams.byId(moment.streamId);
  if (!stream) return;
  moment.clip = buildClip(moment, stream.startedAt, stream.durationSec, stream.videoUrl, now, stream.isLive);
  transition(moment, "CLIPPING");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "CLIPPING" });
}

function finishClipping(moment: Moment) {
  moment.clip = { ...moment.clip, ready: true };
  Moments.update(moment);
  transition(moment, "SETTLING");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLING" });
}

/**
 * Build the 35s clip descriptor (PRD §16, §35). For fake-live we map the absolute stream
 * time into the looping source video and express the clip as a media-fragment range, so it
 * is produced on shared infra and never depends on a client retaining video (PRD §39).
 * Edge cases handled: spike within first 15s (clamp to 0) and near stream end (clamp).
 */
function buildClip(moment: Moment, startedAt: number, durationSec: number, videoUrl: string, now: number, streamLive: boolean): Clip {
  const preMs = config.clip.preRollSec * 1000;
  const postMs = config.clip.postRollSec * 1000;
  // Spike within first 15s: clip begins at stream start (PRD §35).
  const startStream = Math.max(0, moment.spikeStreamTimeMs - preMs);
  // Full 15s-before + 20s-after window. For a continuous fake-live source, all footage
  // exists in the looped file. Only clamp the tail if a real stream has actually ended.
  const idealEnd = moment.spikeStreamTimeMs + postMs;
  const liveEdge = streamTimeMs(startedAt, now);
  const endStream = streamLive ? idealEnd : Math.min(idealEnd, liveEdge);

  // Source position (seconds within the looped video) for the clip start.
  const sourceStartSec = round2(streamPositionSec(startedAt, durationSec, startedAt + startStream));
  const clipDur = round2((endStream - startStream) / 1000);
  const sourceEndSec = round2(Math.min(sourceStartSec + clipDur, durationSec));

  const url = `${videoUrl}#t=${sourceStartSec},${sourceEndSec}`;
  return {
    startStreamTimeMs: startStream,
    endStreamTimeMs: endStream,
    durationSec: clipDur,
    url,
    ready: false,
  };
}

// ---------- settlement ----------
async function runSettlement(moment: Moment, now: number) {
  // Ensure we are in a settleable state.
  if (moment.state === "SETTLING") {
    // Publish the card immediately; the reward settles behind it (PRD §11 note).
    // First move to PUBLISHED so the feed shows it while settling.
  }
  const creator = Users.byId(moment.creatorId);
  const creatorWallet = creator?.walletAddress ?? moment.foundingCurators[0]?.walletAddress ?? "";

  const outcome = await settleMoment(moment, config, creatorWallet);
  moment.settlement = outcome.settlement;

  // Persist per-curator reward units.
  Moments.setCurators(moment.id, outcome.curators);
  moment.foundingCurators = outcome.curators;

  if (moment.state === "SETTLING") {
    transition(moment, "PUBLISHED");
    hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "PUBLISHED" });
  }
  Moments.update(moment);

  hub.broadcastStream(moment.streamId, {
    t: "settlement",
    momentId: moment.id,
    status: moment.settlement.status,
    txHash: moment.settlement.txHash,
  });
  for (const c of moment.foundingCurators) {
    hub.sendToUser(c.userId, {
      t: "settlement",
      momentId: moment.id,
      status: moment.settlement.status,
      txHash: moment.settlement.txHash,
    });
  }

  if (moment.settlement.status === "confirmed" && moment.state === "PUBLISHED") {
    transition(moment, "SETTLED");
    hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLED" });
    console.log(`[moment] settled ${moment.id} ${outcome.simulated ? "(simulated)" : "(onchain)"} tx=${moment.settlement.txHash}`);
  }
}

async function commitBatch(moment: Moment, reactions: Reaction[], deadline: number) {
  if (reactions.length === 0) return;
  const leaves = reactions.map((r) => ({
    eventId: r.id,
    userId: r.userId,
    streamId: r.streamId,
    streamTimeMs: r.streamTimeMs,
    serverTimeMs: r.serverTimeMs,
    type: r.type,
  }));
  const commitment = computeCommitment(leaves, hashFns);
  const batchId = newId("bat");
  const from = Math.min(...reactions.map((r) => r.serverTimeMs));

  Batches.insert({
    id: batchId,
    streamId: moment.streamId,
    fromServerTimeMs: from,
    toServerTimeMs: deadline,
    reactionCount: reactions.length,
    commitment,
    chainStatus: "pending",
    txHash: null,
    createdAt: Date.now(),
  });
  Reactions.markBatched(reactions.map((r) => r.id), batchId);

  const chain = getChain();
  if (!chain.enabled || !chain.contract) {
    Batches.setStatus(batchId, "confirmed", null);
    return;
  }
  try {
    const contract = chain.contract as any;
    const tx = await contract.commitReactionBatch(
      toBytes32(batchId),
      toBytes32(moment.streamId),
      reactions.length,
      Math.floor(from / 1000),
      Math.floor(deadline / 1000),
      commitment
    );
    Batches.setStatus(batchId, "submitted", tx.hash);
    await tx.wait(1);
    Batches.setStatus(batchId, "confirmed", tx.hash);
  } catch (e) {
    console.error("batch commit failed", e);
    Batches.setStatus(batchId, "failed", null);
  }
}

// ---------- helpers ----------
function transition(moment: Moment, to: Moment["state"]) {
  assertTransition(moment.state, to);
  moment.state = to;
  moment.updatedAt = Date.now();
  Moments.update(moment);
}

function computeMetrics(reactions: Reaction[], spikeStreamTimeMs: number): MomentMetrics {
  const mix = { fire: 0, laugh: 0, wow: 0 } as Record<ReactionType, number>;
  const users = new Set<string>();
  for (const r of reactions) {
    mix[r.type]++;
    users.add(r.userId);
  }
  // Bucket by second relative to clip start to find the peak.
  const clipStart = Math.max(0, spikeStreamTimeMs - config.clip.preRollSec * 1000);
  const buckets = new Map<number, number>();
  for (const r of reactions) {
    const sec = Math.max(0, Math.floor((r.streamTimeMs - clipStart) / 1000));
    buckets.set(sec, (buckets.get(sec) ?? 0) + 1);
  }
  let peakRate = 0;
  let peakOffsetSec = Math.floor(config.clip.preRollSec);
  for (const [sec, count] of buckets) {
    if (count > peakRate) {
      peakRate = count;
      peakOffsetSec = sec;
    }
  }
  return {
    totalReactions: reactions.length,
    uniqueReactors: users.size,
    mix,
    peakRate,
    peakOffsetSec,
  };
}

function emptyMetrics(): MomentMetrics {
  return { totalReactions: 0, uniqueReactors: 0, mix: { fire: 0, laugh: 0, wow: 0 }, peakRate: 0, peakOffsetSec: 15 };
}
function emptyClip(spikeStreamTimeMs: number): Clip {
  return {
    startStreamTimeMs: Math.max(0, spikeStreamTimeMs - config.clip.preRollSec * 1000),
    endStreamTimeMs: spikeStreamTimeMs + config.clip.postRollSec * 1000,
    durationSec: config.clip.preRollSec + config.clip.postRollSec,
    url: null,
    ready: false,
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
