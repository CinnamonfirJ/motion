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
→ Founding Curators selected → 35s clip generated → Moment published
→ reward settled on Monad → earnings updated
```

> **On traditional platforms, the creator generates the value and the platform captures it.**
> ENNOIA flips this: when a viewer's attention helps surface a moment, they become a
> **Founding Curator** and take a verifiable, onchain stake in it alongside the creator.

---

## For judges — Monad Metropolis, Track 3 (Social, Attention & Culture)

**Try it:** https://www.ennoia.live · **Contract (verified source):**
[`0xCb3cEcEE0F869C3162EB327186de851C621F4C81`](https://testnet.monadvision.com/address/0xCb3cEcEE0F869C3162EB327186de851C621F4C81) on Monad testnet (chain 10143)

### Technical execution — it runs onchain and the results are checkable

One full Moment, end to end, on Monad testnet:

| Step | Transaction | What it proves |
|---|---|---|
| Reaction provenance | [`0xb22b…4aba`](https://testnet.monadvision.com/tx/0xb22b5d3c5ca4c0679f8919aca33f643bbb5ec2ed05332ebefb4cc2537cfa4aba) | `commitReactionBatch` — 10 reactions committed as **one Merkle root**, not 10 transactions |
| Moment + curators recorded | [`0xea3c…1175`](https://testnet.monadvision.com/tx/0xea3c74e1270a5be4adb243263daeb7c15992d0b7539c92e5d1d56c6d71b51175) | `MomentCreated` + `FoundingCuratorRecorded` #1, #2 — rank is public before anyone is paid |
| Reward settlement | [`0x8261…1cd6`](https://testnet.monadvision.com/tx/0x8261b211c4344e4c67135c7312b63ebafa761db4825b21f6a01f1333cc5e1cd6) | `settleMoment` — creator 0.014 MON (70%), curators 0.00333 + 0.00267 MON (30%, rank-weighted 5:4) |

- **Idempotent settlement.** A second `settleMoment` for the same Moment reverts `AlreadySettled`,
  so retries after an RPC failure can never double-pay.
- **Deterministic attribution.** Founding Curators are the first 5 unique Scouts to react before
  confirmation, one slot per account ([`packages/core/src/curators.ts`](packages/core/src/curators.ts)).
- **Detection is relative, not absolute.** A spike is measured against *that stream's own*
  baseline, so a 7-viewer stream can produce a Moment as easily as a 7,000-viewer one
  ([`packages/core/src/momentMetrics.ts`](packages/core/src/momentMetrics.ts)).
- **Publishing never waits on the chain.** The card shows "Reward settling…" and flips to
  "Reward received" when the transaction confirms; every payout links to its receipt.

### Design & craft — a social product, not a token feature

- **No wallet UX.** Sign in with a passkey (Face ID / Touch ID / Windows Hello). That passkey
  derives the user's Monad account on-device (Mera) — no extension, no seed phrase, no gas prompt.
  New accounts get a small testnet top-up so their first tip just works.
- **Three reactions** — 🔥 😂 😮 — are the whole input. The UI says "Moment detected", never "spike".
- Web, iOS and Android share one account, one backend and one logic package.

### Originality — attention becomes stake

Reacting early is the act of curation. The onchain layer isn't decorative: it is the record of
**who was early** (`FoundingCuratorRecorded`) and the mechanism that **pays them**
(`CuratorPaid`). Remove the chain and there is no verifiable "Founding Curator #1".

### Who it's for, and why they'd move

- **Small creators** — big platforms bury their best 30 seconds. ENNOIA auto-clips the moment
  the audience reacts to and pays the creator 70% of every Moment's reward.
- **Scouts** — on Twitch or YouTube their attention is extracted for free. On ENNOIA, good taste is
  provable onchain and rewarded.

### Traction (live onchain numbers)

At submission the contract has settled **8 Moments**, paid out **0.16 MON** to creators and
Founding Curators, and received **0.011 MON** in tips — all readable from the contract
(`totalSettledMoments`, `totalPaidOut`, `totalTips`).

### Path forward (PRD §26)

Creator Keys and bonding curves (deeper economic stake) · curator reputation as an open
social graph · OBS integration for creator onboarding · production anti-Sybil infrastructure.

### Honest limits of this MVP

- Rewards come from a **pre-funded testnet pool** (0.02 MON per Moment) — the PRD's
  "prove the settlement mechanism, not final token economics" (§18). Testnet MON has no market value.
- LiveKit Egress recording isn't enabled, so live clips are recorded by viewers' browsers
  (a rolling 15s-before / 20s-after buffer) and uploaded. Mobile apps don't record clips yet.

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
fails startup unless Neon, LiveKit, R2, Monad, Envio, CORS, and signing configuration
are all present and `AUTH_PROVIDER=mera`; production never silently falls back to mocks.

- **Mera** is the entire account layer. One passkey ceremony yields WebAuthn PRF output that
  derives the user's Monad EOA on device; a scoped 15-minute Mera signing session makes tips
  prompt-free. The backend only verifies a signature from that address — it never holds keys,
  and identity reconstructs from the passkey alone on any device.
- **LiveKit** carries real room audio/video. LiveKit Egress records HLS segments into
  **Cloudflare R2**, and the backend creates permanent 15-second pre-roll + 20-second
  post-roll Moment playlists. Clients receive only short-lived room tokens.
- **Monad** records economically meaningful activity through `MomentRewards.sol`: reaction
  commitments, Moments, Founding Curators, tips and reward settlement.
- **Envio** indexes those contract events for feeds, leaderboards and reward analytics. It is
  never used as the application database; Neon owns profiles, streams and raw reactions.

`AUTH_PROVIDER=fallback` keeps the original WebAuthn/email plus deterministic-wallet path for
local demo use only. See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for setup.

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
70% creator / 30% Founding Curator split (PRD §18, rank-weighted 5:4:3:2:1) are centralized there.
