import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { env, chainConfigured, privyConfigured, livekitConfigured, envioConfigured } from "./env.js";
import { databaseReady, db, migrateDatabase } from "./db.js";
import { registerRoutes } from "./routes.js";
import { tick } from "./momentEngine.js";
import { seedIfEmpty, driveBots } from "./seed.js";
import { hub, type SocketLike } from "./realtime.js";
import { verifyToken } from "./auth.js";
import { getChain } from "./chain.js";
import { processPendingAccountDeletions } from "./accountDeletion.js";
import { LiveRooms } from "./liveRooms.js";
import { RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";
import { Streams } from "./store.js";

async function main() {
  const app = Fastify({ logger: { level: "warn" } });
  const requestTimers = new WeakMap<object, { startedAt: number; warning: NodeJS.Timeout }>();
  app.addHook("onRequest", async (request) => {
    if (request.headers.upgrade === "websocket") return;
    const startedAt = performance.now();
    const warning = setTimeout(() => {
      request.log.warn({ method: request.method, route: request.routeOptions.url ?? "unknown", durationMs: Math.round(performance.now() - startedAt) }, "request still pending");
    }, 10_000);
    warning.unref();
    requestTimers.set(request, { startedAt, warning });
  });
  app.addHook("onResponse", async (request, reply) => {
    const timing = requestTimers.get(request);
    if (!timing) return;
    clearTimeout(timing.warning);
    const durationMs = Math.round(performance.now() - timing.startedAt);
    if (durationMs >= 2_000) request.log.warn({ method: request.method, route: request.routeOptions.url ?? "unknown", statusCode: reply.statusCode, durationMs }, "slow request");
    requestTimers.delete(request);
  });
  const allowedOrigins = new Set(
    env.IS_PRODUCTION
      ? env.CORS_ORIGINS
      : [...env.CORS_ORIGINS, env.PUBLIC_WEB_URL, "http://localhost:5173", "http://127.0.0.1:5173"]
  );
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(sensible);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  await app.register(websocket);

  // LiveKit signs the exact raw body. Never accept an unsigned client claim of host presence.
  app.addContentTypeParser("application/webhook+json", { parseAs: "string" }, (_req, body, done) => done(null, body));

  await migrateDatabase();
  if (!(await databaseReady())) throw new Error("Database readiness check failed after migration.");

  await registerRoutes(app);

  if (livekitConfigured()) {
    const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    const rooms = new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws/, "http"), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    app.post("/webhooks/livekit", async (req, reply) => {
      let event;
      try {
        const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        event = await receiver.receive(body, req.headers.authorization);
      } catch {
        return reply.code(401).send({ error: "invalid-livekit-webhook" });
      }
      if (event.room?.name?.startsWith("stream_") && event.participant?.identity) {
        const streamId = event.room.name.slice("stream_".length);
        const stream = await Streams.byId(streamId);
        if (stream?.creatorId === event.participant.identity) {
          if (event.event === "participant_joined") await LiveRooms.hostPresence(streamId, true);
          if (event.event === "participant_left" || event.event === "participant_connection_aborted") {
            const connected = await rooms.listParticipants(event.room.name).then(
              (participants) => participants.some((participant) => participant.identity === stream.creatorId),
              () => false
            );
            await LiveRooms.hostPresence(streamId, connected);
          }
        }
      }
      return { ok: true };
    });
  }

  // Realtime endpoint. Clients subscribe to streams + their own user channel.
  app.get("/ws", { websocket: true }, (socket: SocketLike, req) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      socket.close(1008, "Origin not allowed");
      return;
    }
    const url = new URL(req.url ?? "/ws", "http://localhost");
    const conn = hub.add(socket, null);

    const initialStream = url.searchParams.get("stream");
    if (initialStream) hub.subscribe(conn, initialStream);

    socket.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        hub.touch(conn); // any inbound frame (incl. pong) keeps the connection alive
        if (msg.type === "pong") return;
        if (msg.type === "auth" && typeof msg.token === "string") {
          const claims = verifyToken(msg.token);
          if (!claims) return socket.send(JSON.stringify({ t: "auth", ok: false }));
          hub.authenticate(conn, claims.userId);
          socket.send(JSON.stringify({ t: "auth", ok: true }));
        } else if (msg.type === "subscribe" && msg.streamId) hub.subscribe(conn, msg.streamId);
        else if (msg.type === "unsubscribe" && msg.streamId) hub.unsubscribe(conn, msg.streamId);
      } catch {
        /* ignore malformed frames */
      }
    });
    socket.send(JSON.stringify({ t: "hello", serverTime: Date.now(), authed: false }));
  });

  if (env.ENABLE_SEED) await seedIfEmpty();

  await app.listen({ port: env.PORT, host: env.HOST });
  void processPendingAccountDeletions().catch((e) => console.error("account deletion retry error", e));

  const chain = getChain();
  console.log(`\n  ENNOIA backend on http://${env.HOST}:${env.PORT}`);
  console.log(`  Database:   ${db.dialect === "postgres" ? "Neon PostgreSQL" : "local SQLite (development only)"}`);
  console.log(`  Auth:       ${privyConfigured() ? "Privy (passkey + embedded wallet)" : "fallback (email + native WebAuthn)"}`);
  console.log(`  Livestream: ${livekitConfigured() ? "LiveKit rooms" : "fake-live VOD player"}`);
  console.log(`  Settlement: ${chain.enabled ? `REAL Monad tx (chainId ${env.MONAD_CHAIN_ID})` : "local simulation (no RPC/key configured)"}`);
  console.log(`  Analytics:  ${envioConfigured() ? "Envio indexer" : "database aggregates"}`);
  if (!chainConfigured() && chain.enabled) console.log("  (chain enabled via deployments file)");
  console.log("");

  // WebSocket keepalive — pings every 25s keep proxies from idle-closing connections and let
  // both sides detect dead sockets fast (root-cause fix for the ~30s realtime delay).
  setInterval(() => hub.heartbeat(), 25_000);

  // Engine lifecycle loop (detection safety net + confirmation/clip/settlement advancement).
  let tickRunning = false;
  setInterval(() => {
    if (tickRunning) return;
    tickRunning = true;
    void tick().catch((e) => console.error("tick error", e)).finally(() => { tickRunning = false; });
  }, 1000);

  setInterval(() => {
    void processPendingAccountDeletions().catch((e) => console.error("account deletion retry error", e));
  }, 60_000);

  let presenceRunning = false;
  setInterval(() => {
    if (presenceRunning) return;
    presenceRunning = true;
    void LiveRooms.reconcilePresence()
      .then(() => LiveRooms.endExpired())
      .catch((e) => console.error("live room grace expiration error", e))
      .finally(() => { presenceRunning = false; });
  }, 15_000);

  // Demo participant driver.
  if (env.ENABLE_SEED) {
    setInterval(() => {
      void driveBots(Date.now()).catch((e) => console.error("driveBots error", e));
    }, 500);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
