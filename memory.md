# Memory — ENNOIA livestream: studio, realtime latency, moderation, analytics

Last updated: 2026-09-25

Monorepo `C:\Users\JESSE\Documents\Github Repo\motion`. Work on `envio`, then
`git checkout master && git merge --ff-only origin/master && git merge envio && git push origin master`
(Render auto-deploys backend, Vercel auto-deploys web — both from `master`). Latest master ≈ `39ce9ef`.
**User handles ALL EAS/native mobile builds — never build/push native.**

## What was built (this session, newest first)

**Real analytics / live stats** (`39ce9ef`). Hub (`apps/server/src/realtime.ts`) accumulates REAL viewer
sessions (connection duration) → total watch time / peak / unique (never viewers×duration). New
`apps/server/src/analytics.ts` (reactions, Moments, followers, new-followers-since-live, latest follower)
+ host-only `GET /streams/:id/analytics`. Studio (`LiveKitStage.tsx`) Live Stats + info cards now show
REAL data — ALL `DEMO` placeholders removed. No fake ±% deltas (green +N only when real new-followers > 0).
Test: `apps/server/src/realtime.test.ts` (watch-time/peak/unique). Top Supporter/Recent Cheers replaced
with real Moment/reaction/viewer metrics (no server-side tip records; those are onchain).

**Persistent moderation** (`c9ddb8b`). New `stream_bans` table + `apps/server/src/moderation.ts`
(ban=permanent, timeout=auto-expiring, lazy clear). Host-only `GET/POST/DELETE /streams/:id/bans`;
banning revokes speaker/guest. Enforcement: banned users 403 from chat + speaker-request. New
`moderation` realtime event → banned viewer's chat shows "can't chat"; host Moderation panel lists real
bans + Unban; host times a chatter out (⊘) from Live Chat. Test: `apps/server/src/moderation.test.ts`.

**Realtime latency fix (~30s → realtime)** (`c824e88`). Root cause: no WS keepalive → proxy idle-closed
sockets left half-open, undetected ~30s. Fix: server ping every 25s + drops stale conns
(`realtime.ts` heartbeat, `index.ts`); clients pong + 45s watchdog reconnect (web+mobile `lib/realtime.ts`).
Chat route BROADCASTS first, persists to Neon async (`liveChat.build`/`persist`). Optimistic echo (<100ms)
with `clientId` → canonical broadcast reconciles/dedups; Failed·Retry; reconnect re-syncs history (web
`LiveChat.tsx`, mobile `live-chat.tsx`). Renamed streamer "Request Mic" → "Mic Requests". Test:
`apps/server/src/liveChat.test.ts`.

**Studio (earlier this session)** — desktop host studio in `LiveKitStage.tsx` is the reference LAYOUT
(top nav REMOVED per user) rendered in ENNOIA's SHARP style (no rounded/gradient/shadow, app tokens,
lucide-react icons, theme-aware). Mobile studio + Live wrapper use lucide-react-native (+ react-native-svg
15.15.4) — needs a fresh EAS build to show. Live screens theme-aware (video pane scoped dark).

## Decisions made

- **Studio style LOCKED to app's sharp system** (no rounded/gradients/shadows). Reference image = LAYOUT
  only, not its purple/rounded look. Do not reintroduce rounded/gradients/shadows.
- Realtime transport = the existing single WS hub (in-memory). Chat/reactions/mic/guest/moderation/presence
  NEVER wait on Monad/Envio. Persistence is async.
- Analytics/live stats are REAL (no fake data). Where no backend exists (server-side tips) → show real
  alternative metrics or neutral states, never fabricated numbers.
- Mobile is dark-only. Waitlist = separate Vercel project (Root Dir `waitlist`); app = its own project.

## Problems solved

- 30s chat delay = missing WS keepalive (half-open sockets). See latency fix above.
- SQLite schema migration splits by `;`, so an inline SQL comment containing `;` broke `CREATE TABLE`
  (stream_bans). Rule: **no semicolons inside schema comments** in `db.ts`.
- Vercel pnpm too old for lockfileVersion 9.0 → root `vercel.json` uses `npx --yes pnpm@11.5.0`.

## Current state

All typechecks green (core/server/web/mobile); server tests pass: social/live-room, liveChat, moderation,
realtime hub. Web build green. Everything committed to `master`, deployed via Vercel/Render. Mobile lucide
code on master but needs a new EAS build to appear on device.

## Next session starts with

Remaining from the big realtime spec (user offered these next): **reaction aggregation** (100–250ms crowd
window; reactions still broadcast per-event), **Stream Settings** editor (title/category/tags + realtime
metadata push), a **load-sim script** (100/1,000 viewers) for measured latency, wiring the left-rail nav
items (Invite Guest/Moderation/Settings/Analytics/Monetization) to open panels, and Top Supporter/Recent
Cheers via real Envio tip data.

## Open questions / blockers (user-side)

- **R2 CORS** must be added (Cloudflare → R2 `ennoia` bucket) or browser image uploads stay "Failed to fetch".
- **LiveKit Egress recording** still failing — need the Render log `permanent stream recording unavailable`
  (likely Egress not enabled) for permanent Moment clips. Streaming works without it.
- Mobile lucide icons require a fresh EAS build.
- Realtime scaling: in-memory single-instance hub won't fan out across instances — needs Redis/NATS or
  LiveKit data channels before large audiences.
