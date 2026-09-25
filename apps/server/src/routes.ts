import type { FastifyInstance, FastifyRequest } from "fastify";
import { streamPositionSec, type Platform, type ReactionType, type User } from "@ennoia/core";
import { Users, Streams, Moments, Reactions, Safety, AccountDeletions, type ReportTarget } from "./store.js";
import { deriveWallet, issueToken, verifyToken, normalizeAuthId } from "./auth.js";
import { issueChallenge, verifyClientData, Passkeys } from "./passkey.js";
import { env, privyConfigured, livekitConfigured, envioConfigured } from "./env.js";
import { verifyPrivyToken } from "./privy.js";
import { processAccountDeletionJob } from "./accountDeletion.js";
import { roomTokenFor } from "./livekit.js";
import { LiveRooms } from "./liveRooms.js";
import { LiveChat, CHAT_MAX_LEN } from "./liveChat.js";
import { Moderation, type BanKind } from "./moderation.js";
import { Analytics } from "./analytics.js";
import { topCurators, trendingMoments, rewardHistory } from "./envio.js";
import { createHmac, randomBytes } from "node:crypto";
import { ingestReaction, config, demoFastForwardSettlement } from "./momentEngine.js";
import { demoCrowd, demoForceSpike, demoResetStream } from "./seed.js";
import { hub } from "./realtime.js";
import { momentView, streamView, userView, usd } from "./view.js";
import { getChain, momentIdHash, toBytes32 } from "./chain.js";
import { streamTimeMs } from "@ennoia/core";
import { permanentMediaConfigured, startStreamRecording, stopStreamRecording } from "./media.js";
import { registerSocialRoutes } from "./social.js";

async function bearer(req: FastifyRequest): Promise<User | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  const claims = verifyToken(h.slice(7));
  if (!claims) return null;
  const user = await Users.byId(claims.userId);
  // Once Privy is configured, legacy fallback identities must not authorize protected actions.
  if (privyConfigured() && !user?.privyId) return null;
  return user;
}

function handleFromName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "scout";
  return `${base}${Math.floor(Math.random() * 900 + 100)}`;
}

function viewerKey(req: FastifyRequest): string {
  const header = req.headers.authorization;
  const claims = header?.startsWith("Bearer ") ? verifyToken(header.slice(7)) : null;
  if (claims?.userId) return `user:${claims.userId}`;
  const anonymous = `${req.ip}|${req.headers["user-agent"] ?? "unknown"}`;
  return `anon:${createHmac("sha256", env.JWT_SECRET).update(anonymous).digest("hex")}`;
}

function validSpeakerUserId(userId: string): boolean {
  return !!userId?.trim() && userId !== "undefined" && userId !== "null";
}

export async function registerRoutes(app: FastifyInstance) {
  await registerSocialRoutes(app, bearer);
  app.get("/health", async () => ({ ok: true, chain: getChain().enabled ? "onchain" : "simulation" }));

  app.get("/time", async () => ({ serverTime: Date.now() }));

  // Feature discovery: clients use this to choose Privy vs fallback auth, LiveKit vs VOD, etc.
  app.get("/config", async () => ({
    auth: privyConfigured() ? "privy" : "fallback",
    livestream: livekitConfigured() ? "livekit" : "vod",
    analytics: envioConfigured() ? "envio" : "local",
    chain: getChain().enabled ? "onchain" : "simulation",
    monadChainId: env.MONAD_CHAIN_ID,
  }));

  // ---------- auth ----------
  // Privy sign-in (source of truth when configured): verify the Privy access token, upsert the
  // user with their embedded wallet, then mint our own app session token. Passkey-first happens
  // entirely on the client via the Privy SDK; the server just verifies the result.
  app.post("/auth/privy", async (req, reply) => {
    if (!privyConfigured()) return reply.code(400).send({ error: "privy-not-configured" });
    const body = (req.body ?? {}) as { accessToken?: string; displayName?: string };
    if (!body.accessToken) return reply.code(400).send({ error: "accessToken required" });

    let identity;
    try {
      identity = await verifyPrivyToken(body.accessToken);
    } catch (e) {
      req.log.warn({ e }, "privy verify failed");
      return reply.code(401).send({ error: "invalid-privy-token" });
    }
    if (!identity.walletAddress) return reply.code(400).send({ error: "no-embedded-wallet" });

    let user = await Users.byPrivyId(identity.privyId);
    if (!user) {
      const displayName = body.displayName?.trim() || identity.displayName || "Scout";
      try {
        user = await Users.create({
          authId: `privy:${identity.privyId}`,
          privyId: identity.privyId,
          displayName,
          handle: handleFromName(displayName),
          avatarUrl: null,
          walletAddress: identity.walletAddress,
          isCreator: false,
        });
      } catch (error) {
        // Two clients can exchange the same freshly-created Privy identity concurrently.
        user = await Users.byPrivyId(identity.privyId);
        if (!user) throw error;
      }
    } else if (user.walletAddress !== identity.walletAddress) {
      // Keep the embedded wallet in sync if Privy rotated/added it.
      await Users.linkPrivy(user.id, identity.privyId, identity.walletAddress);
      user = (await Users.byId(user.id))!;
    }
    return { token: issueToken(user.id), user: userView(user) };
  });

  app.post("/auth/login", async (req, reply) => {
    if (privyConfigured()) return reply.code(404).send({ error: "fallback-auth-disabled" });
    const body = (req.body ?? {}) as { provider?: string; email?: string; subject?: string; displayName?: string };
    const provider = body.provider ?? "email";
    const subject = body.email ?? body.subject;
    if (!subject) return reply.code(400).send({ error: "email or subject required" });

    const authId = normalizeAuthId(provider, subject);
    let user = await Users.byAuthId(authId);
    if (!user) {
      const wallet = deriveWallet(authId);
      const displayName = body.displayName?.trim() || subject.split("@")[0] || "Scout";
      user = await Users.create({
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

  app.post("/auth/passkey/register-options", async (req, reply) => {
    if (privyConfigured()) return reply.code(404).send({ error: "fallback-auth-disabled" });
    const body = (req.body ?? {}) as { displayName?: string };
    const displayName = body.displayName?.trim() || "Scout";
    const userHandle = b64urlStr(randomBytes(16));
    return {
      challenge: issueChallenge(),
      rp: { id: env.RP_ID, name: env.RP_NAME },
      user: { id: userHandle, name: `${displayName.toLowerCase().replace(/\s+/g, "")}@ennoia`, displayName },
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
    if (privyConfigured()) return reply.code(404).send({ error: "fallback-auth-disabled" });
    const body = (req.body ?? {}) as { credentialId?: string; clientDataJSON?: string; displayName?: string };
    if (!body.credentialId || !body.clientDataJSON) return reply.code(400).send({ error: "missing fields" });
    const v = verifyClientData(body.clientDataJSON, "webauthn.create", env.RP_ORIGINS);
    if (!v.ok) return reply.code(400).send({ error: v.error });

    const authId = `passkey:${body.credentialId}`;
    let user = await Users.byAuthId(authId);
    if (!user) {
      const wallet = deriveWallet(authId);
      const displayName = body.displayName?.trim() || "Scout";
      user = await Users.create({
        authId,
        displayName,
        handle: handleFromName(displayName),
        avatarUrl: null,
        walletAddress: wallet.address,
        isCreator: false,
      });
    }
    await Passkeys.add(body.credentialId, user.id, null);
    return { token: issueToken(user.id), user: userView(user) };
  });

  app.post("/auth/passkey/login-options", async (_req, reply) => {
    if (privyConfigured()) return reply.code(404).send({ error: "fallback-auth-disabled" });
    return {
      challenge: issueChallenge(),
      rpId: env.RP_ID,
      userVerification: "required",
      allowCredentials: [], // discoverable credentials — browser shows the passkey picker
      timeout: 60_000,
    };
  });

  app.post("/auth/passkey/login", async (req, reply) => {
    if (privyConfigured()) return reply.code(404).send({ error: "fallback-auth-disabled" });
    const body = (req.body ?? {}) as { credentialId?: string; clientDataJSON?: string };
    if (!body.credentialId || !body.clientDataJSON) return reply.code(400).send({ error: "missing fields" });
    const v = verifyClientData(body.clientDataJSON, "webauthn.get", env.RP_ORIGINS);
    if (!v.ok) return reply.code(400).send({ error: v.error });
    const userId = await Passkeys.userIdFor(body.credentialId);
    if (!userId) return reply.code(404).send({ error: "no-passkey-account" });
    const user = await Users.byId(userId);
    if (!user) return reply.code(404).send({ error: "no-passkey-account" });
    return { token: issueToken(user.id), user: userView(user) };
  });

  app.get("/me", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const chain = getChain();
    return {
      user: userView(user),
      wallet: { address: user.walletAddress, network: "Monad", onchain: chain.enabled },
    };
  });

  // ---------- streams ----------
  app.get("/streams", async (req) => {
    const user = await bearer(req);
    const blocked = new Set(user ? await Safety.blockedIds(user.id) : []);
    const streams = (await Streams.live()).filter((stream) => !blocked.has(stream.creatorId));
    return { streams: await Promise.all(streams.map((s) => streamView(s, hub.viewerCount(s.id)))) };
  });

  app.get("/streams/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    const active = await Promise.all((await Moments.activeForStream(id)).map(momentView));
    const now = Date.now();
    return {
      stream: await streamView(stream, hub.viewerCount(id)),
      sync: syncPayload(stream.startedAt, stream.durationSec, now),
      activeMoments: active,
      recentReactionCount: await Reactions.countForStream(id),
    };
  });

  // Clock sync (PRD §8/§40): clients derive playback + reaction timing from this.
  app.get("/streams/:id/sync", async (req, reply) => {
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    return syncPayload(stream.startedAt, stream.durationSec, Date.now());
  });

  app.get("/streams/:id/moments", async (req) => {
    const { id } = req.params as { id: string };
    const active = await Moments.activeForStream(id);
    return { active: await Promise.all(active.map(momentView)) };
  });

  // ---------- livestream (LiveKit) ----------
  // Go live: create/relaunch a stream owned by the caller. Room = stream id. When LiveKit is
  // configured the caller publishes into a real room; otherwise the stream carries a VOD url.
  app.post("/streams", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { title?: string; videoUrl?: string; durationSec?: number; thumbnailUrl?: string };
    const now = Date.now();
    const id = `stream_${user.handle}_${Math.floor(now / 1000)}`;
    const stream = await Streams.upsert({
      id,
      creatorId: user.id,
      title: body.title?.trim() || `${user.displayName} live`,
      // VOD fallback source; ignored by clients when the stream renders as a LiveKit room.
      videoUrl: body.videoUrl ?? "",
      durationSec: Number(body.durationSec ?? 0),
      thumbnailUrl: body.thumbnailUrl ?? null,
      startedAt: now,
      isLive: true,
      createdAt: now,
    });
    let recordingStarted = false;
    if (permanentMediaConfigured()) {
      try {
        const recording = await startStreamRecording(id);
        await Streams.setRecording(id, recording.egressId, recording.prefix, recording.startedAt);
        recordingStarted = true;
      } catch (error) {
        // Recording (LiveKit Egress → R2) is optional infra. If it can't start, go live
        // anyway — the stream works; permanent Moment clips just won't record for this one.
        req.log.warn({ error, streamId: id }, "permanent stream recording unavailable; going live without it");
      }
    }
    if (livekitConfigured()) await LiveRooms.hostPresence(id, false);
    return { stream: await streamView(stream, 0), recording: recordingStarted };
  });

  // Mint a LiveKit room token. The creator is host; approved speakers receive scoped publish grants.
  app.post("/streams/:id/livekit-token", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!livekitConfigured()) return reply.code(400).send({ error: "livekit-not-configured" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (!stream.isLive) return reply.code(409).send({ error: "stream-ended" });
    const speaker = await LiveRooms.speaker(id, user.id);
    const role = stream.creatorId === user.id ? "host" : speaker?.status === "approved" ? "speaker" : "viewer";
    const t = await roomTokenFor(user, id, role, speaker?.canCamera, speaker?.canScreenShare);
    return { url: t.url, token: t.token, room: t.room, role: t.role };
  });

  app.get("/streams/:id/live-room", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not-found" });
    const state = await LiveRooms.state(id);
    return {
      ...state,
      isLive: stream.isLive,
      role: stream.creatorId === user.id ? "host" : state.speakers.find((speaker) => speaker.userId === user.id)?.status === "approved" ? "speaker" : "viewer",
      mySpeaker: state.speakers.find((speaker) => speaker.userId === user.id) ?? null,
      speakers: stream.creatorId === user.id ? state.speakers : state.speakers.filter((speaker) => speaker.status === "approved"),
    };
  });

  app.post("/streams/:id/speaker-request", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not-found" });
    if (!stream.isLive) return reply.code(409).send({ error: "stream-ended" });
    if (stream.creatorId === user.id) return reply.code(400).send({ error: "host-cannot-request" });
    if (await Moderation.isBanned(id, user.id)) return reply.code(403).send({ error: "banned" });
    const current = await LiveRooms.speaker(id, user.id);
    // A repeated click or a stale room snapshot must not turn an existing invite into an error.
    // In particular, an invite still needs to be accepted by the viewer.
    if (current) return { ok: true, status: current.status };
    await LiveRooms.setSpeaker(id, user.id, "requested");
    return { ok: true, status: "requested" };
  });

  app.post("/streams/:id/speakers/:userId/invite", async (req, reply) => {
    const host = await bearer(req);
    if (!host) return reply.code(401).send({ error: "unauthorized" });
    const { id, userId } = req.params as { id: string; userId: string };
    if (!validSpeakerUserId(userId)) return reply.code(400).send({ error: "invalid-speaker-user-id" });
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not-found" });
    if (stream.creatorId !== host.id) return reply.code(403).send({ error: "host-only" });
    if (!stream.isLive) return reply.code(409).send({ error: "stream-ended" });
    if (userId === host.id || !await Users.byId(userId)) return reply.code(404).send({ error: "user-not-found" });
    await LiveRooms.setSpeaker(id, userId, "invited");
    return { ok: true };
  });

  app.post("/streams/:id/speaker-invite/accept", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream?.isLive) return reply.code(409).send({ error: "stream-not-live" });
    if ((await LiveRooms.speaker(id, user.id))?.status !== "invited") return reply.code(409).send({ error: "no-invitation" });
    await LiveRooms.setSpeaker(id, user.id, "approved", true);
    return { ok: true };
  });

  app.post("/streams/:id/speakers/:userId/approve", async (req, reply) => {
    const host = await bearer(req);
    if (!host) return reply.code(401).send({ error: "unauthorized" });
    const { id, userId } = req.params as { id: string; userId: string };
    if (!validSpeakerUserId(userId)) return reply.code(400).send({ error: "invalid-speaker-user-id" });
    const stream = await Streams.byId(id);
    if (!stream?.isLive) return reply.code(409).send({ error: "stream-not-live" });
    if (stream.creatorId !== host.id) return reply.code(403).send({ error: "host-only" });
    if ((await LiveRooms.speaker(id, userId))?.status !== "requested") return reply.code(409).send({ error: "no-request" });
    await LiveRooms.setSpeaker(id, userId, "approved", true);
    return { ok: true };
  });

  app.patch("/streams/:id/speakers/:userId", async (req, reply) => {
    const host = await bearer(req);
    if (!host) return reply.code(401).send({ error: "unauthorized" });
    const { id, userId } = req.params as { id: string; userId: string };
    if (!validSpeakerUserId(userId)) return reply.code(400).send({ error: "invalid-speaker-user-id" });
    const stream = await Streams.byId(id);
    if (!stream?.isLive) return reply.code(409).send({ error: "stream-not-live" });
    if (stream.creatorId !== host.id) return reply.code(403).send({ error: "host-only" });
    const speaker = await LiveRooms.speaker(id, userId);
    if (speaker?.status !== "approved") return reply.code(409).send({ error: "not-speaker" });
    const body = (req.body ?? {}) as { canCamera?: boolean; canScreenShare?: boolean };
    if (typeof body.canCamera !== "boolean" && typeof body.canScreenShare !== "boolean") return reply.code(400).send({ error: "no-permission-change" });
    await LiveRooms.setSpeaker(id, userId, "approved", body.canCamera ?? speaker.canCamera, body.canScreenShare ?? speaker.canScreenShare);
    return { ok: true };
  });

  app.delete("/streams/:id/speakers/:userId", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id, userId } = req.params as { id: string; userId: string };
    if (!validSpeakerUserId(userId)) return reply.code(400).send({ error: "invalid-speaker-user-id" });
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not-found" });
    if (stream.creatorId !== user.id && userId !== user.id) return reply.code(403).send({ error: "host-or-self-only" });
    await LiveRooms.setSpeaker(id, userId, null);
    return { ok: true };
  });

  app.post("/streams/:id/end", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (stream.creatorId !== user.id) return reply.code(403).send({ error: "creator-only" });
    const recording = await Streams.recording(id);
    await stopStreamRecording(recording?.egressId ?? null);
    await Streams.end(id);
    return { ok: true, endedAt: Date.now() };
  });

  // ---------- live chat (text conversation alongside reactions) ----------
  app.get("/streams/:id/chat", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!await Streams.byId(id)) return reply.code(404).send({ error: "not found" });
    const q = (req.query ?? {}) as { before?: string; limit?: string };
    const before = q.before ? Number(q.before) : undefined;
    const limit = q.limit ? Number(q.limit) : 50;
    return { messages: await LiveChat.recent(id, limit, before && Number.isFinite(before) ? before : undefined) };
  });

  app.post("/streams/:id/chat", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (!stream.isLive) return reply.code(409).send({ error: "stream-ended" });
    if (await Moderation.isBanned(id, user.id)) return reply.code(403).send({ error: "banned" });
    const body = (req.body ?? {}) as { body?: string; clientId?: string };
    const result = LiveChat.build(id, user, String(body.body ?? ""), typeof body.clientId === "string" ? body.clientId : undefined);
    if (!result.ok) {
      return reply.code(result.error === "rate-limited" ? 429 : 400).send({ error: result.error, maxLen: CHAT_MAX_LEN });
    }
    const m = result.message;
    // Broadcast FIRST (in-memory, instant), then persist asynchronously so a slow DB write can
    // never delay realtime delivery. clientId lets the sender reconcile its optimistic message.
    hub.broadcastStream(id, { t: "chat", streamId: id, serverBroadcastAt: Date.now(), message: { id: m.id, body: m.body, createdAt: m.createdAt, clientId: m.clientId, author: m.author } });
    void LiveChat.persist(m).catch((e) => req.log.error({ e, streamId: id }, "chat persist failed"));
    return { ok: true, message: m };
  });

  app.delete("/streams/:id/chat/:messageId", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id, messageId } = req.params as { id: string; messageId: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    const target = await LiveChat.authorOf(messageId);
    if (!target || target.streamId !== id) return reply.code(404).send({ error: "message-not-found" });
    // Host (moderation) or the message's own author may delete.
    if (stream.creatorId !== user.id && target.userId !== user.id) return reply.code(403).send({ error: "host-or-author-only" });
    const removed = await LiveChat.remove(messageId, user.id);
    if (removed) hub.broadcastStream(id, { t: "chat_deleted", streamId: id, messageId });
    return { ok: removed };
  });

  // ---------- analytics (host only) — real presence + persisted counters, no estimates ----------
  app.get("/streams/:id/analytics", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (stream.creatorId !== user.id) return reply.code(403).send({ error: "host-only" });
    const presence = hub.streamStats(id);
    const [reactionCount, momentCount, followers, newFollowers, latestFollower] = await Promise.all([
      Analytics.reactionCount(id),
      Analytics.momentCount(id),
      Analytics.followerCount(stream.creatorId),
      Analytics.newFollowers(stream.creatorId, stream.startedAt),
      Analytics.latestFollower(stream.creatorId),
    ]);
    return {
      currentViewers: presence.current,
      peakViewers: presence.peak,
      uniqueViewers: presence.unique,
      totalWatchTimeMs: presence.watchMs,
      streamDurationMs: Math.max(0, Date.now() - stream.startedAt),
      reactionCount,
      momentCount,
      followers,
      newFollowers,
      latestFollower,
    };
  });

  // ---------- moderation (bans / timeouts) — host only, realtime-enforced ----------
  app.get("/streams/:id/bans", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (stream.creatorId !== user.id) return reply.code(403).send({ error: "host-only" });
    return { bans: await Moderation.list(id) };
  });

  app.post("/streams/:id/bans", async (req, reply) => {
    const host = await bearer(req);
    if (!host) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (stream.creatorId !== host.id) return reply.code(403).send({ error: "host-only" });
    const body = (req.body ?? {}) as { userId?: string; kind?: BanKind; durationMs?: number };
    if (!body.userId || !validSpeakerUserId(body.userId)) return reply.code(400).send({ error: "invalid-user" });
    if (body.userId === host.id) return reply.code(400).send({ error: "cannot-ban-self" });
    if (!await Users.byId(body.userId)) return reply.code(404).send({ error: "user-not-found" });
    const kind: BanKind = body.kind === "timeout" ? "timeout" : "ban";
    await Moderation.apply(id, body.userId, kind, host.id, body.durationMs);
    // A ban revokes any speaker/guest state immediately.
    if (livekitConfigured()) await LiveRooms.setSpeaker(id, body.userId, null).catch(() => {});
    hub.broadcastStream(id, { t: "moderation", streamId: id, userId: body.userId, banned: true });
    hub.sendToUser(body.userId, { t: "moderation", streamId: id, userId: body.userId, banned: true });
    return { ok: true };
  });

  app.delete("/streams/:id/bans/:userId", async (req, reply) => {
    const host = await bearer(req);
    if (!host) return reply.code(401).send({ error: "unauthorized" });
    const { id, userId } = req.params as { id: string; userId: string };
    if (!validSpeakerUserId(userId)) return reply.code(400).send({ error: "invalid-user" });
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    if (stream.creatorId !== host.id) return reply.code(403).send({ error: "host-only" });
    await Moderation.remove(id, userId);
    hub.broadcastStream(id, { t: "moderation", streamId: id, userId, banned: false });
    hub.sendToUser(userId, { t: "moderation", streamId: id, userId, banned: false });
    return { ok: true };
  });

  // ---------- reactions ----------
  app.post("/reactions", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as {
      streamId?: string;
      type?: ReactionType;
      clientStreamTimeMs?: number;
      platform?: Platform;
      eventId?: string;
    };
    if (!body.streamId || !body.type) return reply.code(400).send({ error: "streamId and type required" });

    const result = await ingestReaction(user, {
      streamId: body.streamId,
      type: body.type,
      clientStreamTimeMs: Number(body.clientStreamTimeMs ?? 0),
      platform: body.platform ?? "web",
      eventId: body.eventId ?? "",
    });
    if (!result.ok) return reply.code(result.error === "reaction-rate-limited" ? 429 : 409).send({ error: result.error });
    return { ok: true, duplicate: result.duplicate ?? false };
  });

  // ---------- tips ----------
  // The client signs this transaction through the user's Privy wallet. The backend never
  // spends settler funds on a user's behalf.
  app.post("/streams/:id/tip", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    if (!await Streams.byId(id)) return reply.code(404).send({ error: "not found" });
    const chain = getChain();
    if (!chain.enabled || !chain.contract) return reply.code(503).send({ error: "chain-not-configured" });
    const body = (req.body ?? {}) as { amountWei?: string };
    const amountWei = BigInt(body.amountWei ?? "5000000000000000");
    const allowed = new Set([1_000_000_000_000_000n, 5_000_000_000_000_000n, 10_000_000_000_000_000n]);
    if (!allowed.has(amountWei)) return reply.code(400).send({ error: "unsupported-tip-amount" });
    return {
      transaction: {
        to: String(chain.contract.target),
        data: chain.contract.interface.encodeFunctionData("tip", [toBytes32(id)]),
        value: `0x${amountWei.toString(16)}`,
        chainId: env.MONAD_CHAIN_ID,
      },
      amountWei: amountWei.toString(),
      amountUsd: usd(amountWei),
    };
  });

  // ---------- manual clip ("Clip it") — does NOT grant Founding Curator status ----------
  app.post("/streams/:id/clip", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
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

  // ---------- development-only demo controls ----------
  if (env.ENABLE_DEMO_ROUTES) {
    app.get("/demo/crowd", async () => ({ crowd: demoCrowd(), label: "Demo crowd" }));
    app.post("/demo/force-spike", async (req) => {
      const { streamId } = (req.body ?? {}) as { streamId?: string };
      const sent = streamId ? await demoForceSpike(streamId) : 0;
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
  }

  // ---------- moments ----------
  app.get("/moments", async (req) => {
    const user = await bearer(req);
    const blocked = new Set(user ? await Safety.blockedIds(user.id) : []);
    const moments = (await Moments.publicFeed(50)).filter((moment) => !blocked.has(moment.creatorId));
    return { moments: await Promise.all(moments.map(momentView)) };
  });

  app.get("/moments/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = await Moments.byId(id);
    if (!m) return reply.code(404).send({ error: "not found" });
    await Moments.recordView(id, viewerKey(req));
    return { moment: await momentView(m) };
  });

  // ---------- earnings ----------
  app.get("/earnings/scout", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const entries = await Moments.curatorMomentsFor(user.id);
    let total = 0n;
    let firstFinds = 0;
    const rewards = [];
    for (const { moment, curator } of entries.sort((a, b) => (b.moment.confirmedAt ?? 0) - (a.moment.confirmedAt ?? 0))) {
        total += curator.rewardUnits;
        if (curator.rank === 1) firstFinds++;
        const view = await momentView(moment);
        rewards.push({
          momentId: moment.id,
          streamTitle: view.streamTitle,
          creator: view.creator,
          rank: curator.rank,
          rewardUnits: curator.rewardUnits.toString(),
          rewardUsd: usd(curator.rewardUnits),
          status: moment.settlement?.status ?? "pending",
          clip: moment.clip,
          confirmedAt: moment.confirmedAt,
        });
    }
    return {
      totalUnits: total.toString(),
      totalUsd: usd(total),
      momentsCurated: entries.length,
      firstFinds,
      rewards,
    };
  });

  app.get("/earnings/creator", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const moments = await Moments.createdByCreator(user.id);
    let total = 0n;
    const payouts = [];
    for (const m of moments) {
      const amt = m.settlement?.creatorAmountUnits ?? 0n;
      total += amt;
      const v = await momentView(m);
      payouts.push({
        momentId: m.id,
        streamTitle: v.streamTitle,
        rewardUnits: amt.toString(),
        rewardUsd: usd(amt),
        status: m.settlement?.status ?? "pending",
        clip: m.clip,
        foundingCuratorCount: m.foundingCurators.length,
        confirmedAt: m.confirmedAt,
      });
    }
    return {
      totalUnits: total.toString(),
      totalUsd: usd(total),
      momentsGenerated: moments.length,
      payouts,
    };
  });

  // ---------- feeds & leaderboards (Envio-indexed onchain activity; local fallback) ----------
  app.get("/feeds/trending", async () => {
    const indexed = await trendingMoments(30);
    if (indexed?.Moment?.length) {
      // Map Envio rows onto our local Moment DTOs where we still hold them (for clip/creator UI).
      const localByOnchainId = new Map(
        (await Moments.publicFeed(100)).map((moment) => [momentIdHash(moment.id).toLowerCase(), moment] as const)
      );
      const moments = await Promise.all(indexed.Moment.map(async (row) => {
        const local = localByOnchainId.get(row.id.toLowerCase());
        return local ? await momentView(local) : { id: row.id, streamId: row.streamId, category: row.category, foundingCuratorCount: row.curatorCount, settled: row.settled };
      }));
      return { source: "envio", moments };
    }
    return { source: "local", moments: await Promise.all((await Moments.publicFeed(30)).map(momentView)) };
  });

  app.get("/leaderboard", async () => {
    const indexed = await topCurators(20);
    if (indexed?.CuratorStats?.length) {
      const entries = indexed.CuratorStats.map((c, i) => ({
        rank: i + 1,
        walletAddress: c.id,
        totalUnits: c.totalRewards,
        totalUsd: usd(BigInt(c.totalRewards || "0")),
        firstFinds: c.firstFinds,
        momentsCurated: c.momentsCurated,
      }));
      return { source: "envio", entries };
    }
    const localRows = await Moments.curatorLeaderboard(20);
    const local = await Promise.all(localRows.map(async (r, i) => {
      const u = await Users.byId(r.userId);
      return {
        rank: i + 1,
        userId: r.userId,
        displayName: u?.displayName ?? "Scout",
        handle: u?.handle ?? null,
        walletAddress: u?.walletAddress ?? null,
        totalUnits: r.totalUnits.toString(),
        totalUsd: usd(r.totalUnits),
        firstFinds: r.firstFinds,
        momentsCurated: r.momentsCurated,
      };
    }));
    return { source: "local", entries: local };
  });

  // On-chain reward history for the signed-in user (Envio; empty when not configured).
  app.get("/rewards/history", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const history = await rewardHistory(user.walletAddress);
    return {
      source: history ? "envio" : "local",
      curator: history?.CuratorStats?.[0] ?? null,
      creator: history?.CreatorStats?.[0] ?? null,
    };
  });

  // ---------- trust, safety, and account controls ----------
  app.post("/reports", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { targetType?: ReportTarget; targetId?: string; reason?: string; details?: string };
    if (!body.targetType || !["stream", "moment", "post", "user"].includes(body.targetType) || !body.targetId?.trim() || !body.reason?.trim()) {
      return reply.code(400).send({ error: "targetType, targetId, and reason are required" });
    }
    if (body.reason.length > 80 || (body.details?.length ?? 0) > 1000) return reply.code(400).send({ error: "report-too-long" });
    const reportId = await Safety.report(user.id, body.targetType, body.targetId.trim(), body.reason.trim(), body.details);
    return reply.code(201).send({ reportId, status: "open" });
  });

  app.get("/blocks", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return { userIds: await Safety.blockedIds(user.id) };
  });

  app.post("/users/:id/block", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    if (!await Users.byId(id)) return reply.code(404).send({ error: "user-not-found" });
    if (id === user.id) return reply.code(400).send({ error: "cannot-block-self" });
    await Safety.block(user.id, id);
    return { ok: true };
  });

  app.delete("/users/:id/block", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    await Safety.unblock(user.id, id);
    return { ok: true };
  });

  app.get("/admin/reports", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!user.privyId || !env.ADMIN_PRIVY_IDS.includes(user.privyId)) return reply.code(403).send({ error: "admin-only" });
    return { reports: await Safety.openReports() };
  });

  app.post("/admin/reports/:id/resolve", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!user.privyId || !env.ADMIN_PRIVY_IDS.includes(user.privyId)) return reply.code(403).send({ error: "admin-only" });
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { status?: "resolved" | "dismissed" };
    if (body.status !== "resolved" && body.status !== "dismissed") return reply.code(400).send({ error: "invalid-status" });
    await Safety.resolveReport(id, body.status);
    return { ok: true };
  });

  app.delete("/me", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { confirmation?: string };
    if (body.confirmation !== "DELETE") return reply.code(400).send({ error: "confirmation-required" });
    if ((await Streams.live()).some((stream) => stream.creatorId === user.id)) {
      return reply.code(409).send({ error: "end-live-stream-before-account-deletion" });
    }
    const job = await AccountDeletions.stage(user);
    const externalDeletion = await processAccountDeletionJob(job.id);
    return { ok: true, externalDeletion: externalDeletion ? "complete" : "pending", onchainDataRetained: true };
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
