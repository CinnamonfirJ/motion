import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Minimal .env loader (avoids a dependency). Loads repo-root .env if present. */
function loadDotenv() {
  const candidates = [resolve(__dirname, "../../../.env"), resolve(process.cwd(), ".env")];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const key = m[1]!;
        let val = m[2]!.trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
    } catch {
      /* no .env — fine, use defaults/real env */
    }
  }
}
loadDotenv();

export type AppMode = "development" | "test" | "production";

function appMode(): AppMode {
  const value = process.env.APP_MODE ?? (process.env.NODE_ENV === "production" ? "production" : "development");
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error(`Invalid APP_MODE "${value}". Expected development, test, or production.`);
}

const list = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

const mode = appMode();

export const env = {
  APP_MODE: mode,
  IS_PRODUCTION: mode === "production",
  PORT: Number(process.env.PORT ?? 4000),
  HOST: process.env.HOST ?? "0.0.0.0",
  PUBLIC_WEB_URL: process.env.PUBLIC_WEB_URL ?? "http://localhost:5173",
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-only-ennoia-secret-change-me",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  DB_PATH: process.env.DB_PATH ?? resolve(__dirname, "../data/moment.sqlite"),
  CORS_ORIGINS: list(process.env.CORS_ORIGINS),

  /** Master mnemonic used to deterministically derive each user's embedded wallet. */
  WALLET_MASTER_MNEMONIC:
    process.env.WALLET_MASTER_MNEMONIC ??
    "test test test test test test test test test test test junk",

  /** Monad settlement. If unset, settlement runs in a local idempotent simulation. */
  MONAD_RPC_URL: process.env.MONAD_RPC_URL ?? "",
  MONAD_CHAIN_ID: Number(process.env.MONAD_CHAIN_ID ?? 10143), // Monad testnet
  MOMENT_REWARDS_ADDRESS: process.env.MOMENT_REWARDS_ADDRESS ?? "",
  SETTLER_PRIVATE_KEY: process.env.SETTLER_PRIVATE_KEY ?? "",
  /** Platform recipient of the 10% cut. Defaults to the settler address when unset. */
  PLATFORM_ADDRESS: process.env.PLATFORM_ADDRESS ?? "",
  MONAD_EXPLORER_TX: process.env.MONAD_EXPLORER_TX ?? "https://testnet.monadexplorer.com/tx/",

  /** Privy — auth + embedded-wallet source of truth. Blank APP_ID => fallback auth. */
  PRIVY_APP_ID: process.env.PRIVY_APP_ID ?? "",
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET ?? "",
  PRIVY_VERIFICATION_KEY: (process.env.PRIVY_VERIFICATION_KEY ?? "").replace(/\\n/g, "\n"),

  /** LiveKit — livestream A/V. Secrets stay server-side; blank URL => VOD fallback. */
  LIVEKIT_URL: process.env.LIVEKIT_URL ?? "",
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? "",
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? "",
  LIVEKIT_EGRESS_BUCKET: process.env.LIVEKIT_EGRESS_BUCKET ?? "",
  LIVEKIT_EGRESS_REGION: process.env.LIVEKIT_EGRESS_REGION ?? "",

  /** Cloudflare R2 (S3-compatible) — recordings and permanent Moment clips. */
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",
  R2_PUBLIC_BASE_URL: (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),

  /** Envio — Monad indexer GraphQL endpoint. Blank => local SQLite aggregates. */
  ENVIO_GRAPHQL_URL: process.env.ENVIO_GRAPHQL_URL ?? "",

  /**
   * Display peg: integer token units -> USD in the UI (display only, never affects on-chain
   * amounts). Default 2e15 units = $1 makes the default 0.02 MON/Moment pool read as ~$10
   * total (matching the design's dollar-scale rewards) while keeping real settlement cheap.
   */
  UNITS_PER_USD: BigInt(process.env.UNITS_PER_USD ?? "2000000000000000"),

  /** Seed demo streams + bot participants that drive reliable spikes for the demo. */
  ENABLE_SEED: (process.env.ENABLE_SEED ?? (mode === "development" ? "true" : "false")) === "true",
  ENABLE_DEMO_ROUTES: (process.env.ENABLE_DEMO_ROUTES ?? (mode === "development" ? "true" : "false")) === "true",
  ADMIN_PRIVY_IDS: list(process.env.ADMIN_PRIVY_IDS),

  /** Shared secret for the one-off demo content seeder (POST /admin/seed-demo). Inert unless set.
   *  Unlike ENABLE_SEED/ENABLE_DEMO_ROUTES this is allowed in production — it mutates nothing until
   *  called with the matching secret, and only writes clearly-tagged, reversible demo fixtures. */
  DEMO_SEED_SECRET: process.env.DEMO_SEED_SECRET ?? "",

  /** Passkey (WebAuthn) relying party. RP_ID must be a registrable domain of the web origin
   *  (use "localhost" for local dev — passkeys don't work over a raw LAN IP). */
  RP_ID: process.env.RP_ID ?? "localhost",
  RP_NAME: process.env.RP_NAME ?? "ENNOIA",
  /** Comma-separated allowed web origins; empty => allow localhost origins in dev. */
  RP_ORIGINS: list(process.env.RP_ORIGINS),
};

const productionRequirements: Array<[string, string]> = [
  ["DATABASE_URL", env.DATABASE_URL],
  ["JWT_SECRET", env.JWT_SECRET === "dev-only-ennoia-secret-change-me" ? "" : env.JWT_SECRET],
  ["PUBLIC_WEB_URL", env.PUBLIC_WEB_URL],
  ["CORS_ORIGINS", env.CORS_ORIGINS.join(",")],
  ["PRIVY_APP_ID", env.PRIVY_APP_ID],
  ["PRIVY_APP_SECRET", env.PRIVY_APP_SECRET],
  ["LIVEKIT_URL", env.LIVEKIT_URL],
  ["LIVEKIT_API_KEY", env.LIVEKIT_API_KEY],
  ["LIVEKIT_API_SECRET", env.LIVEKIT_API_SECRET],
  ["MONAD_RPC_URL", env.MONAD_RPC_URL],
  ["MOMENT_REWARDS_ADDRESS", env.MOMENT_REWARDS_ADDRESS],
  ["SETTLER_PRIVATE_KEY", env.SETTLER_PRIVATE_KEY],
  ["PLATFORM_ADDRESS", env.PLATFORM_ADDRESS],
  ["ENVIO_GRAPHQL_URL", env.ENVIO_GRAPHQL_URL],
  ["R2_ENDPOINT", env.R2_ENDPOINT],
  ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
  ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
  ["R2_BUCKET", env.R2_BUCKET],
  ["R2_PUBLIC_BASE_URL", env.R2_PUBLIC_BASE_URL],
];

/** Production never silently falls back to demo auth, VOD, SQLite, or simulated settlement. */
export function validateEnvironment(): void {
  if (!Number.isInteger(env.PORT) || env.PORT <= 0) throw new Error("PORT must be a positive integer.");
  if (!Number.isInteger(env.MONAD_CHAIN_ID) || env.MONAD_CHAIN_ID <= 0) throw new Error("MONAD_CHAIN_ID must be positive.");
  if (!env.IS_PRODUCTION) return;

  const missing = productionRequirements.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
  if (env.MONAD_CHAIN_ID !== 10143) throw new Error("Hackathon production must use Monad testnet chain id 10143.");
  if (env.ENABLE_SEED || env.ENABLE_DEMO_ROUTES) throw new Error("Seed data and demo mutation routes must be disabled in production.");
  if (!env.PUBLIC_WEB_URL.startsWith("https://")) throw new Error("PUBLIC_WEB_URL must use HTTPS in production.");
  if (env.CORS_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
    throw new Error("Every production CORS origin must use HTTPS.");
  }
}

/** True when a real Monad settlement path is fully configured. */
export function chainConfigured(): boolean {
  return Boolean(env.MONAD_RPC_URL && env.MOMENT_REWARDS_ADDRESS && env.SETTLER_PRIVATE_KEY);
}

/** True when Privy is the auth/wallet source of truth (else built-in fallback auth). */
export function privyConfigured(): boolean {
  return Boolean(env.PRIVY_APP_ID && env.PRIVY_APP_SECRET);
}

/** True when LiveKit can mint room tokens (else the fake-live VOD player is used). */
export function livekitConfigured(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

/** True when Envio-indexed analytics are available (else local SQLite aggregates). */
export function envioConfigured(): boolean {
  return Boolean(env.ENVIO_GRAPHQL_URL);
}

validateEnvironment();
