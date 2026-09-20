# Memory — Moment (Monad hackathon cross-platform build + Talise redesign)

Last updated: 2026-09-20

## What was built

Greenfield **pnpm monorepo** at repo root implementing the full product from `PRD.md` + `PRODUCT-DESIGN.md`. Layout:

- **`packages/core`** — shared TypeScript logic (no I/O), imported by backend + all clients:
  `config.ts` (all thresholds/reward params, `DEFAULT_CONFIG`/`makeConfig`), `types.ts`, `time.ts` (authoritative stream clock + NTP offset), `spike.ts` (deterministic spike detection), `curators.ts` (confirmation + Founding-Curator selection), `rewards.ts` (bigint reward split, exact conservation), `stateMachine.ts` (Moment lifecycle), `merkle.ts` (batch commitment, injected hash), `ids.ts`. **31 vitest tests pass.**
- **`packages/contracts`** — Hardhat. `contracts/MomentRewards.sol` (`commitReactionBatch` + idempotent `settleMoment`, inline Ownable/reentrancy). `scripts/deploy.ts`, `scripts/fund.ts`, `hardhat.config.ts` (Monad testnet chainId 10143). **6 tests pass** (incl. duplicate-settlement, access, insufficient-pool).
- **`apps/server`** — Fastify + `@fastify/websocket` + built-in `node:sqlite` (no native deps) + ethers. Files: `env.ts`, `db.ts`, `auth.ts` (deterministic embedded wallet from auth id), `store.ts`, `chain.ts`, `settlement.ts`, `momentEngine.ts` (the brain: ingest→detect→confirm→clip→settle, uses core), `realtime.ts` (ws hub), `routes.ts`, `view.ts` (DTOs, bigint→string+USD), `seed.ts` (demo streams + bot driver through real ingestion path), `index.ts`. Owns all product-critical state.
- **`apps/web`** — Vite + React + Tailwind. Screens: SignIn (full landing), Home, Live, Moments, MomentDetail, Earnings, Profile. Components incl. `Layout`, `MomentCard`, `ReactionGraph`, `players`, `live` (detection overlay/celebration/toast), plus new `scaffold.tsx` + `icons.tsx`.
- **`apps/mobile`** — Expo (iOS+Android), imports `@moment/core`. All screens mirrored; `theme.ts`, `components/ui.tsx`, `lib/api.ts`, `lib/realtime.ts`, `session.tsx`, `App.tsx` (tabs+stack).

**Talise-style redesign** applied across web + mobile (colors from design doc kept; everything else adopted from `design example/` screenshots): JetBrains Mono labels/meta/buttons + Inter bold headlines; sharp corner-bracketed buttons; square-bullet tag chips; `+` plus-marks on hairline frames; `[ 0X OF 0Y ] · LABEL` section indices; diagonal-hatch strips; square +/− FAQ toggles; monoline SVG icons. `apps/web/src/screens/SignIn.tsx` is a full marketing landing (nav, hero, phone-mockup band with `[ APP PREVIEW ]` placeholders, stats, features, how-it-works, FAQ accordion, auth as final `#start` section, footer grid).

## Decisions made

- Business logic lives once in `@moment/core` + server; clients are thin (PRD §9/§41).
- One authoritative stream clock (`startedAt`); clients derive server time via measured offset.
- Embedded wallet derived deterministically from auth id (`apps/server/src/auth.ts`) → same wallet across web/iOS/Android. Swappable for Privy; demo auth is email/"Google" (no real OAuth).
- Settlement defaults to an **idempotent local simulation**; real Monad tx needs `MONAD_RPC_URL` + `MOMENT_REWARDS_ADDRESS` + `SETTLER_PRIVATE_KEY` (never commit these). `/health` reports `onchain` vs `simulation`.
- Reward **display** peg `UNITS_PER_USD=2e15` so the 0.02 MON/Moment pool reads as ~$10 (creator $7 / curators $3, rank-weighted 5/4/3/2/1) — display only, keeps on-chain cost testnet-cheap.
- Mobile radius tokens set to 0 (sharp scaffolding); avatars stay round. Mobile nav is text-forward with a square indicator (no SVG dep added).

## Problems solved

- Node 26 + native modules: avoided better-sqlite3 by using built-in `node:sqlite`; server/web/mobile deps are pure JS except Hardhat's `@nomicfoundation/edr`/keccak/secp256k1 (approved in `pnpm-workspace.yaml allowBuilds`).
- Slow network: Expo/Hardhat installs need `pnpm install --fetch-timeout 600000`; several ran in background.
- pnpm 11.5 auto-installs before `pnpm run` even with `verify-deps-before-run=false` in `.npmrc` — expect an install pass when deps are stale.
- Windows: killing the dev server leaves a zombie holding the port → `Get-NetTCPConnection -LocalPort 4000 | Stop-Process`.
- Clip came out ~28s (post-roll clamped to live edge at confirmation); fixed `buildClip` to use the full 15+20=35s window for a live/looped fake-live source (verified exactly 35s).
- `.js`→`.ts` import resolution works under Vite/Vitest; ethers v6 dynamic contract methods need `as any` past the `chain.enabled` guard; ws types avoided via a local `SocketLike` interface.

## Current state

All four surfaces green: core **31 tests pass**, contracts **6 tests pass**, server typechecks + **full loop verified end-to-end** (detect→confirm→35s clip→settle, dollar-scale rewards, idempotent, cross-platform identity), web **typechecks + builds** and was **visually verified in-browser** (landing + logged-in Home/Earnings match the Talise language), mobile **typechecks clean**. Not committed to git yet (git init done, no commits). Repo is uncommitted; verification servers stopped, ports freed.

## Next session starts with

Likely: (1) drop the three real phone screenshots into the landing `MockupBand` placeholders in `apps/web/src/screens/SignIn.tsx`; and/or (2) make the first git commit (attribution lines: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` on commits, `🤖 Generated with [Claude Code](https://claude.com/claude-code)` on PRs). Run backend with `pnpm dev:server`, web `pnpm dev:web`, mobile `pnpm dev:mobile`.

## Open questions

- Real Monad settlement is unexercised — needs the user's funded testnet key + RPC to run once and confirm on the explorer.
- Mobile has never been launched on a device/simulator (none available in this env) — only typechecked; visual/runtime verification pending.
- Whether to wire real OAuth/Privy vs. keep the demo email adapter.
