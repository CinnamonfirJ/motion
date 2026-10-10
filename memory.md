# Memory — ENNOIA posts, stream invites, and phone viewing

Last updated: 2026-10-10 (Africa/Lagos)

## What was built

- On branch `envio`, uncommitted changes add owner-only post deletion to both clients: `apps/web/src/lib/api.ts`, `apps/web/src/components/PostCard.tsx`, `apps/mobile/src/lib/api.ts`, `apps/mobile/src/components/post-card.tsx`, and `apps/mobile/src/screens/PostDetail.tsx`. The existing server `DELETE /posts/:id` route performs a soft delete. Clients ask for confirmation, disable the action while pending, show failures, refresh lists, and the native detail screen goes back after deleting its parent post.
- Web host invite controls in `apps/web/src/components/LiveKitStage.tsx` now scroll to an always-present in-room viewer list. Previously the prominent controls had no handlers and the list appeared only after speaker activity. Native `apps/mobile/src/components/livekit-stage.tsx` keeps the viewer list reachable and exposes pending invites to the recipient. The existing server invite/accept routes were not changed.
- Phone-sized livestream viewing is more video-first: web `apps/web/src/screens/Live.tsx` and `LiveKitStage.tsx` use a larger video frame with expandable over-video controls; native `apps/mobile/src/screens/Live.tsx` and `components/livekit-stage.tsx` likewise use an expandable control panel over the video. Invite acceptance opens the panel automatically. Browser audio enable remains visible when controls are collapsed.
- `apps/server/src/social.test.ts` now covers author-only post deletion and removal from reads. `ui-registry.md` records the updated visual patterns.

## Decisions made

- “Regular posts” includes authored replies, quotes, and reshares; the server’s existing owner-only soft-delete endpoint remains the authority.
- “Mobile view” includes both the phone-sized website and the native app. Keep ENNOIA’s square panel styling, preserve the existing desktop host studio, and make phone viewing video-first.
- Host invites an already-connected viewer; that viewer must accept before becoming a speaker. Host retains permission control.

## Problems solved

- The web host’s prominent Invite Guest buttons were inert; they now lead to a real viewer list. The list no longer disappears when no requests or speakers exist.
- Post deletion was supported by the server but unavailable in the web and native interfaces.

## Current state

- Changes above are uncommitted and not deployed. `git diff --check` and TypeScript/TSX syntax transpilation passed.
- Full client typechecks and the server social test did not run: local dependencies are missing (`expo`/`react-native`, `ethers`, and some web packages). `pnpm install --frozen-lockfile --prefer-offline` made no progress and was stopped. Do not report the feature as production-verified.
- No real two-person invite/accept test or native-device layout check has been performed. Existing post deletion marks the row deleted but does not remove uploaded media from storage.
- The prior web screen-share fix (request tab audio, adaptive LiveKit settings, remove fake latency badge) is in the baseline, but live latency has not been measured or conclusively fixed.

## Next session starts with

1. Inspect `git status` on `envio`; preserve the 11 modified files listed above. Resolve the local dependency-install blockage without discarding edits.
2. Run web/native typechecks and `apps/server/src/social.test.ts`; correct any failures.
3. Test a real two-person stream on phone web and native: host invites a connected viewer, viewer sees and accepts, mic publishes, and the controls remain usable. Test author and non-author post deletion and feed/profile refresh.
4. Review the visual result on a small phone, then commit/deploy only when the user requests it.

## Open questions

- Whether post deletion should also remove media objects permanently, rather than only soft-delete the post.
- Whether live latency remains after the prior adaptive-stream change; it needs a measured production retest.
