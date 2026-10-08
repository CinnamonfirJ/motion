# Mera, LiveKit, Monad and Envio setup

The streaming, chain and indexing integrations are environment-gated. With their variables
blank, the local demo uses seeded VOD streams, simulated settlement and SQLite analytics. Do
not copy server secrets into `apps/web/.env` or `apps/mobile/.env`.

## 1. Accounts: Mera

[Mera](https://mera.category.xyz) (`@category-labs/mera`) is the entire account layer on web.
There is no seed phrase, wallet extension, custody backend or auth vendor, and nothing to
configure beyond `AUTH_PROVIDER=mera` (the default).

**Onboarding (one prompt).** `createPasskeyWithPrfOutput` runs a single passkey ceremony and
returns 32 bytes of WebAuthn PRF output. `apps/web/src/lib/mera.ts` turns those bytes into a
BIP-44 Ethereum key (`m/44'/60'/0'/0/0`, Mera's documented recipe) and opens a Mera signing
session. The session signs the server's single-use challenge without another prompt; the
server (`apps/server/src/mera.ts`) recovers the address and upserts the user keyed by it
(`authId = mera:<address>`). New testnet accounts receive `ONBOARD_DRIP_WEI` MON from
`FAUCET_PRIVATE_KEY` so their first transaction needs no faucet.

**Signing session scope.** One passkey tap opens a 15-minute session that signs, prompt-free,
only `tip(bytes32)` calls to the MomentRewards contract on chain 10143, up to 0.01 MON each
and 0.05 MON in total. Out-of-scope transactions and anything past the budget ask for the
passkey for that one transaction and never widen the session. On expiry (or **Lock**) Mera
zeroes the key; the next tip re-prompts once. The UI shows the remaining time and budget.

**Stateless test.** Nothing secret is stored anywhere. `localStorage` holds only the app
session token and an untrusted credential-ID hint; both are disposable. After clearing storage
or on a fresh device with a synced passkey, "Sign in with passkey" runs one ceremony, derives
the same address and lands in the same account. When a signed-in user unlocks signing, the
derived address must match the account's address, so the wrong passkey can't sign.

Passkeys are bound to the relying-party ID (`VITE_PASSKEY_RP_ID`, default: the page host).
Keep it stable across deployments or users will derive different accounts.

`AUTH_PROVIDER=fallback` keeps the local-only email/WebAuthn demo (set `VITE_AUTH_MODE=fallback`
on web too). `POST /auth/privy` remains only for the mobile app until it moves to Mera's React
Native client; set `PRIVY_APP_ID`/`PRIVY_APP_SECRET` to keep it enabled.

## 2. LiveKit

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the server. The web app does
not need the key or secret. `POST /streams/:id/livekit-token` grants publish permission only to
the stream creator; viewers are subscribe-only. Streams with a `videoUrl` remain VOD so the
seeded demo is unaffected.

Live clips from a real room require LiveKit Egress plus object storage. The current 15-second
pre-roll and 20-second post-roll clip builder remains valid for VOD/recording URLs; configure
an Egress recording pipeline before treating a real room as clip-ready.

The viewer's **Clip it** action queues that same 35-second window around the tap timestamp.
Real-room clips are extracted from the continuous Egress recording and appear in the Home feed
after the stream ends; a manual clip does not create Founding Curators or trigger rewards. When
the host ends a stream with a queued clip, ending waits for its remaining post-roll before Egress
stops.

## 3. Monad

Deploy `packages/contracts/contracts/MomentRewards.sol`, authorize and fund the backend
settler, then set `MONAD_RPC_URL`, `MONAD_CHAIN_ID`, `MOMENT_REWARDS_ADDRESS`,
`SETTLER_PRIVATE_KEY`, and `PLATFORM_ADDRESS` on the server. Without all required settlement
values, the backend deliberately stays in its idempotent local simulation.

On Monad testnet (chain ID `10143`), confirmed automatic Moments settle as soon as their clips
are published. Curator payouts are sent to the embedded wallet addresses recorded on the
reactions. The contract's reward pool must have enough MON for the configured Moment pool.

## 4. Envio

Envio's CLI requires Linux; on Windows, run this package inside WSL. Local development also
requires Docker.

```bash
cd packages/indexer
cp .env.example .env
# set ENVIO_MONAD_RPC_URL and ENVIO_MOMENT_REWARDS_ADDRESS
pnpm codegen
pnpm dev
```

Set the deployed GraphQL endpoint as `ENVIO_GRAPHQL_URL` on the ENNOIA backend. The backend
will prefer Envio for `/feeds/trending`, `/leaderboard`, and `/rewards/history`, and will fall
back to local SQLite aggregates if the endpoint is absent or unavailable.

For a production deployment, change `start_block` in `packages/indexer/config.yaml` from `0`
to the contract deployment block to avoid scanning unrelated history.

## Mobile development-build boundary

Expo Go cannot load Privy's or LiveKit's native modules. The checked-in mobile app therefore
keeps fallback auth and VOD playback, and clearly reports when a LiveKit stream requires the
development build. To complete the native path:

1. From `apps/mobile`, install `expo-dev-client` with `npx expo install expo-dev-client`.
2. Install and configure the current Privy React Native SDK, including its passkey associated
   domains/app-links requirements.
3. Install LiveKit's Expo packages (`@livekit/react-native`,
   `@livekit/react-native-expo-plugin`, `@livekit/react-native-webrtc`,
   `@config-plugins/react-native-webrtc`, and `livekit-client`) and add the two LiveKit config
   plugins to `app.json`.
4. Replace the guarded stubs in `apps/mobile/src/lib/passkey.ts` and the LiveKit placeholder in
   `apps/mobile/src/screens/Live.tsx`, reusing the same `/auth/privy` and
   `/streams/:id/livekit-token` server endpoints.
5. Build with `npx expo run:android` / `npx expo run:ios`, or configure an EAS development
   profile. Start Metro with `npx expo start --dev-client`.

Never add placeholder associated domains to a shipping build: use a domain you control and
host the required Apple and Android association files first.
