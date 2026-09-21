import {
  DEFAULT_CONFIG,
  evaluateConfirmation,
  distributeReward,
  streamTimeMs,
  reconcileStreamTime,
  streamPositionSec,
  computeCommitment,
  formatUsd,
  newId,
  newEventId,
  // MOMENT Step 4 logic
  evaluateUniqueSpike,
  scoreFoundingCurators,
  categoryFromMix,
  buildHistogram,
  SPIKE_CONFIG,
  CURATOR_SCORE_CONFIG,
  MOMENT_SUCCESS_CONFIG,
  ANTI_CHEAT_CONFIG,
  type MomentConfig,
  type Moment,
  type Reaction,
  type ReactionType,
  type ReactionInput,
  type User,
  type FoundingCurator,
  type MomentMetrics,
  type CuratorReaction,
  type ReactorSample,
  type CandidateReactor,
  type Clip,
  REACTION_TYPES,
} from "@moment/core";
import { assertTransition } from "@moment/core";
import { Streams, Reactions, Moments, Users, Batches } from "./store.js";
import { hub } from "./realtime.js";
import { settleMoment } from "./settlement.js";
import { getChain, hashFns, toBytes32, momentIdHash } from "./chain.js";
import { noteWatch, watchMs as getWatchMs } from "./watch.js";
import { env } from "./env.js";

/** Product config. In a fuller build this could be per-stream; here it is one source of truth. */
export const config: MomentConfig = DEFAULT_CONFIG;

const CLIP_PROCESSING_MS = 1_500; // simulated clip build time (design §19 "Building your Moment…")

/** Map reactions to unique-spike samples (userId + server time + accrued watch time). */
const toReactorSamples = (rs: Reaction[]): ReactorSample[] =>
  rs.map((r) => ({ userId: r.userId, serverTimeMs: r.serverTimeMs, watchMs: r.watchTimeMs }));

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

  // Watch-time eligibility: record first-seen, then read accrued watch time (MOMENT anti-cheat).
  noteWatch(stream.id, user.id, now);
  const watchTimeMs = getWatchMs(stream.id, user.id, now);

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
    watchTimeMs,
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
  const recentMs = SPIKE_CONFIG.recentWindowSeconds * 1000;
  const recent = Reactions.inWindow(streamId, now - recentMs, now);
  const ratePerSec = recent.length / SPIKE_CONFIG.recentWindowSeconds;
  const recentByType = { fire: 0, laugh: 0, wow: 0 } as Record<ReactionType, number>;
  for (const r of recent) recentByType[r.type]++;

  // "Heating up": unique eligible reactors rising toward the spike threshold (never expose numbers).
  const baselineMs = SPIKE_CONFIG.baselineWindowSeconds * 1000;
  const evalr = evaluateUniqueSpike(toReactorSamples(Reactions.inWindow(streamId, now - baselineMs, now)), {
    now,
    cooldownUntil: Moments.cooldownUntil(streamId),
  });
  const heatingUp = !evalr.isSpike && evalr.uniqueRecent >= Math.max(2, Math.ceil(evalr.threshold * 0.6));

  hub.broadcastStream(streamId, { t: "activity", streamId, ratePerSec, recentByType, heatingUp });
}

// ---------- detection (MOMENT unique-reactor spike) ----------
function detect(streamId: string, now: number) {
  const stream = Streams.byId(streamId);
  if (!stream || !stream.isLive) return;
  // One active candidate per stream at a time (overlapping Moments -> cooldown/merge).
  if (Moments.activeForStream(streamId).length > 0) return;

  const baselineMs = SPIKE_CONFIG.baselineWindowSeconds * 1000;
  const history = Reactions.inWindow(streamId, now - baselineMs, now);
  const evalr = evaluateUniqueSpike(toReactorSamples(history), {
    now,
    cooldownUntil: Moments.cooldownUntil(streamId),
  });
  if (!evalr.isSpike) return;

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
  const cooldownUntil = now + SPIKE_CONFIG.cooldownSeconds * 1000;
  Moments.insert(moment, cooldownUntil);

  // CANDIDATE -> DETECTING immediately: the UI shows "Moment detected" (design §7.8).
  transition(moment, "DETECTING");
  hub.broadcastStream(streamId, {
    t: "moment_detected",
    streamId,
    momentId: moment.id,
    spikeStreamTimeMs: spikeStreamTime,
  });
  console.log(
    `[moment] detected ${moment.id} on ${streamId} @${spikeStreamTime}ms ` +
      `(uniqueRecent ${evalr.uniqueRecent} >= threshold ${evalr.threshold})`
  );
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
      // Publish the card immediately as "reward pending"; payout waits on the success threshold.
      publishMoment(moment);
      return;
    case "PUBLISHED":
      // Settle once the Moment reaches its success threshold (DEMO: ~10s after confirmation).
      if ((!moment.settlement || moment.settlement.status !== "confirmed") && successMet(moment, now)) {
        await settleAndFinalize(moment, now);
      }
      return;
  }
}

/** MOMENT_SUCCESS_CONFIG gate: settle once the Moment reaches its success threshold (real
 *  views), OR — as a demo guarantee so the loop always completes — ~10s after confirmation. */
function successMet(moment: Moment, now: number): boolean {
  if (moment.confirmedAt == null) return false;
  const views = Moments.viewsFor(moment.id);
  if (views >= MOMENT_SUCCESS_CONFIG.minimumViews) return true;
  return now - moment.confirmedAt >= MOMENT_SUCCESS_CONFIG.demoSettleAfterMs;
}

function publishMoment(moment: Moment) {
  transition(moment, "PUBLISHED");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "PUBLISHED" });
  hub.broadcastStream(moment.streamId, {
    t: "settlement",
    momentId: moment.id,
    status: moment.settlement?.status ?? "pending",
    txHash: moment.settlement?.txHash ?? null,
  });
}

/** Tip a stream — funds the reward pool. Real Tipped event on-chain when configured. */
export async function tipStream(streamId: string, amountWei: bigint): Promise<{ ok: boolean; onchain: boolean; txHash: string | null }> {
  const chain = getChain();
  if (!chain.enabled || !chain.contract) return { ok: true, onchain: false, txHash: null };
  try {
    const tx = await (chain.contract as any).tip(toBytes32(streamId), { value: amountWei });
    await tx.wait(1);
    return { ok: true, onchain: true, txHash: tx.hash };
  } catch (e) {
    console.error("tip failed", e);
    return { ok: false, onchain: true, txHash: null };
  }
}

/** Demo fast-forward: settle any published-but-pending Moments on a stream right now,
 *  by driving the REAL settlement path (never fakes the transaction). */
export async function demoFastForwardSettlement(streamId: string): Promise<number> {
  const now = Date.now();
  let n = 0;
  for (const m of Moments.publicFeed(50)) {
    if (m.streamId !== streamId) continue;
    if (m.state === "PUBLISHED" && (!m.settlement || m.settlement.status !== "confirmed")) {
      await settleAndFinalize(m, now);
      n++;
    }
  }
  return n;
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

  // Freeze Founding Curators via WEIGHTED scoring (timing/watch/reputation/anti-bot) over
  // eligible, deduplicated users — reward legitimate early discovery, not spam clicking.
  const minWatchMs = ANTI_CHEAT_CONFIG.minimumWatchSeconds * 1000;
  const byUser = new Map<string, CandidateReactor>();
  for (const r of reactions) {
    if (r.watchTimeMs < minWatchMs) continue; // eligibility
    const cur = byUser.get(r.userId);
    if (!cur || r.serverTimeMs < cur.firstServerTimeMs) {
      byUser.set(r.userId, {
        userId: r.userId,
        walletAddress: r.walletAddress,
        firstServerTimeMs: r.serverTimeMs,
        firstStreamTimeMs: r.streamTimeMs,
        watchMs: r.watchTimeMs,
        reputation: Moments.reputationFor(r.userId),
        antiBotScore: 1, // MVP stub: 1 = clean (device/IP clustering is flag-only)
      });
    }
  }
  const windowStart = moment.detectedAt - SPIKE_CONFIG.recentWindowSeconds * 1000;
  const selected = scoreFoundingCurators([...byUser.values()], windowStart, deadline, CURATOR_SCORE_CONFIG);

  // Compute reward split now so the celebration can show the amount immediately ("pending").
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

  // Record the Moment + its Founding Curators on-chain immediately (createMoment / MomentCreated),
  // then commit reaction provenance as a batch.
  void createMomentOnChain(moment, curators);
  void commitBatch(moment, reactions, deadline);
  console.log(`[moment] confirmed ${moment.id} (${moment.metrics.category}) with ${curators.length} founding curators`);
}

/** Records the Moment + Founding Curators on-chain (createMoment → MomentCreated). */
const CATEGORY_CODE: Record<string, number> = { Funny: 0, Hype: 1, Wow: 2 };
async function createMomentOnChain(moment: Moment, curators: FoundingCurator[]) {
  const chain = getChain();
  if (!chain.enabled || !chain.contract) return; // simulation: nothing to record on-chain
  try {
    const contract = chain.contract as any;
    const creator = Users.byId(moment.creatorId);
    if (await contract.momentCreated(momentIdHash(moment.id))) return; // idempotent
    const tx = await contract.createMoment(
      momentIdHash(moment.id),
      toBytes32(moment.streamId),
      creator?.walletAddress ?? curators[0]?.walletAddress ?? "",
      Math.floor(moment.clip.startStreamTimeMs / 1000),
      Math.floor(moment.clip.endStreamTimeMs / 1000),
      CATEGORY_CODE[moment.metrics.category] ?? 1,
      curators.map((c) => c.walletAddress)
    );
    await tx.wait(1);
    console.log(`[moment] createMoment on-chain ${moment.id} tx=${tx.hash}`);
  } catch (e) {
    console.error("createMoment on-chain failed", e);
  }
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

// ---------- settlement (real Monad tx or idempotent simulation) ----------
async function settleAndFinalize(moment: Moment, _now: number) {
  const creator = Users.byId(moment.creatorId);
  const creatorWallet = creator?.walletAddress ?? moment.foundingCurators[0]?.walletAddress ?? "";

  const outcome = await settleMoment(moment, config, creatorWallet);
  moment.settlement = outcome.settlement;
  Moments.setCurators(moment.id, outcome.curators);
  moment.foundingCurators = outcome.curators;
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
  const durationSec = config.clip.preRollSec + config.clip.postRollSec;
  const histogram = buildHistogram(
    reactions.map((r) => ({ streamTimeMs: r.streamTimeMs, type: r.type })),
    clipStart,
    durationSec
  );
  return {
    totalReactions: reactions.length,
    uniqueReactors: users.size,
    mix,
    peakRate,
    peakOffsetSec,
    category: categoryFromMix(mix),
    histogram,
  };
}

function emptyMetrics(): MomentMetrics {
  return {
    totalReactions: 0,
    uniqueReactors: 0,
    mix: { fire: 0, laugh: 0, wow: 0 },
    peakRate: 0,
    peakOffsetSec: 15,
    category: "Hype",
    histogram: [],
  };
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
