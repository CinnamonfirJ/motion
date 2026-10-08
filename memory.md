# Memory — ENNOIA: demo seeder, waitlist cutover, profile editing, auth/domain fixes, perf

Last updated: 2026-10-02

Monorepo `C:\Users\JESSE\Documents\Github Repo\motion`. Work on `envio`, then
`git checkout master && git merge --ff-only origin/master && git merge envio && git push origin master`
(Render auto-deploys the API from `master`; Vercel auto-deploys web from `master`). Latest master ≈ `0bdf1ba`.
**User handles ALL EAS/native mobile builds — never build/push native.** Render free tier + Neon.
Prod API host is **https://ennoia.onrender.com** (NOT ennoia-api.onrender.com). Web is **www.ennoia.live**
(apex `ennoia.live` 308-redirects to www). Waitlist is a separate Vercel project `ennoia-waitlist-zeta.vercel.app`.

## What was built (this session, newest first)

- **Demo content seeder** `apps/server/src/demoSeed.ts` + gated `POST /admin/seed-demo` (routes.ts).
  Gated by `DEMO_SEED_SECRET` env (inert unless set). Fills ONE account (by @handle) with 12 cast users,
  5 streams, 16 image posts, ~400 reactions, 27 SETTLED moments, followers; earnings via real
  `distributeReward` 70/20/10 (~$10.7k creator / ~$2.4k scout). Images committed in
  `apps/server/seed-assets/{posts,streams}`, uploaded to R2. All tagged (`demo:cast:%` / `demo_%`).
  Body flags: `{handle, secret, reset?, clearOnly?}`. **`clearOnly:true`** wipes all demo rows + demo R2
  images (returns counts); with `handle` also resets that account's `isCreator=false` + nulls demo avatar.
  **Demo data was seeded then FULLY CLEARED at end of session; twilight870 profile reset.**
- **Profile editing**: `PATCH /me` (name/handle/avatar → DB, then best-effort Privy `setCustomMetadata`);
  store `Users.byHandle/updateProfile/resetSeededProfile`; privy `syncPrivyProfile`. Web + mobile Profile
  screens got an Edit view; `session.updateProfile` added (web + mobile).
- **Server-side image upload** `POST /media/post-upload-direct` (raw image bytes → R2 via server creds, no
  browser CORS). Web PostComposer uses it for images + avatar; videos still use presigned
  `/media/post-upload`. 16MB images-only binary body parser in index.ts.
- **Hero image**: `apps/web/src/screens/SignIn.tsx` MockupBand now shows `apps/web/src/assets/hero-showcase.png`.
- **Waitlist path-proxy**: root `vercel.json` rewrites `/waitlist[/**]` → `ennoia-waitlist-zeta.vercel.app`;
  `waitlist/next.config.mjs` has `basePath:/waitlist`; waitlist absolute asset/fetch refs prefixed via
  `NEXT_PUBLIC_BASE_PATH`. LIVE on ennoia.live/waitlist.
- **Perf**: batched moment hydration — `hydrateMoments` loads curators in one IN-query; new
  `view.ts momentViews()` (Streams.byIds + Users.byIds + grouped viewCountsFor) used by /moments, /feed,
  /streams/:id, /feeds/trending; earnings batch stream titles/creators. `/moments` ~17s → ~3s.
- **Cold-start fixes**: `.github/workflows/keep-warm.yml` pings /health every 10 min; web+mobile `req()`
  retry 502/503/504 + network with backoff.
- **CORS fix**: `index.ts` always allows `https://ennoia.live` + `https://www.ennoia.live` (was blocking login).
- **Privy RP unified on www.ennoia.live**: eas.json `EXPO_PUBLIC_PRIVY_RELYING_PARTY` + `EXPO_PUBLIC_WEB_URL`
  → https://www.ennoia.live; app.json ios.associatedDomains webcredentials/applinks; AASA at
  `apps/web/public/.well-known/apple-app-site-association` (**placeholder `__APPLE_TEAM_ID__` — must fill**);
  Android assetlinks already served. vercel.json serves AASA as json + excludes /.well-known from SPA rewrite.
- **Mobile run**: `start`→`expo start --dev-client` (+ `go` = Expo Go); metro blockList skips other workspaces.

## Decisions made

- Demo data lives in PROD (Neon), attached to the user's Privy account (Privy is live auth, can't log into a
  fabricated row). `env.ts` THROWS in prod if ENABLE_SEED/ENABLE_DEMO_ROUTES on → seeder uses its own secret gate.
- Canonical web host = **www.ennoia.live** (apex redirects to it); Privy relying party + passkeys live on www.
- Web auth is **passkey-only** (email OTP was built then removed per user). Email only in non-Privy fallback.

## Problems solved

- Login "That didn't land"/"isn't answering" had THREE layers (see [[ennoia-auth-domains]]): Privy allowed
  origins must include `https://www.ennoia.live` (with scheme); passkeys are domain-bound (old vercel-domain
  passkeys fail → register fresh on live host); and our API's OWN CORS allowlist blocked www. All fixed.
- Seeder first version did ~1500 sequential Neon writes → Render request timeout + overlapping-retry
  corruption. Fixed with bulk multi-row inserts (chunked for sqlite), parallel R2 uploads, concurrency guard.
- Post image upload "Failed to fetch" = missing R2 CORS → solved with server-side upload route.
- Each Render↔Neon query ≈280ms (likely cross-region) — amplified N+1s; batching was the fix.

## Current state

All four packages typecheck; server/web build green. Login works on www.ennoia.live (passkey). Posting +
image upload work. Waitlist proxy live. Feed/moments ~3s. Demo data cleared from prod. Everything on master/deployed.

## Next session starts with

Nothing pending. Optional follow-ups: (1) fill `__APPLE_TEAM_ID__` in the AASA + run a fresh EAS build so
native passkeys validate on www.ennoia.live (Android assetlinks already ok; user confirms SHA-256 via
`eas credentials` if Android passkey fails). (2) Remove `DEMO_SEED_SECRET` from Render to disable the seeder.
(3) Biggest latency lever left: colocate Render + Neon regions (~280ms/query → sub-second).

## Open questions

- Apple Team ID for the AASA (needed only for iOS passkeys).
- Whether to keep the seeder endpoint deployed (remove DEMO_SEED_SECRET to disable).
