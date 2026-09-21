# Memory — Moment (Monad cross-platform build · Talise redesign · light web · Expo SDK 57)

Last updated: 2026-09-21

## What was built

Greenfield **pnpm monorepo** implementing the product from `PRD.md` + `PRODUCT-DESIGN.md`.

- **`packages/core`** — shared TS logic (no I/O), imported by backend + all clients: `config.ts` (thresholds/reward params, `DEFAULT_CONFIG`/`makeConfig`), `types.ts`, `time.ts` (stream clock + NTP offset), `spike.ts`, `curators.ts`, `rewards.ts` (bigint split, exact conservation), `stateMachine.ts`, `merkle.ts`, `ids.ts`. **31 vitest tests pass.**
- **`packages/contracts`** — Hardhat. `contracts/MomentRewards.sol` (`commitReactionBatch` + idempotent `settleMoment`). `scripts/deploy.ts`, `scripts/fund.ts`, `hardhat.config.ts` (Monad testnet chainId 10143). **6 tests pass.**
- **`apps/server`** — Fastify + `@fastify/websocket` + built-in `node:sqlite` + ethers: `env.ts`, `db.ts`, `auth.ts` (deterministic embedded wallet from auth id), `store.ts`, `chain.ts`, `settlement.ts`, `momentEngine.ts` (ingest→detect→confirm→clip→settle), `realtime.ts`, `routes.ts`, `view.ts`, `seed.ts` (demo streams + bot driver via real ingestion), `index.ts`.
- **`apps/web`** — Vite + React 18 + Tailwind. Screens: SignIn (full landing), Home, Live, Moments, MomentDetail, Earnings, Profile. Components: `Layout`, `MomentCard`, `ReactionGraph`, `players`, `live`, `scaffold.tsx`, `icons.tsx`.
- **`apps/mobile`** — Expo (iOS+Android), imports `@moment/core`. `theme.ts`, `components/ui.tsx`, `lib/api.ts`, `lib/realtime.ts`, `session.tsx`, `App.tsx`, `metro.config.js`, all screens.

**Talise-style redesign** (JetBrains Mono labels/meta/buttons + Inter bold headlines; sharp corner-bracket buttons; square-bullet tag chips; `+` plus-marks on hairline frames; `[ 0X OF 0Y ] · LABEL` indices; hatch strips; square +/− FAQ toggles; monoline icons). Web `SignIn.tsx` is a full landing (nav, hero, phone-mockup band with `[ APP PREVIEW ]` placeholders, stats, features, how-it-works, FAQ, auth as final `#start` section, footer).

**THIS SESSION added:**
1. **Light theme for the WEBSITE (apps/web only); mobile stays dark** — matches the reference (light marketing site, dark app). Implemented with CSS variables in `apps/web/src/index.css`: light `:root` default + `[data-theme="dark"]` scope. Tailwind neutrals + `leaf` are `var(--c-*)`; `lime`(#A7F46A fill)/`ink`(#14150D dark-text-on-lime) are fixed. Accent split: `text-lime`→`text-leaf` (dark-green #2F6A12 on light, bright lime on dark); `text-night`→`text-ink`. The **Live screen, video-overlay text (MomentCard creator/title → text-white), and over-thumbnail pills** are wrapped in `data-theme="dark"`. ReactionGraph accent = `var(--c-leaf)`. Verified via compiled CSS (both theme var sets present) + build; NOT screenshotted (Chrome extension was disconnected).
2. **Mobile upgraded to Expo SDK 57**: `apps/mobile/package.json` now expo 57.0.24, react 19.2.3, react-native 0.86.3, expo-video ~57.0.4, expo-status-bar ~57.0.1, react-native-screens ~4.26.0, react-native-safe-area-context ~5.7.0, @react-native-async-storage/async-storage 2.2.0, @types/react ~19.2.0. (React Navigation v7 kept.) `expo config` resolves `sdkVersion 57.0.0`; mobile typechecks clean; no code changes needed.
3. **Fixed a Metro bundling error** ("Unable to resolve @react-navigation/core"): removed `config.resolver.disableHierarchicalLookup = true` from `apps/mobile/metro.config.js` (my earlier over-config) and enabled `unstable_enableSymlinks`/`unstable_enablePackageExports`. Verified Node's resolver finds the react@19.2.3 variant of core from native's pnpm path.

## Decisions made

- Logic lives once in `@moment/core` + server; clients thin. One authoritative stream clock. Deterministic embedded wallet per auth id (same across web/iOS/Android); demo auth = email/"Google" stub (no real OAuth).
- Settlement defaults to **idempotent local simulation**; real Monad needs `MONAD_RPC_URL` + `MOMENT_REWARDS_ADDRESS` + `SETTLER_PRIVATE_KEY` (never commit). Display peg `UNITS_PER_USD=2e15` (~$10/Moment display, cheap on-chain).
- Web is **light by default via CSS variables**; dark is opt-in per subtree (`data-theme="dark"`) for the video theater. Mobile is dark (radius tokens = 0; sharp).
- SDK-57 dependency hoisting via `.npmrc public-hoist-pattern` was a NO-OP (react-navigation/core has react peer → two variants (react18 + react19) → ambiguous to hoist). `.npmrc` reverted to just `verify-deps-before-run=false`. The real fix is the Metro config, not hoisting.

## Problems solved

- Node 26: used built-in `node:sqlite` (no better-sqlite3). Slow network: `pnpm install --fetch-timeout 600000`, run in background. pnpm 11.5 auto-installs before `pnpm run` even with `verify-deps-before-run=false`.
- Windows zombie dev-server ports: `Get-NetTCPConnection -LocalPort 4000|Stop-Process`.
- Clip was ~28s → fixed `buildClip` to full 35s (15+20) for looped fake-live source.
- ethers v6 dynamic contract methods need `as any` past the `chain.enabled` guard; ws types via local `SocketLike`.
- Metro + pnpm transitive-dep resolution (see #3 above) — the key gotcha for RN in this monorepo: do NOT disable Metro hierarchical lookup.

## Current state

Green: core 31 tests, contracts 6 tests, server full loop verified (detect→confirm→35s clip→settle, idempotent, cross-platform identity), web typechecks + builds (light theme compiled OK, in-browser–verified in the PRIOR session; light theme itself only CSS-verified this session), mobile typechecks on SDK 57. `expo config` = SDK 57. Repo **uncommitted** (git init, no commits). Two background dev servers (backend :4000, web :5173) were **killed by the OS memory reaper** while idle at end of session — not a failure; restart manually when needed.

## Next session starts with

- To run mobile on SDK-57 Expo Go: `cd apps/mobile && npx expo start --clear` (must clear Metro cache for the new metro.config). On a device set `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_WS_URL` to LAN IP.
- Restart dev servers if needed: `pnpm dev:server`, `pnpm dev:web`.
- Optional pending offers: (a) screenshot the light web theme once Chrome extension reconnects; (b) bump TypeScript to `~6.0.3` (mobile-only) to silence `expo install --check`; (c) drop real phone screenshots into landing `MockupBand`; (d) first git commit.

## Open questions

- Real Monad settlement still unexercised — needs user's funded testnet key + RPC.
- Mobile not yet launched on a device/simulator here (SDK 57 verified by config + typecheck only).
- TypeScript: SDK 57 wants `~6.0.3`; we're on 5.9 (non-blocking for runtime — Metro strips types via Babel). Whole-monorepo TS 6 bump deferred (risk).
- Light-theme visual polish unverified by screenshot (Chrome extension disconnected this session).
