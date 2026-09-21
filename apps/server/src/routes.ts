import type { FastifyInstance, FastifyRequest } from "fastify";
import { streamPositionSec, type Platform, type ReactionType, type User } from "@moment/core";
import { Users, Streams, Moments, Reactions } from "./store.js";
import { deriveWallet, issueToken, verifyToken, normalizeAuthId } from "./auth.js";
import { issueChallenge, verifyClientData, Passkeys } from "./passkey.js";
import { env } from "./env.js";
import { randomBytes } from "node:crypto";
import { ingestReaction, config, tipStream, demoFastForwardSettlement } from "./momentEngine.js";
import { demoCrowd, demoForceSpike, demoResetStream } from "./seed.js";
import { hub } from "./realtime.js";
import { momentView, streamView, userView, usd } from "./view.js";
import { getChain } from "./chain.js";
import { streamTimeMs } from "@moment/core";

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

  // ---------- passkey (WebAuthn) sign-in — biometric, embedded wallet, no seed phrase ----------
  const b64urlStr = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  app.post("/auth/passkey/register-options", async (req) => {
    const body = (req.body ?? {}) as { displayName?: string };
    const displayName = body.displayName?.trim() || "Scout";
    const userHandle = b64urlStr(randomBytes(16));
    return {
      challenge: issueChallenge(),
      rp: { id: env.RP_ID, name: env.RP_NAME },
      user: { id: userHandle, name: `${displayName.toLowerCase().replace(/\s+/g, "")}@moment`, displayName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      attestation: "none",
      timeout: 60_000,
      userHandle,
    };
  });

  app.post("/auth/passkey/register", async (req, reply) => {
    const body = (req.body ?? {}) as { credentialId?: string; clientDataJSON?: string; displayName?: string };
    if (!body.credentialId || !body.clientDataJSON) return reply.code(400).send({ error: "missing fields" });
    const v = verifyClientData(body.clientDataJSON, "webauthn.create", env.RP_ORIGINS);
    if (!v.ok) return reply.code(400).send({ error: v.error });

    const authId = `passkey:${body.credentialId}`;
    let user = Users.byAuthId(authId);
    if (!user) {
      const wallet = deriveWallet(authId);
      const displayName = body.displayName?.trim() || "Scout";
      user = Users.create({
        authId,
        displayName,
        handle: handleFromName(displayName),
        avatarUrl: null,
        walletAddress: wallet.address,
        isCreator: false,
      });
    }
    Passkeys.add(body.credentialId, user.id, null);
    return { token: issueToken(user.id), user: userView(user) };
  });

  app.post("/auth/passkey/login-options", async () => ({
    challenge: issueChallenge(),
    rpId: env.RP_ID,
    userVerification: "required",
    allowCredentials: [], // discoverable credentials — browser shows the passkey picker
    timeout: 60_000,
  }));

  app.post("/auth/passkey/login", async (req, reply) => {
    const body = (req.body ?? {}) as { credentialId?: string; clientDataJSON?: string };
    if (!body.credentialId || !body.clientDataJSON) return reply.code(400).send({ error: "missing fields" });
    const v = verifyClientData(body.clientDataJSON, "webauthn.get", env.RP_ORIGINS);
    if (!v.ok) return reply.code(400).send({ error: v.error });
    const userId = Passkeys.userIdFor(body.credentialId);
    if (!userId) return reply.code(404).send({ error: "no-passkey-account" });
    const user = Users.byId(userId);
    if (!user) return reply.code(404).send({ error: "no-passkey-account" });
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

  // ---------- tips (fund a stream's reward pool) ----------
  app.post("/streams/:id/tip", async (req, reply) => {
    const user = bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    if (!Streams.byId(id)) return reply.code(404).send({ error: "not found" });
    // Fixed demo tip amount (consumer UI shows a friendly label, never wei/gas).
    const amountWei = 5_000_000_000_000_000n; // 0.005 MON
    const r = await tipStream(id, amountWei);
    return { ok: r.ok, onchain: r.onchain, amountUsd: usd(amountWei) };
  });

  // ---------- manual clip ("Clip it") — does NOT grant Founding Curator status ----------
  app.post("/streams/:id/clip", async (req, reply) => {
    const user = bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    const body = (req.body ?? {}) as { clientStreamTimeMs?: number };
    const at = Number(body.clientStreamTimeMs ?? streamTimeMs(stream.startedAt, Date.now()));
    const startSec = Math.max(0, at / 1000 - config.clip.preRollSec);
    const endSec = startSec + config.clip.preRollSec + config.clip.postRollSec;
    // Manual clip is a shareable view of the source range; not a rewarded Moment.
    return {
      ok: true,
      clip: { url: `${stream.videoUrl}#t=${startSec.toFixed(1)},${endSec.toFixed(1)}`, durationSec: config.clip.preRollSec + config.clip.postRollSec },
    };
  });

  // ---------- DEMO panel (hidden; simulate INPUTS into the real pipeline; never fake settlement) ----------
  app.get("/demo/crowd", async () => ({ crowd: demoCrowd(), label: "Demo crowd" }));
  app.post("/demo/force-spike", async (req) => {
    const { streamId } = (req.body ?? {}) as { streamId?: string };
    const sent = streamId ? demoForceSpike(streamId) : 0;
    return { ok: true, reactionsSent: sent };
  });
  app.post("/demo/fast-forward", async (req) => {
    const { streamId } = (req.body ?? {}) as { streamId?: string };
    const settled = streamId ? await demoFastForwardSettlement(streamId) : 0;
    return { ok: true, settled };
  });
  app.post("/demo/reset", async (req) => {
    const { streamId } = (req.body ?? {}) as { streamId?: string };
    if (streamId) demoResetStream(streamId);
    return { ok: true };
  });

  // ---------- moments ----------
  app.get("/moments", async () => ({ moments: Moments.publicFeed(50).map(momentView) }));

  app.get("/moments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = Moments.byId(id);
    if (!m) return reply.code(404).send({ error: "not found" });
    Moments.incrementViews(id); // real success signal
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
