# ENNOIA

> Spot the livestream moment before everyone else — and get paid for being early.

ENNOIA turns real-time audience reactions into **paid curation**. Viewers ("Scouts") watch
live streams and react. When reactions spike, the backend detects a **Moment**, captures a
35-second clip (15s before + 20s after), confirms it against the crowd, names the earliest
qualifying Scouts as **Founding Curators**, and settles rewards to the creator and curators
**on Monad**.

This repo implements the full loop across **web, iOS and Android**, sharing one backend,
one identity/embedded-wallet, and one core logic package.

```
Scout watches → reacts → reactions spike → Moment detected → Moment confirmed
→ Founding Curators selected → 35s clip generated → reward settled on Monad
→ Moment published → earnings updated
```

---

## Architecture

A **pnpm monorepo**. Product intelligence lives server-side and in one shared package, so
clients stay thin and never re-implement business logic per platform (PRD §9, §41).

| Package | What it is | Notes |
|---|---|---|
| `packages/core` | **Shared TypeScript logic**: spike detection, confirmation, Founding-Curator selection, reward math, Moment state machine, stream clock, Merkle batch commitment, config. | Framework-agnostic, no I/O. Imported by the backend **and** every client. 42 unit tests. |
| `packages/contracts` | **`MomentRewards.sol`** on Monad: commitments, Moments, tips, and idempotent settlement. | Hardhat. 8 tests incl. duplicate-settlement protection. |
| `packages/indexer` | **Envio HyperIndex** for `MomentRewards` events, rolling creator/curator/stream analytics and GraphQL. | Run under Linux/WSL; the app falls back to SQLite when unavailable. |
| `apps/server` | **Backend** (Fastify + WebSocket + Neon PostgreSQL): authoritative stream clock, reactions, LiveKit/R2 clips, Moment engine, Monad settlement, earnings, realtime, safety. | Owns all product-critical state. SQLite is development-only. |
| `apps/web` | **Web app** (Vite + React + Tailwind). | Design tokens from `PRODUCT-DESIGN.md`. |
| `apps/mobile` | **iOS + Android** (Expo / React Native). | One codebase, imports `@ennoia/core`. |

**Why this shape:** the PRD's hardest risks are (1) the rolling clip buffer, (2) one
authoritative stream clock, and (3) building the same feature three times. All three are
solved by keeping timing, detection, clipping and settlement on the server + shared core,
and making clients render state they receive over REST + WebSocket.

### The authoritative stream clock
Every stream has a server-authoritative `startedAt`. Playback position, reaction
timestamps, spike detection and clipping all derive from it (`@ennoia/core/time`). Clients
measure a clock offset (NTP-style midpoint) and never trust their own wall clock. Mobile
resynchronizes on foreground.

### Moment state machine
`NORMAL → CANDIDATE → DETECTING → CONFIRMED → CLIPPING → SETTLING → PUBLISHED → SETTLED`
(plus `EXPIRED` for candidates that fail confirmation). Transitions are validated; a Moment
can never settle before it confirms, and settlement is idempotent on-chain and in the engine.

### Auth, streaming and indexing
`APP_MODE=development` permits the zero-credential local demo. `APP_MODE=production`
fails startup unless Neon, Privy, LiveKit, R2, Monad, Envio, CORS, and signing configuration
are all present; production never silently falls back to mocks.

- **Privy** is the production source of truth for passkey authentication and the user's
  embedded EVM wallet. The backend verifies Privy access tokens, maps the Privy identity into
  the existing user/session model, and disables legacy auth routes while Privy is configured.
- **LiveKit** carries real room audio/video. LiveKit Egress records HLS segments into
  **Cloudflare R2**, and the backend creates permanent 15-second pre-roll + 20-second
  post-roll Moment playlists. Clients receive only short-lived room tokens.
- **Monad** records economically meaningful activity through `MomentRewards.sol`: reaction
  commitments, Moments, Founding Curators, tips and reward settlement.
- **Envio** indexes those contract events for feeds, leaderboards and reward analytics. It is
  never used as the application database; Neon owns profiles, streams and raw reactions.

When Privy is absent, the original WebAuthn/email plus deterministic-wallet path is available
for local demo use only. See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for setup.

---

## Quick start

Requires **Node ≥ 20** and **pnpm**. From the repo root:

```bash
pnpm install
cp .env.example .env            # optional; sensible defaults work out of the box
pnpm build:core                 # compile the shared package once
```

Run the three surfaces (separate terminals):

```bash
pnpm dev:server                 # backend on http://localhost:4000  (seeds demo streams + bots)
pnpm dev:web                    # web on http://localhost:5173
pnpm dev:mobile                 # Expo — press i (iOS), a (Android), or scan the QR
```

Open the web app, sign in with a passkey or email in fallback mode, open a live stream, and
react. Seeded bot Scouts drive periodic spikes, so a
Moment forms within a minute — you'll see **MOMENT DETECTED**, and if you reacted early
enough, the **Founding Curator** celebration, then the settled reward in **Earnings**.

> **Mobile → localhost:** a device/emulator can't reach `localhost`. Set
> `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` to your machine's LAN IP (e.g.
> `http://192.168.1.20:4000`) in `.env` before `pnpm dev:mobile`.

### Tests

```bash
pnpm test                       # @ennoia/core (spike, curators, rewards, state machine, clock)
pnpm test:contracts             # MomentRewards.sol (settlement, idempotency, access)
```

---

## Real Monad settlement

Out of the box the backend runs an **idempotent local settlement simulation** (clearly
flagged in logs and in the onchain receipt as "Simulation") so the demo is reliable with
zero setup. To settle **real** transactions on Monad testnet:

```bash
# 1. Fund a deployer key with testnet MON, then deploy + fund the reward pool:
cd packages/contracts
DEPLOYER_PRIVATE_KEY=0x... FUND_AMOUNT_ETHER=0.5 pnpm deploy:monad
#   → writes packages/contracts/deployments/monadTestnet.json (address + ABI)

# 2. Point the backend at it (.env):
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MOMENT_REWARDS_ADDRESS=0x...        # from the deploy output (or auto-read from deployments/)
SETTLER_PRIVATE_KEY=0x...           # a funded key authorized as settler

# 3. Restart the backend — /health now reports "onchain", and each confirmed Moment sends a
#    real settleMoment tx. The Moment detail screen's onchain receipt links to the explorer.
```

`settleMoment` is idempotent on-chain (a `momentId` reverts `AlreadySettled` on a second
attempt), so retries after an RPC failure never double-pay. Reaction provenance is committed
in batches via `commitReactionBatch` (a Merkle root over reaction leaves) rather than one tx
per reaction.

---

## Environment variables

See `.env.example` for an overview and each app's own `.env.example` for the complete list.
Nothing is required for the local simulation demo. Only `VITE_*` and `EXPO_PUBLIC_*` values
may be exposed to clients; Privy, LiveKit and signing secrets are server-only.

| Variable | Used by | Purpose |
|---|---|---|
| `APP_MODE`, `PORT`, `HOST`, `PUBLIC_WEB_URL`, `CORS_ORIGINS`, `JWT_SECRET`, `DATABASE_URL` | server | Runtime mode, origins, sessions, and Neon database. |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | server | Verify Privy users and embedded wallets. Optional `PRIVY_VERIFICATION_KEY` enables offline verification. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | server | Mint scoped host/speaker/viewer room tokens and verify LiveKit webhooks. |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | server | LiveKit Egress, permanent Moment storage, and social post uploads. |
| `ENVIO_GRAPHQL_URL` | server | Read indexed analytics; blank uses SQLite fallback. |
| `WALLET_MASTER_MNEMONIC` | server | Fallback-only deterministic wallets. **Set a real secret in shared demo envs.** |
| `UNITS_PER_USD` | server | Display peg (units→USD). Does not affect on-chain amounts. |
| `ENABLE_SEED` | server | Demo streams + bot participants (default `true`). |
| `MONAD_RPC_URL`, `MOMENT_REWARDS_ADDRESS`, `SETTLER_PRIVATE_KEY` | server | Enable real Monad settlement. |
| `DEPLOYER_PRIVATE_KEY`, `FUND_AMOUNT_ETHER`, `SETTLER_ADDRESS` | contracts | Deploy + fund. |
| `VITE_API_URL`, `VITE_WS_URL` | web | Backend endpoints. |
| `VITE_PRIVY_APP_ID`, `VITE_PRIVY_CLIENT_ID` | web | Public Privy identifiers (never the app secret). |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL` | mobile | Backend endpoints (use LAN IP locally, Render URL in release builds). |

### Live room and post-media setup

Configure a LiveKit Cloud webhook pointing to
`https://ennoia.onrender.com/webhooks/livekit`, using the API key corresponding to
the server's `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. The backend verifies the
webhook signature and uses participant events to track the host's connection;
after a disconnect, the host has a five-minute reconnection window before the
stream ends. A viewer can request a mic, and the host alone can approve or invite
speakers and grant camera or screen-sharing permission.

For posts with images or video, the server needs the five `R2_*` variables above.
The bucket's public base URL must serve uploaded objects. In the R2 bucket's CORS
settings, allow the web app's origin to `PUT` with the `Content-Type` header; for
the current Vercel domain, the policy is:

```json
[
  {
    "AllowedOrigins": ["https://ennoia-app.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add the eventual custom web domain as another origin when it is live. Text-only
posts work without R2; media uploads return `media-not-configured` until R2 is
configured. Android host screen sharing is enabled in the Expo native config and
requires a new native build. iOS whole-device screen sharing is configured through
the ReplayKit Broadcast Upload Extension in `apps/mobile/targets/broadcast/` and
also requires a new native build. It sends screen video while the existing LiveKit
microphone track carries the host or approved speaker's voice; device audio is not
captured. An authorized host or speaker taps **Share screen**, then **Start
Broadcast** in the iOS system picker. **Stop sharing** or the iOS recording control
ends the broadcast.

Before the user runs an iOS EAS build, register the App Group
`group.com.ennoia.app` for the main app and `com.ennoia.app.broadcast` extension
in the Apple Developer account, and allow EAS to create signing credentials for
both targets. `@bacons/apple-targets` reads `apps/mobile/targets/broadcast/` and
declares the extension in Expo/EAS config; do not hand-edit a generated `ios/`
directory. Verify on a physical iPhone/iPad by joining as host, starting screen
sharing, switching to another app, and confirming a second participant sees the
screen and hears the microphone. Repeat as a speaker only after the host grants
screen permission. This repo's Windows environment cannot compile or run the iOS
extension, and no EAS build was run here.

---

## Configuration (thresholds & rewards)

All tunables live in **`packages/core/src/config.ts`** and **`momentConfig.ts`**. Spike windows,
confirmation thresholds, 15s/20s clipping, Founding-Curator scoring, anti-cheat, and the
70% creator / 20% curator / 10% platform split are centralized there.
