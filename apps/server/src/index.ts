import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { env, chainConfigured } from "./env.js";
import "./db.js";
import { registerRoutes } from "./routes.js";
import { tick } from "./momentEngine.js";
import { seedIfEmpty, driveBots } from "./seed.js";
import { hub, type SocketLike } from "./realtime.js";
import { verifyToken } from "./auth.js";
import { getChain } from "./chain.js";

async function main() {
  const app = Fastify({ logger: { level: "warn" } });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  await registerRoutes(app);

  // Realtime endpoint. Clients subscribe to streams + their own user channel.
  app.get("/ws", { websocket: true }, (socket: SocketLike, req) => {
    const url = new URL(req.url ?? "/ws", "http://localhost");
    const token = url.searchParams.get("token");
    const userId = token ? verifyToken(token)?.userId ?? null : null;
    const conn = hub.add(socket, userId);

    const initialStream = url.searchParams.get("stream");
    if (initialStream) hub.subscribe(conn, initialStream);

    socket.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "subscribe" && msg.streamId) hub.subscribe(conn, msg.streamId);
        else if (msg.type === "unsubscribe" && msg.streamId) hub.unsubscribe(conn, msg.streamId);
      } catch {
        /* ignore malformed frames */
      }
    });
    socket.send(JSON.stringify({ t: "hello", serverTime: Date.now(), authed: Boolean(userId) }));
  });

  if (env.ENABLE_SEED) seedIfEmpty();

  await app.listen({ port: env.PORT, host: env.HOST });

  const chain = getChain();
  console.log(`\n  Moment backend on http://${env.HOST}:${env.PORT}`);
  console.log(`  Settlement: ${chain.enabled ? "REAL Monad transactions" : "local simulation (no RPC/key configured)"}`);
  if (!chainConfigured() && chain.enabled) console.log("  (chain enabled via deployments file)");
  console.log("");

  // Engine lifecycle loop (detection safety net + confirmation/clip/settlement advancement).
  setInterval(() => {
    tick().catch((e) => console.error("tick error", e));
  }, 1000);

  // Demo participant driver.
  if (env.ENABLE_SEED) {
    setInterval(() => {
      try {
        driveBots(Date.now());
      } catch (e) {
        console.error("driveBots error", e);
      }
    }, 500);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
