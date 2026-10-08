import type { FastifyInstance, FastifyRequest } from "fastify";
import { streamPositionSec, type Platform, type ReactionType, type User } from "@ennoia/core";
import { Users, Streams, Moments, Reactions, Safety, AccountDeletions, type ReportTarget } from "./store.js";
import { deriveWallet, issueToken, verifyToken, normalizeAuthId } from "./auth.js";
import { issueChallenge, verifyClientData, Passkeys } from "./passkey.js";
import { env, privyConfigured, livekitConfigured, envioConfigured } from "./env.js";
import { fetchPrivyIdentity, syncPrivyProfile, verifyPrivyAccessToken } from "./privy.js";
import { fundNewAccount, issueMeraChallenge, verifyMeraSignIn } from "./mera.js";
import { processAccountDeletionJob } from "./accountDeletion.js";
import { roomTokenFor } from "./livekit.js";
import { LiveRooms } from "./liveRooms.js";
import { LiveChat, CHAT_MAX_LEN } from "./liveChat.js";
import { Moderation, type BanKind } from "./moderation.js";
import { Analytics } from "./analytics.js";
import { topCurators, trendingMoments, rewardHistory } from "./envio.js";
import { createHmac, randomBytes } from "node:crypto";
import { ingestReaction, config, demoFastForwardSettlement, manualClipPostRollRemainingMs, requestManualClip, claimClipUpload, attachClipVideo } from "./momentEngine.js";
import { demoCrowd, demoForceSpike, demoResetStream } from "./seed.js";
import { hub } from "./realtime.js";
import { isPaid, momentView, momentViews, mon, streamView, userView, usd } from "./view.js";
import { getChain, momentIdHash, toBytes32 } from "./chain.js";
import { reconcileStreamTime, streamTimeMs } from "@ennoia/core";
import { clipUploadConfigured, permanentMediaConfigured, startStreamRecording, stopStreamRecording, uploadMomentClipVideo } from "./media.js";
import { registerSocialRoutes } from "./social.js";
import { seedDemo, clearDemoData } from "./demoSeed.js";

async function bearer(req: FastifyRequest): Promise<User | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  const claims = verifyToken(h.slice(7));
  if (!claims) return null;
  const user = await Users.byId(claims.userId);
  if (!user) return null;
  // Outside the local fallback mode, legacy email/WebAuthn identities must not authorize anything.
  if (env.AUTH_PROVIDER !== "fallback" && !isMeraUser(user) && !(privyConfigured() && user.privyId)) return null;
  return user;
}

const MERA_AUTH_PREFIX = "mera:";
const isMeraUser = (user: User) => user.authId.startsWith(MERA_AUTH_PREFIX);

function isAdmin(user: User): boolean {
  if (isMeraUser(user)) return env.ADMIN_ADDRESSES.includes(user.walletAddress.toLowerCase());
  return !!user.privyId && env.ADMIN_PRIVY_IDS.includes(user.privyId);
}

function handleFromName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "scout";
  return `${base}${Math.floor(Math.random() * 900 + 100)}`;
}

/** Batch stream titles by id (unique + parallel) — avoids a momentView per earnings row. */
async function streamTitles(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const streams = await Promise.all(unique.map((id) => Streams.byId(id)));
  return new Map(streams.flatMap((s) => (s ? [[s.id, s.title] as const] : [])));
}

/** Batch creator mini-DTOs by id (unique + parallel). */
async function creatorMinis(ids: string[]): Promise<Map<string, { id: string; displayName: string; handle: string; avatarUrl: string | null }>> {
  const unique = [...new Set(ids)];
  const users = await Promise.all(unique.map((id) => Users.byId(id)));
  return new Map(users.flatMap((u) => (u ? [[u.id, { id: u.id, displayName: u.displayName, handle: u.handle, avatarUrl: u.avatarUrl }] as const] : [])));
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

  // Feature discovery: clients use this to choose Mera vs fallback auth, LiveKit vs VOD, etc.
  app.get("/config", async () => ({
    auth: env.AUTH_PROVIDER,
    // The only contract web clients may sign for without a fresh passkey prompt (tips).
    momentRewardsAddress: getChain().contract ? String(getChain().contract!.target) : null,
    livestream: livekitConfigured() ? "livekit" : "vod",
    analytics: envioConfigured() ? "envio" : "local",
    chain: getChain().enabled ? "onchain" : "simulation",
    monadChainId: env.MONAD_CHAIN_ID,
  }));

  // ---------- auth ----------
  // Mera sign-in: the passkey-derived Monad address is the identity. The client signs a
  // single-use challenge inside the Mera session its passkey ceremony just opened (no extra
  // prompt); we recover the address and upsert the user. No key, PRF output or passkey data
  // ever reaches the server, so clearing client storage or switching devices loses nothing.
  const authLimit = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.post("/auth/mera/challenge", authLimit, async (_req, reply) => {
    if (env.AUTH_PROVIDER !== "mera") return reply.code(404).send({ error: "mera-disabled" });
    return issueMeraChallenge();
  });

  app.post("/auth/mera", authLimit, async (req, reply) => {
    if (env.AUTH_PROVIDER !== "mera") return reply.code(404).send({ error: "mera-disabled" });
    const body = (req.body ?? {}) as { message?: string; signature?: string; displayName?: string };
    if (typeof body.message !== "string" || typeof body.signature !== "string") {
      return reply.code(400).send({ error: "message and signature required" });
    }
    let address: string;
    try {
      address = verifyMeraSignIn(body.message, body.signature);
    } catch (e) {
      return reply.code(401).send({ error: (e as Error).message });
    }

    const authId = `${MERA_AUTH_PREFIX}${address.toLowerCase()}`;
    let user = await Users.byAuthId(authId);
    if (!user) {
      const displayName = body.displayName?.trim().slice(0, 40) || "Scout";
      try {
        user = await Users.create({
          authId,
          displayName,
          handle: handleFromName(displayName),
          avatarUrl: null,
          walletAddress: address,
          isCreator: false,
        });
      } catch (error) {
        // Two tabs can finish the same first sign-in concurrently.
        user = await Users.byAuthId(authId);
        if (!user) throw error;
      }
      fundNewAccount(address, req.log);
    }
    return { token: issueToken(user.id), user: userView(user) };
  });

  // Legacy Privy sign-in, kept for clients that have not moved to Mera (mobile): verify the Privy access token, upsert the
  // user with their embedded wallet, then mint our own app session token. Passkey-first happens
  // entirely on the client via the Privy SDK; the server just verifies the result.
  app.post("/auth/privy", async (req, reply) => {
    if (!privyConfigured()) return reply.code(400).send({ error: "privy-not-configured" });
    const body = (req.body ?? {}) as { accessToken?: string; displayName?: string };
    if (!body.accessToken) return reply.code(400).send({ error: "accessToken required" });

    let privyId;
    try {
      privyId = await verifyPrivyAccessToken(body.accessToken);
    } catch (e) {
      req.log.warn({ e }, "privy verify failed");
      return reply.code(401).send({ error: "invalid-privy-token" });
    }

    // Returning users with a known wallet skip the Privy user API round trip (~1s) on sign-in;
    // the wallet is re-synced in the background in case Privy rotated it.
    const known = await Users.byPrivyId(privyId);
    if (known?.walletAddress) {
      void fetchPrivyIdentity(privyId)
        .then((fresh) => {
          if (fresh.walletAddress && fresh.walletAddress !== known.walletAddress)
            return Users.linkPrivy(known.id, privyId, fresh.walletAddress);
        })
        .catch((e) => req.log.warn({ e }, "privy wallet resync failed"));
      return { token: issueToken(known.id), user: userView(known) };
    }

    let identity;
    try {
      identity = await fetchPrivyIdentity(privyId);
    } catch (e) {
      req.log.warn({ e }, "privy user lookup failed");
      return reply.code(401).send({ error: "invalid-privy-token" });
    }
    if (!identity.walletAddress) return reply.code(400).send({ error: "no-embedded-wallet" });

    let user = known;
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
    if (env.AUTH_PROVIDER !== "fallback") return reply.code(404).send({ error: "fallback-auth-disabled" });
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
    if (env.AUTH_PROVIDER !== "fallback") return reply.code(404).send({ error: "fallback-auth-disabled" });
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
    if (env.AUTH_PROVIDER !== "fallback") return reply.code(404).send({ error: "fallback-auth-disabled" });
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
    if (env.AUTH_PROVIDER !== "fallback") return reply.code(404).send({ error: "fallback-auth-disabled" });
    return {
      challenge: issueChallenge(),
      rpId: env.RP_ID,
      userVerification: "required",
      allowCredentials: [], // discoverable credentials — browser shows the passkey picker
      timeout: 60_000,
    };
  });

  app.post("/auth/passkey/login", async (req, reply) => {
    if (env.AUTH_PROVIDER !== "fallback") return reply.code(404).send({ error: "fallback-auth-disabled" });
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

  // Update the caller's editable profile (name / handle / avatar). Writes the DB, then mirrors
  // to Privy custom metadata (best-effort — DB is the authority the app reads from).
  app.patch("/me", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { displayName?: string; handle?: string; avatarUrl?: string | null };

    let displayName = user.displayName;
    if (body.displayName !== undefined) {
      const dn = String(body.displayName).trim();
      if (dn.length < 1 || dn.length > 40) return reply.code(400).send({ error: "invalid-display-name" });
      displayName = dn;
    }

    let handle = user.handle;
    if (body.handle !== undefined) {
      const h = String(body.handle).trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(h)) return reply.code(400).send({ error: "invalid-handle" });
      if (h !== user.handle.toLowerCase()) {
        const existing = await Users.byHandle(h);
        if (existing && existing.id !== user.id) return reply.code(409).send({ error: "handle-taken" });
      }
      handle = h;
    }

    let avatarUrl = user.avatarUrl;
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl === null || body.avatarUrl === "") {
        avatarUrl = null;
      } else {
        const url = String(body.avatarUrl);
        // Only accept URLs we host (an object uploaded via /media/post-upload).
        if (!env.R2_PUBLIC_BASE_URL || !url.startsWith(`${env.R2_PUBLIC_BASE_URL}/`) || url.length > 2048) {
          return reply.code(400).send({ error: "invalid-avatar-url" });
        }
        avatarUrl = url;
      }
    }

    await Users.updateProfile(user.id, { displayName, handle, avatarUrl });

    let privySynced = false;
    if (user.privyId) {
      try {
        await syncPrivyProfile(user.privyId, { displayName, handle, avatarUrl });
        privySynced = true;
      } catch (error) {
        req.log.warn({ error }, "privy-profile-sync-failed");
      }
    }

    const updated = await Users.byId(user.id);
    return { user: userView(updated!), privySynced };
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
    const active = await momentViews(await Moments.activeForStream(id));
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
    return { active: await momentViews(active) };
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
    const postRollMs = await manualClipPostRollRemainingMs(id);
    if (postRollMs > 0) await new Promise((resolve) => setTimeout(resolve, postRollMs));
    const recording = await Streams.recording(id);
    await stopStreamRecording(recording?.egressId ?? null);
    await Streams.end(id);
    hub.broadcastStream("feed", { t: "feed" });
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
  // The client signs this transaction with the user's Mera passkey account. The backend never
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

  // Announce a confirmed tip to the room instantly (the indexer catches up later). Verified
  // against the onchain receipt: sent by this user to MomentRewards, and it succeeded.
  app.post("/streams/:id/tip/confirmed", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const { txHash } = (req.body ?? {}) as { txHash?: string };
    const chain = getChain();
    if (!chain.enabled || !chain.provider || !chain.contract || !txHash) return reply.code(400).send({ error: "invalid-tip" });
    const [tx, receipt] = await Promise.all([chain.provider.getTransaction(txHash), chain.provider.getTransactionReceipt(txHash)]);
    const contract = String(chain.contract.target).toLowerCase();
    if (!tx || !receipt || receipt.status !== 1 || tx.to?.toLowerCase() !== contract || tx.from.toLowerCase() !== user.walletAddress.toLowerCase()) {
      return reply.code(409).send({ error: "tip-not-confirmed" });
    }
    hub.broadcastStream(id, { t: "tip", streamId: id, from: user.displayName, amountUsd: usd(tx.value), txHash });
    return { ok: true };
  });

  // ---------- manual clip ("Clip it") — does NOT grant Founding Curator status ----------
  app.post("/streams/:id/clip", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const stream = await Streams.byId(id);
    if (!stream) return reply.code(404).send({ error: "not found" });
    const body = (req.body ?? {}) as { clientStreamTimeMs?: number; browserRecording?: boolean };
    const now = Date.now();
    const clientTime = Number(body.clientStreamTimeMs);
    const at = reconcileStreamTime(
      Number.isFinite(clientTime) ? clientTime : streamTimeMs(stream.startedAt, now),
      stream.startedAt,
      now
    );
    try {
      const moment = await requestManualClip(id, at, body.browserRecording === true);
      const upload = body.browserRecording === true && await claimClipUpload(moment.id, user.id);
      return {
        ok: true,
        momentId: moment.id,
        upload,
        clip: {
          url: moment.clip.url,
          durationSec: moment.clip.durationSec,
          ready: moment.clip.ready,
          manual: true,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message === "stream-not-live") return reply.code(409).send({ error: error.message });
      if (error instanceof Error && error.message === "recording-not-available") return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  // ---------- browser-recorded Moment clips ----------
  // A web client that captured the Moment in its rolling buffer asks to upload; first claim wins.
  app.post("/moments/:id/clip-claim", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    return { upload: clipUploadConfigured() && await claimClipUpload(id, user.id) };
  });

  app.post("/moments/:id/clip-video", { bodyLimit: 16_000_000 }, async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const { start, end } = req.query as { start?: string; end?: string };
    const contentType = String(req.headers["content-type"] ?? "").split(";")[0]!.trim();
    const bytes = req.body as unknown;
    if (!Buffer.isBuffer(bytes) || bytes.length < 1) return reply.code(400).send({ error: "invalid-clip" });
    if (!await claimClipUpload(id, user.id)) return reply.code(409).send({ error: "clip-not-claimed" });
    const url = await uploadMomentClipVideo(id, bytes, contentType);
    await attachClipVideo(id, user.id, url, Number(start) || 0, Number(end) || 35);
    return reply.code(201).send({ ok: true, url });
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
    return { moments: await momentViews(moments) };
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
    const entries = (await Moments.curatorMomentsFor(user.id)).sort((a, b) => (b.moment.confirmedAt ?? 0) - (a.moment.confirmedAt ?? 0));
    let total = 0n;
    let pending = 0n;
    let firstFinds = 0;
    for (const { moment, curator } of entries) {
      if (isPaid(moment.settlement)) total += curator.rewardUnits;
      else pending += curator.rewardUnits;
      if (curator.rank === 1) firstFinds++;
    }
    // Batch the stream titles + creators (instead of a full momentView per entry).
    const titleById = await streamTitles(entries.map((e) => e.moment.streamId));
    const creatorById = await creatorMinis(entries.map((e) => e.moment.creatorId));
    const rewards = entries.map(({ moment, curator }) => ({
      momentId: moment.id,
      streamTitle: titleById.get(moment.streamId) ?? "",
      creator: creatorById.get(moment.creatorId) ?? null,
      rank: curator.rank,
      rewardUnits: curator.rewardUnits.toString(),
      rewardUsd: usd(curator.rewardUnits),
      status: moment.settlement?.status ?? "pending",
      clip: moment.clip,
      confirmedAt: moment.confirmedAt,
    }));
    return {
      totalUnits: total.toString(),
      totalUsd: usd(total),
      totalMon: mon(total),
      pendingUnits: pending.toString(),
      pendingUsd: usd(pending),
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
    let pending = 0n;
    for (const m of moments) {
      if (isPaid(m.settlement)) total += m.settlement!.creatorAmountUnits;
      else pending += m.settlement?.creatorAmountUnits ?? 0n;
    }
    const titleById = await streamTitles(moments.map((m) => m.streamId));
    const payouts = moments.map((m) => {
      const amt = m.settlement?.creatorAmountUnits ?? 0n;
      return {
        momentId: m.id,
        streamTitle: titleById.get(m.streamId) ?? "",
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
      totalMon: mon(total),
      pendingUnits: pending.toString(),
      pendingUsd: usd(pending),
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
    return { source: "local", moments: await momentViews(await Moments.publicFeed(30)) };
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
    if (!isAdmin(user)) return reply.code(403).send({ error: "admin-only" });
    return { reports: await Safety.openReports() };
  });

  app.post("/admin/reports/:id/resolve", async (req, reply) => {
    const user = await bearer(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!isAdmin(user)) return reply.code(403).send({ error: "admin-only" });
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { status?: "resolved" | "dismissed" };
    if (body.status !== "resolved" && body.status !== "dismissed") return reply.code(400).send({ error: "invalid-status" });
    await Safety.resolveReport(id, body.status);
    return { ok: true };
  });

  // ---------- one-off demo content seeder (screenshot fixtures) ----------
  // Gated by DEMO_SEED_SECRET (inert unless that env is set). Attaches reversible, clearly-tagged
  // demo data — moments, earnings, posts, followers, a cast of accounts — to the account whose
  // @handle you pass (the one you signed into the app with). Safe to re-run: it resets first.
  app.post("/admin/seed-demo", async (req, reply) => {
    const body = (req.body ?? {}) as { handle?: string; secret?: string; reset?: boolean; clearOnly?: boolean };
    const provided = (req.headers["x-seed-secret"] as string | undefined) ?? body.secret;
    if (!env.DEMO_SEED_SECRET || provided !== env.DEMO_SEED_SECRET) return reply.code(403).send({ error: "forbidden" });
    try {
      if (body.clearOnly) {
        const counts = await clearDemoData();
        // Optionally undo the seeded profile bits on a real account (isCreator + demo avatar).
        const profileReset = body.handle ? await Users.resetSeededProfile(body.handle, `${env.R2_PUBLIC_BASE_URL}/demo/`) : 0;
        return { cleared: true, ...counts, profileReset };
      }
      if (!body.handle) return reply.code(400).send({ error: "handle-required" });
      return await seedDemo({ targetHandle: body.handle, reset: body.reset !== false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      req.log.error({ error }, "demo-seed-failed");
      return reply.code(message === "target-not-found" ? 404 : 500).send({ error: message });
    }
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
