/**
 * Envio event handlers for MomentRewards on Monad.
 *
 * Types are produced by `pnpm codegen` from config.yaml + schema.graphql.
 *
 * Handlers keep two kinds of records:
 *   • per-event rows (Moment, Tip, Settlement, CuratorPayout, ReactionBatch, FoundingCurator)
 *   • rolling aggregates (CuratorStats, CreatorStats, StreamStats) for leaderboards/analytics.
 * The backend (apps/server/src/envio.ts) queries these; it never writes here.
 */
import { indexer } from "envio";

const lc = (a: string) => a.toLowerCase();

// ---- MomentCreated: a Moment (+ its Founding Curators) recorded on-chain ----
indexer.onEvent({ contract: "MomentRewards", event: "MomentCreated" }, async ({ event, context }) => {
  const id = event.params.momentId;
  context.Moment.set({
    id,
    streamId: event.params.streamId,
    creator: lc(event.params.creator),
    clipStart: event.params.clipStart,
    clipEnd: event.params.clipEnd,
    category: Number(event.params.category),
    curatorCount: Number(event.params.curatorCount),
    settled: false,
    totalPaid: 0n,
    createdAtBlock: event.block.number,
    settledAtBlock: undefined,
  });

  const creatorId = lc(event.params.creator);
  const cs = await context.CreatorStats.get(creatorId);
  const ss = await context.StreamStats.get(event.params.streamId);
  context.CreatorStats.set({
    id: creatorId,
    totalRewards: cs?.totalRewards ?? 0n,
    momentsGenerated: (cs?.momentsGenerated ?? 0) + 1,
    // Attribute tips received before the first Moment revealed the stream's creator.
    totalTips: (cs?.totalTips ?? 0n) + (ss?.creator ? 0n : (ss?.tipTotal ?? 0n)),
  });

  context.StreamStats.set({
    id: event.params.streamId,
    creator: creatorId,
    tipTotal: ss?.tipTotal ?? 0n,
    momentCount: (ss?.momentCount ?? 0) + 1,
    reactionCount: ss?.reactionCount ?? 0n,
  });
});

// ---- FoundingCuratorRecorded: rank i+1 curator for a Moment ----
indexer.onEvent({ contract: "MomentRewards", event: "FoundingCuratorRecorded" }, async ({ event, context }) => {
  const curator = lc(event.params.curator);
  const rank = Number(event.params.rank);
  context.FoundingCurator.set({
    id: `${event.params.momentId}-${curator}`,
    moment: event.params.momentId,
    curator,
    rank,
  });

  const cs = await context.CuratorStats.get(curator);
  context.CuratorStats.set({
    id: curator,
    totalRewards: cs?.totalRewards ?? 0n,
    firstFinds: (cs?.firstFinds ?? 0) + (rank === 1 ? 1 : 0),
    momentsCurated: (cs?.momentsCurated ?? 0) + 1,
  });
});

// ---- Tipped: funds a stream's reward pool ----
indexer.onEvent({ contract: "MomentRewards", event: "Tipped" }, async ({ event, context }) => {
  context.Tip.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    streamId: event.params.streamId,
    from: lc(event.params.from),
    amount: event.params.amount,
    streamTotal: event.params.streamTotal,
    blockNumber: event.block.number,
  });

  const ss = await context.StreamStats.get(event.params.streamId);
  context.StreamStats.set({
    id: event.params.streamId,
    creator: ss?.creator,
    tipTotal: (ss?.tipTotal ?? 0n) + event.params.amount,
    momentCount: ss?.momentCount ?? 0,
    reactionCount: ss?.reactionCount ?? 0n,
  });

  if (ss?.creator) {
    const creator = await context.CreatorStats.get(ss.creator);
    context.CreatorStats.set({
      id: ss.creator,
      totalRewards: creator?.totalRewards ?? 0n,
      momentsGenerated: creator?.momentsGenerated ?? 0,
      totalTips: (creator?.totalTips ?? 0n) + event.params.amount,
    });
  }
});

// ---- MomentSettled: creator paid; marks the Moment settled ----
indexer.onEvent({ contract: "MomentRewards", event: "MomentSettled" }, async ({ event, context }) => {
  const id = event.params.momentId;
  context.Settlement.set({
    id,
    creator: lc(event.params.creator),
    creatorAmount: event.params.creatorAmount,
    curatorPool: event.params.curatorPool,
    platformAmount: event.params.platformAmount,
    total: event.params.totalAmount,
    curatorCount: Number(event.params.curatorCount),
    blockNumber: event.block.number,
  });

  const existing = await context.Moment.get(id);
  if (existing) {
    context.Moment.set({
      ...existing,
      settled: true,
      totalPaid: event.params.totalAmount,
      settledAtBlock: event.block.number,
    });
  }

  const creatorId = lc(event.params.creator);
  const cs = await context.CreatorStats.get(creatorId);
  context.CreatorStats.set({
    id: creatorId,
    totalRewards: (cs?.totalRewards ?? 0n) + event.params.creatorAmount,
    momentsGenerated: cs?.momentsGenerated ?? 0,
    totalTips: cs?.totalTips ?? 0n,
  });
});

// ---- CuratorPaid: a Founding Curator's payout ----
indexer.onEvent({ contract: "MomentRewards", event: "CuratorPaid" }, async ({ event, context }) => {
  const curator = lc(event.params.curator);
  context.CuratorPayout.set({
    id: `${event.params.momentId}-${curator}`,
    moment: event.params.momentId,
    curator,
    rank: Number(event.params.rank),
    amount: event.params.amount,
    blockNumber: event.block.number,
  });

  const cs = await context.CuratorStats.get(curator);
  context.CuratorStats.set({
    id: curator,
    totalRewards: (cs?.totalRewards ?? 0n) + event.params.amount,
    firstFinds: cs?.firstFinds ?? 0,
    momentsCurated: cs?.momentsCurated ?? 0,
  });
});

// ---- PlatformPaid: protocol treasury payout history ----
indexer.onEvent({ contract: "MomentRewards", event: "PlatformPaid" }, async ({ event, context }) => {
  const platform = lc(event.params.platform);
  context.PlatformPayout.set({
    id: `${event.params.momentId}-${platform}`,
    moment: event.params.momentId,
    platform,
    amount: event.params.amount,
    blockNumber: event.block.number,
  });
});

// ---- ReactionBatchCommitted: reaction provenance anchor ----
indexer.onEvent({ contract: "MomentRewards", event: "ReactionBatchCommitted" }, async ({ event, context }) => {
  context.ReactionBatch.set({
    id: event.params.batchId,
    streamId: event.params.streamId,
    reactionCount: event.params.reactionCount,
    fromTs: event.params.fromTs,
    toTs: event.params.toTs,
    commitment: event.params.commitment,
    blockNumber: event.block.number,
  });

  const ss = await context.StreamStats.get(event.params.streamId);
  context.StreamStats.set({
    id: event.params.streamId,
    creator: ss?.creator,
    tipTotal: ss?.tipTotal ?? 0n,
    momentCount: ss?.momentCount ?? 0,
    reactionCount: (ss?.reactionCount ?? 0n) + event.params.reactionCount,
  });
});
