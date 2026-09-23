# Privy, LiveKit, Monad and Envio setup

All four integrations are environment-gated. With their variables blank, the existing local
demo continues to use fallback auth, seeded VOD streams, simulated settlement and SQLite
analytics. Do not copy server secrets into `apps/web/.env` or `apps/mobile/.env`.

## 1. Privy

1. Create a Privy app and enable passkey login plus automatic Ethereum embedded-wallet
   creation in its dashboard.
2. Copy `apps/server/.env.example` to the server environment and set `PRIVY_APP_ID`,
   `PRIVY_APP_SECRET`, and optionally `PRIVY_VERIFICATION_KEY`.
3. Copy `apps/web/.env.example` to `apps/web/.env` and set only the public
   `VITE_PRIVY_APP_ID` and optional `VITE_PRIVY_CLIENT_ID`.
4. Add every web origin (local and production) to Privy's allowed origins.

The browser performs passkey signup/login through Privy. It then sends the Privy access token
to `POST /auth/privy`; the server verifies it, resolves the embedded wallet, and returns the
existing short-lived ENNOIA session token. When Privy is active, legacy `/auth/login` and
`/auth/passkey/*` routes cannot authorize users.

## 2. LiveKit

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the server. The web app does
not need the key or secret. `POST /streams/:id/livekit-token` grants publish permission only to
the stream creator; viewers are subscribe-only. Streams with a `videoUrl` remain VOD so the
seeded demo is unaffected.

Live clips from a real room require LiveKit Egress plus object storage. The current 15-second
pre-roll and 20-second post-roll clip builder remains valid for VOD/recording URLs; configure
an Egress recording pipeline before treating a real room as clip-ready.

## 3. Monad

Deploy `packages/contracts/contracts/MomentRewards.sol`, authorize and fund the backend
settler, then set `MONAD_RPC_URL`, `MONAD_CHAIN_ID`, `MOMENT_REWARDS_ADDRESS`,
`SETTLER_PRIVATE_KEY`, and `PLATFORM_ADDRESS` on the server. Without all required settlement
values, the backend deliberately stays in its idempotent local simulation.

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
