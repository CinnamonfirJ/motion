# Moment

> Spot the livestream moment before everyone else — and get paid for being early.

Moment turns real-time audience reactions into **paid curation**. Viewers ("Scouts") watch
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
| `packages/core` | **Shared TypeScript logic**: spike detection, confirmation, Founding-Curator selection, reward math, Moment state machine, stream clock, Merkle batch commitment, config. | Framework-agnostic, no I/O. Imported by the backend **and** every client. 31 unit tests. |
| `packages/contracts` | **`MomentRewards.sol`** on Monad: `commitReactionBatch` + idempotent `settleMoment`. | Hardhat. 6 tests incl. duplicate-settlement protection. |
| `apps/server` | **Backend** (Fastify + WebSocket + `node:sqlite`): authoritative stream clock, reactions, Moment engine, Monad settlement, earnings, realtime, demo seed. | Owns all product-critical state. |
| `apps/web` | **Web app** (Vite + React + Tailwind). | Design tokens from `PRODUCT-DESIGN.md`. |
| `apps/mobile` | **iOS + Android** (Expo / React Native). | One codebase, imports `@moment/core`. |

**Why this shape:** the PRD's hardest risks are (1) the rolling clip buffer, (2) one
authoritative stream clock, and (3) building the same feature three times. All three are
solved by keeping timing, detection, clipping and settlement on the server + shared core,
and making clients render state they receive over REST + WebSocket.

### The authoritative stream clock
Every stream has a server-authoritative `startedAt`. Playback position, reaction
timestamps, spike detection and clipping all derive from it (`@moment/core/time`). Clients
measure a clock offset (NTP-style midpoint) and never trust their own wall clock. Mobile
resynchronizes on foreground.

### Moment state machine
`NORMAL → CANDIDATE → DETECTING → CONFIRMED → CLIPPING → SETTLING → PUBLISHED → SETTLED`
(plus `EXPIRED` for candidates that fail confirmation). Transitions are validated; a Moment
can never settle before it confirms, and settlement is idempotent on-chain and in the engine.

### Invisible crypto
Sign-in derives an **embedded wallet** deterministically from the auth identity, identical
across web/iOS/Android. No seed phrase, no network switching, no gas prompts. Blockchain
terms appear only behind **"View onchain receipt"**.

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

Open the web app, sign in with any email (or "Continue with Google" for a random demo
account), open a live stream, and react. Seeded bot Scouts drive periodic spikes, so a
Moment forms within a minute — you'll see **MOMENT DETECTED**, and if you reacted early
enough, the **Founding Curator** celebration, then the settled reward in **Earnings**.

> **Mobile → localhost:** a device/emulator can't reach `localhost`. Set
> `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` to your machine's LAN IP (e.g.
> `http://192.168.1.20:4000`) in `.env` before `pnpm dev:mobile`.

### Tests

```bash
pnpm test                       # @moment/core (spike, curators, rewards, state machine, clock)
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

See `.env.example` for the full list. Nothing is required for the local simulation demo.

| Variable | Used by | Purpose |
|---|---|---|
| `PORT`, `HOST`, `JWT_SECRET`, `DB_PATH` | server | Basic backend config. |
| `WALLET_MASTER_MNEMONIC` | server | Derives embedded wallets. **Set a real secret in shared envs.** |
| `UNITS_PER_USD` | server | Display peg (units→USD). Does not affect on-chain amounts. |
| `ENABLE_SEED` | server | Demo streams + bot participants (default `true`). |
| `MONAD_RPC_URL`, `MOMENT_REWARDS_ADDRESS`, `SETTLER_PRIVATE_KEY` | server | Enable real Monad settlement. |
| `DEPLOYER_PRIVATE_KEY`, `FUND_AMOUNT_ETHER`, `SETTLER_ADDRESS` | contracts | Deploy + fund. |
| `VITE_API_URL`, `VITE_WS_URL` | web | Backend endpoints. |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL` | mobile | Backend endpoints (use LAN IP). |

---

## Configuration (thresholds & rewards)

All tunables live in **`packages/core/src/config.ts`** (`DEFAULT_CONFIG`) — no magic numbers
scattered through the app. Spike windows/multiplier, confirmation thresholds, clip pre/post
roll, Founding-Curator count + rank weights (5/4/3/2/1), and the 70/30 creator/curator split
are all here and overridable via `makeConfig()`.
