# Memory — ENNOIA live speaker flow

Last updated: 2026-09-24 14:56 Africa/Lagos

## What was built

- The web and mobile LiveKit stages have distinct host, participant, and speaker controls. Hosts manage requests, invites, speaker camera/screen permissions, and removal. Approved speakers choose when to enable their own microphone and camera; the UI shows whether their tracks are actually publishing.
- `apps/server/src/liveRooms.ts` now gives PostgreSQL query results explicit camel-case aliases for speaker identity, permissions, and host presence. `apps/server/src/routes.ts` rejects malformed speaker IDs. `apps/web/src/lib/api.ts` and `apps/mobile/src/lib/api.ts` refuse to send speaker actions with missing IDs. `apps/server/src/social.test.ts` covers request identity, approval, invitations, and the malformed-ID case.
- The ENNOIA social feed, posts, profiles, and communities remain implemented across server, web, and mobile. `ui-registry.md` records the visual patterns.

## Decisions made

- Hackathon exhibition uses Monad testnet with Render API, Vercel web, Neon database, Envio, LiveKit, Privy, and Cloudflare R2; it is not intended as a web-only release.
- Host owns moderation. Participants watch/react/request a mic. A speaker can publish mic and camera after approval or accepting an invite, but device capture starts only on that person's action. Screen sharing remains host-controlled.
- The user handles EAS builds. Do not build the native app, push, or deploy without a new explicit request.

## Problems solved

- On Neon/PostgreSQL, unquoted selected names such as `userId` were returned as `userid`. This made the host send `/speakers/undefined/approve` and prevented invitees from seeing their invitations or their speaker role. Explicit aliases corrected the response shape, with client/server guards added.
- The user's subsequent real livestream test succeeded: they reported that joining and the speaker flow worked smoothly, including a spontaneous test with their brother. This is user-reported live verification, not an independently instrumented media test.

## Current state

- Git branch `envio` was clean before this memory update and matched its locally known `origin/envio` tracking state. HEAD is `cc05c66`, which contains the PostgreSQL speaker-ID fix. Only `memory.md` is now modified. The user reports the live experience working; deployment version was not independently checked.
- The focused server social/live-room test, server build, and server/web/mobile typechecks passed after the fix. No EAS build or physical-device media test was run by the agent.

## Next session starts with

- Restore this memory and confirm it with the user. There is no outstanding requested code change; ask what they want to work on next.
- If the user reports another live-room issue, first separate approval state, LiveKit publish permission, actual mic track publication, and host audio playback. Use the visible `Mic live/off` status to narrow it down.

## Open questions

- Has the updated speaker flow been tested in the installed Android app, or only in browsers?
- Are there further hackathon-demo or release-readiness issues the user wants addressed next?
