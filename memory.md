# Memory — ENNOIA livestream studio and social feed

Last updated: 2026-09-24 07:57 Africa/Lagos

## What was built

- Server: `apps/server/src/liveRooms.ts`, `livekit.ts`, `routes.ts`, and `index.ts` implement signed LiveKit webhook handling, host presence with a five-minute reconnection grace period, scoped host/speaker/viewer tokens, viewer mic requests, host invitations and approval, per-speaker camera/screen permissions, and automatic end after grace. `db.ts` adds presence and social tables.
- Server: `apps/server/src/social.ts` implements posts, replies, quotes, reshares, likes, unique views, follows, public profiles, communities, For You/Following feeds, and signed Cloudflare R2 post-media uploads. `accountDeletion.ts` includes uploaded-media cleanup. `social.test.ts` covers core authenticated social and speaker routes.
- Web: `apps/web/src/components/LiveKitStage.tsx` and `screens/Live.tsx` show distinct host studio, speaker seat, and viewer controls. `components/PostCard.tsx`, `PostComposer.tsx`, `screens/Home.tsx`, and `UserProfile.tsx` provide an ENNOIA-styled unified feed and social actions. `App.tsx` adds public profile routing.
- Mobile: `components/livekit-stage.tsx` and `screens/Live.tsx` add distinct live roles and controls. `components/post-card.tsx`, `screens/Home.tsx`, `CreatePost.tsx`, `PostDetail.tsx`, and `PublicProfile.tsx` provide the unified feed, media composer, reply threads, and followable profiles. `App.tsx` adds navigation. Expo config includes image/file modules and Android screen-sharing service permissions.
- Root `ui-registry.md` records the ENNOIA visual patterns for the new components. `README.md` documents LiveKit webhook and R2 browser-upload setup.

## Decisions made

- Hackathon exhibition uses Monad testnet with Render API, Vercel web app, Neon database, Envio indexer, LiveKit, Privy, and Cloudflare R2. No mainnet or web-only release is intended.
- Mobile remains Expo/React Navigation with the existing ENNOIA theme; no restructuring to Expo Router. The user will run the EAS build and Google Play submission themselves. Do not build EAS without a new request.
- Viewer is subscribe-only until the host approves a mic request or an invite is accepted. The host controls speaker camera/screen permissions. Android screen share is configured; iOS screen share is hidden pending a ReplayKit Broadcast Extension.
- Do not push or deploy without an explicit request. The current branch is `envio` at commit `b020780`; this feature is uncommitted. Preserve unrelated user changes.

## Problems solved

- The old livestream looked the same for the creator and audience even though the backend assigned host identity. Separate studio/viewer UI is now implemented on web and mobile.
- LiveKit speaker grants must enable `canPublish` as well as restricting `canPublishSources`; this mismatch was fixed in `apps/server/src/livekit.ts`.
- Mobile post threads and profiles now refresh on navigation focus; the feed also refreshes on focus.

## Current state

- Server typecheck, mobile typecheck, the isolated SQLite social/live-room test, Expo public-config resolution, and the web production build pass. The web build still warns about a large JavaScript chunk.
- These changes have not been pushed or deployed. No EAS build or native-device runtime test was performed. The test uses local SQLite and fake R2 signing, not the live Neon/R2/LiveKit services.
- Review findings: mobile post/profile avatars display initials rather than avatar images; iOS screen sharing lacks a ReplayKit extension; Android screen sharing and live speaker promotion need device/service end-to-end testing. LiveKit Cloud webhook and R2 bucket CORS must be configured externally before those flows work in deployment.
- The `review` skill was used at the end of implementation; it requires reporting findings and stopping until the developer chooses what to address. The prior answer reported these findings and paused implementation.

## Next session starts with

1. Restore this memory and confirm it with the user.
2. Ask which review findings to address. The immediate code gap is mobile avatar images in `apps/mobile/src/components/post-card.tsx` and `screens/PublicProfile.tsx` (the existing shared `Avatar` component is name-based).
3. Once the user authorizes continued fixes, verify web and Android live-room roles/permissions on real LiveKit, R2 uploads in a browser, and new social migrations against a safe staging database before deployment. Do not mutate the live Neon database as a test.
4. Obtain user direction for iOS screen-sharing scope. The user owns the eventual EAS build.

## Open questions

- Should iOS screen sharing be implemented now via a ReplayKit Broadcast Extension, or be explicitly out of scope for the Google Play hackathon demo?
- Are the LiveKit webhook and R2 browser CORS settings configured in the external dashboards?
- Does the user want the remaining review findings fixed before any commit/deployment, and should deployment be performed by the user or requested from the agent later?
