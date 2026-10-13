# Memory — ENNOIA earnings tabs and Moment cleanup

Last updated: 2026-10-12 10:45 (Africa/Lagos)

## What was built

- The earnings screen now exposes Scout and Creator tabs on both phone-sized web and the installed Expo app. The web switch no longer depends on whether creator Moments exist and stacks below the heading on narrow screens. The native screen fetches both earnings endpoints, shows per-tab loading/error states with retry, and renders creator payouts. Files: `apps/web/src/screens/Earnings.tsx`, `apps/mobile/src/screens/Earnings.tsx`, `apps/mobile/src/lib/api.ts`, and `ui-registry.md`.
- Earlier post-deletion, stream-invite, and phone-viewing changes are now part of the current branch baseline; see the code and `ui-registry.md` for their implemented behavior.
- At the user's explicit request, the live Neon database was cleaned to retain only Moment `mom_6ee28d2d8376471593bd`. Sixteen other Moment rows and their eighteen R2 clip objects were deleted. The retained clip object was preserved.

## Decisions made

- Scout and Creator earnings tabs remain visible even when one tab has no rewards or is still loading.
- The user's selected Moment and its clip were the sole exceptions to the cleanup. Stream recordings and other non-Moment data were not targeted.
- No assistant-run native build or deployment was performed; the user handles EAS/mobile builds.

## Problems solved

- The native earnings page previously had no Scout/Creator switch, and the web switch was hidden until a creator Moment existed.
- Post-cleanup checks showed exactly one Moment in Neon, with all remaining Moment views and founding-curator rows attached to it. The live API returned 200 for the retained Moment and 404 for one removed clip.

## Current state

- Branch `envio` tracks `origin/envio`; HEAD was `782177f` when this memory was saved. The branch was clean before this save; `memory.md` is now the only uncommitted file.
- The edited earnings files passed TypeScript/TSX syntax transpilation and `git diff --check` when changed. Full typechecks were blocked by missing local dependencies; pnpm could not fetch the registry and did not complete installation. The earnings layout has not been checked on a physical small-screen device.
- R2 verification found only `moments/mom_6ee28d2d8376471593bd/clip.webm` under the `moments/` prefix after cleanup. New livestream activity can create new Moments; cleanup did not disable Moment creation. Immutable onchain/indexer history was not changed.
- A request to delegate a review of `envio` against `origin/master` was interrupted before any review agent started. No review findings were produced.

## Next session starts with

1. Inspect `git status` and confirm whether the earnings changes are deployed; do not assume the local HEAD reflects the live web or installed app.
2. Once dependencies are available, run web/native typechecks and check both earnings tabs on a narrow phone screen, including zero creator earnings and an API failure/retry.
3. If the user still wants a code review, delegate one read-only reviewer for the staged, unstaged, untracked, and `782177fcd80189fcb024085f9c385f2af14d920d`-base diff; do not treat the interrupted request as completed.

## Open questions

- Whether the user wants to prevent future Moments from being created during the exhibition. The one-Moment condition was verified immediately after cleanup, not guaranteed permanently.
- Whether the current web and mobile deployments contain the earnings-tab changes.
