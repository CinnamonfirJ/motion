import type { FastifyInstance, FastifyRequest } from "fastify";
import { streamPositionSec, type Platform, type ReactionType, type User } from "@moment/core";
import { Users, Streams, Moments, Reactions } from "./store.js";
import { deriveWallet, issueToken, verifyToken, normalizeAuthId } from "./auth.js";
import { ingestReaction, config } from "./momentEngine.js";
import { hub } from "./realtime.js";
import { momentView, streamView, userView, usd } from "./view.js";
import { getChain } from "./chain.js";

function bearer(req: FastifyRequest): User | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  const claims = verifyToken(h.slice(7));
  if (!claims) return null;
  return Users.byId(claims.userId);
}

function handleFromName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "scout";
  return `${base}${Math.floor(Math.random() * 900 + 100)}`;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, chain: getChain().enabled ? "onchain" : "simulation" }));

  app.get("/time", async () => ({ serverTime: Date.now() }));

  // ---------- auth ----------
  app.post("/auth/login", async (req, reply) => {
    const body = (req.body ?? {}) as { provider?: string; email?: string; subject?: string; displayName?: string };
    const provider = body.provider ?? "email";
    const subject = body.email ?? body.subject;
    if (!subject) return reply.code(400).send({ error: "email or subject required" });

    const authId = normalizeAuthId(provider, subject);
    let user = Users.byAuthId(authId);
    if (!user) {
      const wallet = deriveWallet(authId);
      const displayName = body.displayName?.trim() || subject.split("@")[0] || "Scout";
      user = Users.create({
        authId,
        displayName,
        handle: handleFromName(displayName),
        avatarUrl: null,
        walletAddress: wallet.address,
        isCreator: false,
      });
    }
    return { token: issueToken(user.id), user: userView(user) };
  });

  app.get("/me", async (req, reply) => {
    const user = bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const chain = getChain();
    return {
      user: userView(user),
      wallet: { address: user.walletAddress, network: "Monad", onchain: chain.enabled },
    };
  });

  // ---------- streams ----------
  app.get("/streams", async () => {
    return { streams: Streams.live().map((s) => streamView(s, hub.viewerCount(s.id))) };
  });

  app.get("/streams/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const stream = Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    const active = Moments.activeForStream(id).map(momentView);
    const now = Date.now();
    return {
      stream: streamView(stream, hub.viewerCount(id)),
      sync: syncPayload(stream.startedAt, stream.durationSec, now),
      activeMoments: active,
      recentReactionCount: Reactions.countForStream(id),
    };
  });

  // Clock sync (PRD §8/§40): clients derive playback + reaction timing from this.
  app.get("/streams/:id/sync", async (req, reply) => {
    const { id } = req.params as { id: string };
    const stream = Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    return syncPayload(stream.startedAt, stream.durationSec, Date.now());
  });

  app.get("/streams/:id/moments", async (req) => {
    const { id } = req.params as { id: string };
    const active = Moments.activeForStream(id);
    return { active: active.map(momentView) };
  });

  // ---------- reactions ----------
  app.post("/reactions", async (req, reply) => {
    const user = bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as {
      streamId?: string;
      type?: ReactionType;
      clientStreamTimeMs?: number;
      platform?: Platform;
      eventId?: string;
    };
    if (!body.streamId || !body.type) return reply.code(400).send({ error: "streamId and type required" });

    const result = ingestReaction(user, {
      streamId: body.streamId,
      type: body.type,
      clientStreamTimeMs: Number(body.clientStreamTimeMs ?? 0),
      platform: body.platform ?? "web",
      eventId: body.eventId ?? "",
    });
    if (!result.ok) return reply.code(409).send({ error: result.error });
    return { ok: true, duplicate: result.duplicate ?? false };
  });

  // ---------- moments ----------
  app.get("/moments", async () => ({ moments: Moments.publicFeed(50).map(momentView) }));

  app.get("/moments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = Moments.byId(id);
    if (!m) return reply.code(404).send({ error: "not found" });
    return { moment: momentView(m) };
  });

  // ---------- earnings ----------
  app.get("/earnings/scout", async (req, reply) => {
    const user = bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const entries = Moments.curatorMomentsFor(user.id);
    let total = 0n;
    let firstFinds = 0;
    const rewards = entries
      .sort((a, b) => (b.moment.confirmedAt ?? 0) - (a.moment.confirmedAt ?? 0))
      .map(({ moment, curator }) => {
        total += curator.rewardUnits;
        if (curator.rank === 1) firstFinds++;
        return {
          momentId: moment.id,
          streamTitle: momentView(moment).streamTitle,
          creator: momentView(moment).creator,
          rank: curator.rank,
          rewardUnits: curator.rewardUnits.toString(),
          rewardUsd: usd(curator.rewardUnits),
          status: moment.settlement?.status ?? "pending",
          clip: moment.clip,
          confirmedAt: moment.confirmedAt,
        };
      });
    return {
      totalUnits: total.toString(),
      totalUsd: usd(total),
      momentsCurated: entries.length,
      firstFinds,
      rewards,
    };
  });

  app.get("/earnings/creator", async (req, reply) => {
    const user = bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const moments = Moments.createdByCreator(user.id);
    let total = 0n;
    const payouts = moments.map((m) => {
      const amt = m.settlement?.creatorAmountUnits ?? 0n;
      total += amt;
      const v = momentView(m);
      return {
        momentId: m.id,
        streamTitle: v.streamTitle,
        rewardUnits: amt.toString(),
        rewardUsd: usd(amt),
        status: m.settlement?.status ?? "pending",
        clip: m.clip,
        foundingCuratorCount: m.foundingCurators.length,
        confirmedAt: m.confirmedAt,
      };
    });
    return {
      totalUnits: total.toString(),
      totalUsd: usd(total),
      momentsGenerated: moments.length,
      payouts,
    };
  });
}

function syncPayload(startedAt: number, durationSec: number, now: number) {
  return {
    serverTime: now,
    startedAt,
    durationSec,
    positionSec: streamPositionSec(startedAt, durationSec, now),
    streamTimeMs: Math.max(0, now - startedAt),
    recentWindowMs: config.spike.recentWindowMs,
  };
}
