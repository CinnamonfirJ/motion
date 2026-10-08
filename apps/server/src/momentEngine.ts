import {
  DEFAULT_CONFIG,
  evaluateConfirmation,
  distributeReward,
  selectFoundingCurators,
  streamTimeMs,
  reconcileStreamTime,
  streamPositionSec,
  computeCommitment,
  formatUsd,
  newId,
  newEventId,
  // ENNOIA Step 4 logic
  evaluateUniqueSpike,
  hasFreshReactorBurst,
  evaluateReactorBurst,
  categoryFromMix,
  buildHistogram,
  SPIKE_CONFIG,
  COLD_START_CONFIG,
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
  type Clip,
  REACTION_TYPES,
} from "@ennoia/core";
import { assertTransition } from "@ennoia/core";
import { Streams, Reactions, Moments, Users, Batches } from "./store.js";
import { hub } from "./realtime.js";
import { settleMoment } from "./settlement.js";
import { getChain, hashFns, toBytes32, momentIdHash, submitSettlerTx } from "./chain.js";
import { noteWatch, watchMs as getWatchMs } from "./watch.js";
import { env } from "./env.js";
// Circular with seed.ts (which imports ingestReaction); safe because demoCrowd() is only called at runtime.
import { demoCrowd } from "./seed.js";
import { buildPermanentMomentClip, clipUploadConfigured, permanentMediaConfigured } from "./media.js";

/** Product config. In a fuller build this could be per-stream; here it is one source of truth. */
// Minimum distinct Scouts behind a Moment (PRD §13/§16: "minimum unique Scouts: configurable").
// Applied to every detection path and to confirmation, in every mode, so a small testnet
// audience can trigger real Moments. ~3 reactions per Scout are required to confirm.
const minReactors = Math.max(1, Math.floor(env.MOMENT_MIN_REACTORS));
export const config: MomentConfig = {
  ...DEFAULT_CONFIG,
  confirmation: { ...DEFAULT_CONFIG.confirmation, minUniqueReactors: minReactors, minTotalReactions: minReactors * 3 },
};
const spikeCfg = { ...SPIKE_CONFIG, minimumUniqueReactors: minReactors } as typeof SPIKE_CONFIG;
const burstMinReactors = minReactors;
const coldStartConfirmReactions = Math.min(COLD_START_CONFIG.confirmationReactions, minReactors * 3);
console.log(`[moment] Moments need ${minReactors} unique Scout(s) (MOMENT_MIN_REACTORS)`);

const CLIP_PROCESSING_MS = 1_500; // simulated clip build time (design §19 "Building your Moment…")
const detectingStreams = new Set<string>();
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

export async function ingestReaction(user: User, input: ReactionInput): Promise<IngestResult> {
  const stream = await Streams.byId(input.streamId);
  if (!stream || !stream.isLive) return { ok: false, error: "stream-not-live" };
  if (!REACTION_TYPES.includes(input.type)) return { ok: false, error: "bad-type" };

  const now = Date.now();
  if (await Reactions.countForUserSince(stream.id, user.id, now - 60_000) >= ANTI_CHEAT_CONFIG.maxReactionsPerMinute) {
    return { ok: false, error: "reaction-rate-limited" };
  }
  const streamTime = reconcileStreamTime(input.clientStreamTimeMs, stream.startedAt, now);

  // Watch-time eligibility: record first-seen, then read accrued watch time (ENNOIA anti-cheat).
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

  const { reaction: stored, created } = await Reactions.insert(reaction);
  if (!created) return { ok: true, reaction: stored, duplicate: true };

  // Immediate client feedback + realtime propagation (PRD §12 / design §7.6).
  hub.broadcastStream(stream.id, {
    t: "reaction",
    streamId: stream.id,
    reactionType: reaction.type,
    streamTimeMs: reaction.streamTimeMs,
  });
  await broadcastActivity(stream.id, now);

  // Detection runs on ingest for responsiveness; the tick loop is the safety net.
  try {
    await detect(stream.id, now);
  } catch (e) {
    console.error("detect error", e);
  }

  return { ok: true, reaction: stored };
}

async function broadcastActivity(streamId: string, now: number) {
  const recentMs = SPIKE_CONFIG.recentWindowSeconds * 1000;
  const recent = await Reactions.inWindow(streamId, now - recentMs, now);
  const ratePerSec = recent.length / SPIKE_CONFIG.recentWindowSeconds;
  const recentByType = { fire: 0, laugh: 0, wow: 0 } as Record<ReactionType, number>;
  for (const r of recent) recentByType[r.type]++;

  // "Heating up": unique eligible reactors rising toward the spike threshold (never expose numbers).
  const baselineMs = SPIKE_CONFIG.baselineWindowSeconds * 1000;
  const evalr = evaluateUniqueSpike(toReactorSamples(await Reactions.inWindow(streamId, now - baselineMs, now)), {
    now,
    cooldownUntil: await Moments.cooldownUntil(streamId),
    cfg: spikeCfg,
  });
  const heatingUp = !evalr.isSpike && evalr.uniqueRecent >= Math.max(2, Math.ceil(evalr.threshold * 0.6));

  hub.broadcastStream(streamId, { t: "activity", streamId, ratePerSec, recentByType, heatingUp });
}

// ---------- detection (ENNOIA unique-reactor spike) ----------
async function detect(streamId: string, now: number) {
  if (detectingStreams.has(streamId)) return;
  detectingStreams.add(streamId);
  try {
    await detectForStream(streamId, now);
  } finally {
    detectingStreams.delete(streamId);
  }
}

async function detectForStream(streamId: string, now: number) {
  const stream = await Streams.byId(streamId);
  if (!stream || !stream.isLive) return;
  // One active candidate per stream at a time (overlapping Moments -> cooldown/merge).
  if ((await Moments.activeForStream(streamId)).some((moment) => !moment.clip.manual)) return;

  const baselineMs = SPIKE_CONFIG.baselineWindowSeconds * 1000;
  const history = await Reactions.inWindow(streamId, now - baselineMs, now);
  const samples = toReactorSamples(history);
  const detectionCooldownUntil = await Moments.cooldownUntil(streamId);
  const evalr = evaluateUniqueSpike(samples, {
    now,
    cooldownUntil: detectionCooldownUntil,
    cfg: spikeCfg,
  });
  const usedFreshReactors = !evalr.isSpike
    && now >= detectionCooldownUntil
    && hasFreshReactorBurst(
      samples,
      now,
      COLD_START_CONFIG.reactionBurstWindowMs,
      ANTI_CHEAT_CONFIG.minimumWatchSeconds * 1000,
      burstMinReactors
    );
  const burstResult = !evalr.isSpike
    && !usedFreshReactors
    && now >= detectionCooldownUntil
    && evaluateReactorBurst(samples, now, {
      windowMs: COLD_START_CONFIG.reactionBurstWindowMs,
      baselineMs: SPIKE_CONFIG.baselineWindowSeconds * 1000,
      minimumReactors: burstMinReactors,
      multiplier: COLD_START_CONFIG.burstMultiplier,
    });
  const usedBurst = Boolean(burstResult && burstResult.isBurst);
  const spike = evalr.isSpike || usedFreshReactors || usedBurst;
  if (!spike) return;

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
  const nextCooldownUntil = now + SPIKE_CONFIG.cooldownSeconds * 1000;
  await Moments.insert(moment, nextCooldownUntil);

  // CANDIDATE -> DETECTING immediately: the UI shows "Moment detected" (design §7.8).
  await transition(moment, "DETECTING");
  hub.broadcastStream(streamId, {
    t: "moment_detected",
    streamId,
    momentId: moment.id,
    spikeStreamTimeMs: spikeStreamTime,
  });
  const logRecent = burstResult && burstResult.isBurst
    ? burstResult.uniqueRecent
    : usedFreshReactors
      ? burstMinReactors
      : evalr.uniqueRecent;
  const logThreshold = burstResult && burstResult.isBurst
    ? burstResult.threshold
    : usedFreshReactors
      ? burstMinReactors
      : evalr.threshold;
  console.log(
    `[moment] detected ${moment.id} on ${streamId} @${spikeStreamTime}ms ` +
      `(uniqueRecent ${logRecent} >= threshold ${logThreshold})`
  );
}

// ---------- lifecycle tick ----------
export async function tick() {
  const now = Date.now();
  for (const stream of await Streams.live()) await detectSafe(stream.id, now);

  for (const moment of await Moments.needingWork()) {
    try {
      await advance(moment, now);
    } catch (e) {
      console.error(`advance error ${moment.id}`, e);
    }
  }
}

async function detectSafe(streamId: string, now: number) {
  try {
    await detect(streamId, now);
  } catch (e) {
    console.error("detect(tick) error", e);
  }
}

async function advance(moment: Moment, now: number) {
  switch (moment.state) {
    case "DETECTING":
      if (now - moment.detectedAt >= config.confirmation.windowMs) await resolveConfirmation(moment, now);
      return;
    case "CONFIRMED":
      await startClipping(moment, now);
      return;
    case "CLIPPING":
      await finishClipping(moment, now);
      return;
    case "SETTLING":
      // Publish the card immediately as "reward pending"; payout waits on the success threshold.
      await publishMoment(moment);
      return;
    case "PUBLISHED":
      if (moment.clip.manual) return;
      if (moment.settlement?.status === "confirmed") {
        await transition(moment, "SETTLED");
        hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLED" });
        console.log(`[moment] settled ${moment.id} ${moment.settlement.simulated ? "(simulated)" : "(onchain)"} tx=${moment.settlement.txHash}`);
        return;
      }
      // Settlement starts at confirmation; this only retries one that failed or never started
      // (e.g. a server restart mid-flight). The contract makes resubmission safe.
      if (now - (moment.settlement?.submittedAt ?? 0) >= SETTLE_RETRY_MS) settleInBackground(moment);
      return;
  }
}

const SETTLE_RETRY_MS = 15_000;
const settlingNow = new Set<string>();

/** Submit a Moment's Monad settlement without blocking the lifecycle (PRD §11: publishing
 *  never waits on the chain). One in-flight attempt per Moment. */
function settleInBackground(moment: Moment) {
  if (moment.clip.manual || settlingNow.has(moment.id)) return;
  settlingNow.add(moment.id);
  void settleAndFinalize(moment)
    .catch((e) => console.error(`[moment] settlement error ${moment.id}`, e))
    .finally(() => settlingNow.delete(moment.id));
}

async function publishMoment(moment: Moment) {
  await transition(moment, "PUBLISHED");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "PUBLISHED" });
  if (!moment.clip.manual) {
    hub.broadcastStream(moment.streamId, {
      t: "settlement",
      momentId: moment.id,
      status: moment.settlement?.status ?? "pending",
      txHash: moment.settlement?.txHash ?? null,
    });
  } else {
    hub.broadcastStream("feed", { t: "feed", momentId: moment.id });
  }
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
  let n = 0;
  for (const m of await Moments.publicFeed(50)) {
    if (m.streamId !== streamId) continue;
    if (!m.clip.manual && m.state === "PUBLISHED" && (!m.settlement || m.settlement.status !== "confirmed")) {
      settleInBackground(m);
      n++;
    }
  }
  return n;
}

// ---------- confirmation + curators ----------
async function candidateReactions(moment: Moment, deadline: number): Promise<Reaction[]> {
  const from = moment.detectedAt - Math.max(config.spike.recentWindowMs, COLD_START_CONFIG.reactionBurstWindowMs) - 1;
  return Reactions.inWindow(moment.streamId, from, deadline);
}

/** Demo only: eligible real Scouts outrank the seeded demo crowd, which otherwise wins every slot
 *  on watch time + accumulated reputation. Production keeps pure score order. */
function prioritizeRealScouts<T extends { userId: string; rank: number }>(scored: T[]): T[] {
  const max = config.curator.maxFoundingCurators;
  let ordered = scored;
  if (!env.IS_PRODUCTION) {
    const botIds = new Set(demoCrowd().map((b) => b.id));
    ordered = [...scored.filter((c) => !botIds.has(c.userId)), ...scored.filter((c) => botIds.has(c.userId))];
  }
  return ordered.slice(0, max).map((c, i) => ({ ...c, rank: i + 1 }));
}

async function resolveConfirmation(moment: Moment, now: number) {
  const deadline = now;
  const reactions = await candidateReactions(moment, deadline);
  const curatorReactions: CuratorReaction[] = reactions.map((r) => ({
    userId: r.userId,
    walletAddress: r.walletAddress,
    type: r.type,
    streamTimeMs: r.streamTimeMs,
    serverTimeMs: r.serverTimeMs,
  }));

  const recentUnwatchedReactors = new Set(
    reactions.filter((reaction) => reaction.watchTimeMs < ANTI_CHEAT_CONFIG.minimumWatchSeconds * 1000).map((reaction) => reaction.userId)
  ).size;
  const recentUniqueReactors = new Set(
    reactions.filter((r) => r.serverTimeMs >= deadline - COLD_START_CONFIG.reactionBurstWindowMs).map((r) => r.userId)
  ).size;
  const isColdStart = moment.spikeStreamTimeMs <= COLD_START_CONFIG.gracePeriodMs
    || recentUnwatchedReactors >= burstMinReactors
    || recentUniqueReactors >= burstMinReactors;
  const confirmationConfig = isColdStart
    ? { ...config.confirmation, minTotalReactions: coldStartConfirmReactions }
    : config.confirmation;
  const conf = evaluateConfirmation(curatorReactions, confirmationConfig);
  if (!conf.confirmed) {
    await transition(moment, "EXPIRED");
    hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "EXPIRED" });
    console.log(`[moment] expired ${moment.id} (${conf.reason})`);
    return;
  }

  // Freeze Founding Curators (PRD §17): the first unique Scouts whose reaction landed before the
  // confirmation timestamp, earliest first — deterministic, one slot per account. Every unique
  // reactor is ranked so prioritizeRealScouts can trim to the real slot count.
  const selected = prioritizeRealScouts(selectFoundingCurators(
    curatorReactions,
    deadline,
    { ...config.curator, maxFoundingCurators: Number.MAX_SAFE_INTEGER }
  ));

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
    simulated: false,
    creatorAmountUnits: dist.creatorUnits,
    curatorPoolUnits: dist.curatorPoolUnits,
    totalUnits: dist.totalUnits,
    submittedAt: null,
    confirmedAt: null,
    error: null,
  };

  await Moments.setCurators(moment.id, curators);
  await transition(moment, "CONFIRMED");

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
  // Pay creator + Founding Curators on Monad right away (PRD §10 step 9); the clip and card
  // publish in parallel and the Moment flips to SETTLED once both are done.
  settleInBackground(moment);
  console.log(`[moment] confirmed ${moment.id} (${moment.metrics.category}) with ${curators.length} founding curators`);
}

/** Records the Moment + Founding Curators on-chain (createMoment → MomentCreated). */
const CATEGORY_CODE: Record<string, number> = { Funny: 0, Hype: 1, Wow: 2 };
async function createMomentOnChain(moment: Moment, curators: FoundingCurator[]) {
  const chain = getChain();
  if (!chain.enabled || !chain.contract) return; // simulation: nothing to record on-chain
  try {
    const contract = chain.contract as any;
    const creator = await Users.byId(moment.creatorId);
    const creatorWallet = creator?.walletAddress;
    if (!creatorWallet) throw new Error(`creator-wallet-invalid:${moment.creatorId}`);
    if (await contract.momentCreated(momentIdHash(moment.id))) return; // idempotent
    const tx: any = await submitSettlerTx(() =>
      contract.createMoment(
        momentIdHash(moment.id),
        toBytes32(moment.streamId),
        creatorWallet,
        Math.floor(moment.clip.startStreamTimeMs / 1000),
        Math.floor(moment.clip.endStreamTimeMs / 1000),
        CATEGORY_CODE[moment.metrics.category] ?? 1,
        curators.map((c) => c.walletAddress)
      )
    );
    await tx.wait(1);
    console.log(`[moment] createMoment on-chain ${moment.id} tx=${tx.hash}`);
  } catch (e) {
    console.error("createMoment on-chain failed", e);
  }
}

// ---------- clipping ----------
async function startClipping(moment: Moment, now: number) {
  const stream = await Streams.byId(moment.streamId);
  if (!stream) return;
  moment.clip = buildClip(moment, stream.startedAt, stream.durationSec, stream.videoUrl, now, stream.isLive, moment.clip.manual);
  await transition(moment, "CLIPPING");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "CLIPPING" });
}

/** Give the recording (Egress or a viewer's browser upload) this long past the clip's end
 *  before publishing without it. */
const CLIP_GIVE_UP_MS = 30_000;

// ---------- browser-recorded clips (rolling buffer in a viewer's/host's browser) ----------
// Every web client on the stream keeps a rolling recording; the first to claim a Moment uploads
// its 35s clip and everyone else discards theirs. Attached clips are re-applied on every
// lifecycle write so a concurrent tick can't overwrite the uploaded URL with a stale one.
const clipClaims = new Map<string, string>(); // momentId -> userId allowed to upload
const attachedClips = new Map<string, Clip>();

/** True when this Moment still needs a clip and `userId` may upload it (first claim wins). */
export async function claimClipUpload(momentId: string, userId: string): Promise<boolean> {
  const moment = await Moments.byId(momentId);
  if (!moment || moment.state === "EXPIRED" || attachedClips.has(momentId)) return false;
  const stream = await Streams.byId(moment.streamId);
  if (!stream || stream.videoUrl) return false; // fake-live VOD streams clip from their source file
  const holder = clipClaims.get(momentId);
  if (holder && holder !== userId) return false;
  clipClaims.set(momentId, userId);
  return true;
}

/** Attach an uploaded clip video; `startSec`/`endSec` trim the recording to the 35s window. */
export async function attachClipVideo(momentId: string, userId: string, url: string, startSec: number, endSec: number): Promise<void> {
  if (clipClaims.get(momentId) !== userId) throw new Error("clip-not-claimed");
  const moment = await Moments.byId(momentId);
  if (!moment) throw new Error("moment-not-found");
  const start = round2(Math.max(0, startSec));
  const end = round2(Math.max(start + 1, endSec));
  moment.clip = { ...moment.clip, url: `${url}#t=${start},${end}`, durationSec: round2(end - start), ready: true };
  attachedClips.set(momentId, moment.clip);
  await Moments.update(moment);
  if (moment.state === "CLIPPING") {
    await transition(moment, "SETTLING");
    hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLING" });
  } else {
    hub.broadcastStream("feed", { t: "feed", momentId: moment.id });
  }
  console.log(`[moment] browser clip attached ${momentId} (${moment.clip.durationSec}s)`);
}
const clipFailureLogged = new Set<string>();

async function finishClipping(moment: Moment, now: number) {
  try {
    await tryFinishClipping(moment, now);
  } catch (e) {
    if (!clipFailureLogged.has(moment.id)) console.error(`[moment] clip build failed ${moment.id}`, e);
    clipFailureLogged.add(moment.id);
  }
  if (moment.state !== "CLIPPING" || attachedClips.has(moment.id)) return;
  // A failed/unavailable recording (e.g. LiveKit Egress off) must never strand a Moment in
  // CLIPPING: that blocks its card, its reward, and every later detection on the stream.
  const clipEndsAt = (moment.detectedAt - moment.spikeStreamTimeMs) + moment.clip.endStreamTimeMs;
  if (now < Math.max(clipEndsAt, moment.confirmedAt ?? now) + CLIP_GIVE_UP_MS) return;
  const stream = await Streams.byId(moment.streamId);
  clipFailureLogged.delete(moment.id);
  console.warn(`[moment] publishing ${moment.id} without a permanent clip (recording unavailable)`);
  moment.clip = { ...moment.clip, url: stream?.videoUrl ? moment.clip.url : null, ready: true };
  await Moments.update(moment);
  await transition(moment, "SETTLING");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLING" });
}

async function tryFinishClipping(moment: Moment, now: number) {
  if (moment.clip.ready) return;
  const stream = await Streams.byId(moment.streamId);
  const recording = await Streams.recording(moment.streamId);
  if (!stream) return;
  if (!recording) {
    if (!stream.videoUrl || now - (moment.confirmedAt ?? now) < CLIP_PROCESSING_MS) return;
    moment.clip = { ...moment.clip, ready: true };
    await Moments.update(moment);
    await transition(moment, "SETTLING");
    hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLING" });
    return;
  }

  const availableUntilMs = recording.endedAt == null
    ? streamTimeMs(stream.startedAt, now)
    : Math.max(0, recording.endedAt - stream.startedAt);
  if (recording.endedAt != null && availableUntilMs < moment.clip.endStreamTimeMs) {
    if (moment.clip.manual) return;
    moment.clip = {
      ...moment.clip,
      endStreamTimeMs: availableUntilMs,
      durationSec: round2(Math.max(0, availableUntilMs - moment.clip.startStreamTimeMs) / 1000),
    };
  }
  if (availableUntilMs < moment.clip.endStreamTimeMs) return;

  if (permanentMediaConfigured()) {
    if (!recording.recordingPrefix || recording.recordingStartedAt == null) {
      throw new Error(`stream-recording-missing:${moment.streamId}`);
    }
    const firstRecordedStreamTimeMs = Math.max(0, recording.recordingStartedAt - stream.startedAt);
    if (moment.clip.startStreamTimeMs < firstRecordedStreamTimeMs) {
      moment.clip = {
        ...moment.clip,
        startStreamTimeMs: firstRecordedStreamTimeMs,
        durationSec: round2(Math.max(0, moment.clip.endStreamTimeMs - firstRecordedStreamTimeMs) / 1000),
      };
    }
    try {
      const url = await buildPermanentMomentClip(moment, stream, recording.recordingPrefix, recording.recordingStartedAt);
      moment.clip = { ...moment.clip, url, ready: true };
    } catch (error) {
      if (error instanceof Error && error.message === "clip-not-ready") return;
      throw error;
    }
  } else {
    if (now - (moment.confirmedAt ?? now) < CLIP_PROCESSING_MS) return;
    moment.clip = { ...moment.clip, ready: true };
  }
  await Moments.update(moment);
  await transition(moment, "SETTLING");
  hub.broadcastStream(moment.streamId, { t: "moment", streamId: moment.streamId, momentId: moment.id, state: "SETTLING" });
}

/**
 * Build the 35s clip descriptor (PRD §16, §35). For fake-live we map the absolute stream
 * time into the looping source video and express the clip as a media-fragment range, so it
 * is produced on shared infra and never depends on a client retaining video (PRD §39).
 * Edge cases handled: spike within first 15s (clamp to 0) and near stream end (clamp).
 */
function buildClip(moment: Moment, startedAt: number, durationSec: number, videoUrl: string, now: number, streamLive: boolean, manual = false): Clip {
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
    ...(manual ? { manual: true } : {}),
  };
}

/** Queue a viewer-requested 35-second clip on the same permanent recording as Moments. */
export async function requestManualClip(streamId: string, spikeStreamTimeMs: number, browserRecording = false): Promise<Moment> {
  const stream = await Streams.byId(streamId);
  if (!stream || !stream.isLive) throw new Error("stream-not-live");
  if (!stream.videoUrl && !(browserRecording && clipUploadConfigured())) {
    const recording = await Streams.recording(streamId);
    if (!permanentMediaConfigured() || !recording?.egressId || !recording.recordingPrefix || recording.recordingStartedAt == null) {
      throw new Error("recording-not-available");
    }
  }

  const now = Date.now();
  const moment: Moment = {
    id: newId("clip"),
    streamId,
    creatorId: stream.creatorId,
    state: "CONFIRMED",
    spikeStreamTimeMs,
    detectedAt: now,
    confirmedAt: now,
    clip: { ...emptyClip(spikeStreamTimeMs), manual: true },
    metrics: emptyMetrics(),
    foundingCurators: [],
    settlement: null,
    createdAt: now,
    updatedAt: now,
  };
  moment.clip = buildClip(moment, stream.startedAt, stream.durationSec, stream.videoUrl, now, stream.isLive, true);
  await Moments.insert(moment, now);
  await transition(moment, "CLIPPING");
  hub.broadcastStream(streamId, { t: "moment", streamId, momentId: moment.id, state: "CLIPPING" });
  return moment;
}

export async function manualClipPostRollRemainingMs(streamId: string, now = Date.now()): Promise<number> {
  const stream = await Streams.byId(streamId);
  if (!stream) return 0;
  const currentStreamTimeMs = streamTimeMs(stream.startedAt, now);
  const pending = (await Moments.activeForStream(streamId)).filter((moment) => moment.clip.manual);
  const latestClipEndMs = pending.reduce((latest, moment) => Math.max(latest, moment.clip.endStreamTimeMs), currentStreamTimeMs);
  return Math.max(0, latestClipEndMs - currentStreamTimeMs);
}

// ---------- settlement (real Monad tx or idempotent simulation) ----------
async function settleAndFinalize(moment: Moment) {
  const creator = await Users.byId(moment.creatorId);
  // Mark the attempt before the tx goes out so a concurrent tick doesn't start a second one.
  await Moments.setSettlement(moment.id, { ...(moment.settlement ?? emptySettlement(moment.id)), submittedAt: Date.now() });
  const outcome = await settleMoment(moment, config, creator?.walletAddress ?? "");
  moment.settlement = outcome.settlement;
  await Moments.setCurators(moment.id, outcome.curators);
  moment.foundingCurators = outcome.curators;
  await Moments.setSettlement(moment.id, outcome.settlement);

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
  console.log(`[moment] settlement ${moment.id} ${moment.settlement.status} ${outcome.simulated ? "(simulated)" : "(onchain)"} tx=${moment.settlement.txHash}`);
}

function emptySettlement(momentId: string): NonNullable<Moment["settlement"]> {
  return {
    momentId,
    status: "pending",
    txHash: null,
    simulated: false,
    creatorAmountUnits: 0n,
    curatorPoolUnits: 0n,
    totalUnits: 0n,
    submittedAt: null,
    confirmedAt: null,
    error: null,
  };
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

  await Batches.insert({
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
  await Reactions.markBatched(reactions.map((r) => r.id), batchId);

  const chain = getChain();
  if (!chain.enabled || !chain.contract) {
    await Batches.setStatus(batchId, "confirmed", null);
    return;
  }
  try {
    const contract = chain.contract as any;
    const tx: any = await submitSettlerTx(() =>
      contract.commitReactionBatch(
        toBytes32(batchId),
        toBytes32(moment.streamId),
        reactions.length,
        Math.floor(from / 1000),
        Math.floor(deadline / 1000),
        commitment
      )
    );
    await Batches.setStatus(batchId, "submitted", tx.hash);
    await tx.wait(1);
    await Batches.setStatus(batchId, "confirmed", tx.hash);
  } catch (e) {
    console.error("batch commit failed", e);
    await Batches.setStatus(batchId, "failed", null);
  }
}

// ---------- helpers ----------
async function transition(moment: Moment, to: Moment["state"]) {
  assertTransition(moment.state, to);
  moment.state = to;
  const attached = attachedClips.get(moment.id);
  if (attached) moment.clip = attached;
  moment.updatedAt = Date.now();
  await Moments.update(moment);
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
