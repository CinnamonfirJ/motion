import { formatUsd, statusLabel, type Moment, type Stream, type User, type FoundingCurator, type Settlement } from "@ennoia/core";
import { env, livekitConfigured } from "./env.js";
import { getChain, momentIdHash } from "./chain.js";
import { roomNameForStream } from "./livekit.js";
import { Users, Streams, Moments } from "./store.js";

/** DTOs are JSON-safe (no bigint) and carry human display values. Clients never see raw units. */
export const usd = (units: bigint) => formatUsd(units, env.UNITS_PER_USD);

export function userView(u: User) {
  return {
    id: u.id,
    displayName: u.displayName,
    handle: u.handle,
    avatarUrl: u.avatarUrl,
    walletAddress: u.walletAddress,
    isCreator: u.isCreator,
  };
}

export function streamView(s: Stream, viewerCount: number) {
  const creator = Users.byId(s.creatorId);
  // A stream renders as a real LiveKit room when LiveKit is configured AND it has no VOD source;
  // seeded sample streams keep a videoUrl and play through the fake-live VOD player.
  const mode: "livekit" | "vod" = livekitConfigured() && !s.videoUrl ? "livekit" : "vod";
  return {
    id: s.id,
    title: s.title,
    videoUrl: s.videoUrl,
    durationSec: s.durationSec,
    thumbnailUrl: s.thumbnailUrl,
    startedAt: s.startedAt,
    isLive: s.isLive,
    viewerCount,
    mode,
    livekitRoom: mode === "livekit" ? roomNameForStream(s.id) : null,
    creator: creator ? { id: creator.id, displayName: creator.displayName, handle: creator.handle, avatarUrl: creator.avatarUrl } : null,
  };
}

function curatorView(c: FoundingCurator) {
  const u = Users.byId(c.userId);
  return {
    userId: c.userId,
    rank: c.rank,
    displayName: u?.displayName ?? "Scout",
    handle: u?.handle ?? null,
    avatarUrl: u?.avatarUrl ?? null,
    walletAddress: c.walletAddress,
    rewardUnits: c.rewardUnits.toString(),
    rewardUsd: usd(c.rewardUnits),
    qualifyingStreamTimeMs: c.qualifyingStreamTimeMs,
  };
}

function settlementView(s: Settlement | null) {
  if (!s) return null;
  const chain = getChain();
  return {
    status: s.status,
    txHash: s.txHash,
    explorerUrl: s.txHash ? chain.explorerTx(s.txHash) : null,
    network: "Monad",
    onchain: chain.enabled,
    creatorAmountUsd: usd(s.creatorAmountUnits),
    curatorPoolUsd: usd(s.curatorPoolUnits),
    totalUsd: usd(s.totalUnits),
    error: s.error,
  };
}

export function momentView(m: Moment) {
  const stream = Streams.byId(m.streamId);
  const creator = Users.byId(m.creatorId);
  return {
    id: m.id,
    streamId: m.streamId,
    state: m.state,
    statusLabel: statusLabel(m.state),
    isLiveStream: stream?.isLive ?? false,
    spikeStreamTimeMs: m.spikeStreamTimeMs,
    detectedAt: m.detectedAt,
    confirmedAt: m.confirmedAt,
    clip: m.clip,
    metrics: m.metrics,
    creator: creator ? { id: creator.id, displayName: creator.displayName, handle: creator.handle, avatarUrl: creator.avatarUrl } : null,
    streamTitle: stream?.title ?? "",
    views: Moments.viewsFor(m.id),
    foundingCurators: m.foundingCurators.map(curatorView),
    foundingCuratorCount: m.foundingCurators.length,
    settlement: settlementView(m.settlement),
    // On-chain identity of this Moment (createMoment/MomentCreated key) — used to cross-reference
    // Envio-indexed analytics and the block explorer. Present regardless of settlement status.
    onchainMomentId: momentIdHash(m.id),
    livekitRoom: stream ? roomNameForStream(stream.id) : null,
    createdAt: m.createdAt,
  };
}

export type MomentDTO = ReturnType<typeof momentView>;
