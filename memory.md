# Memory — ENNOIA Rebrand and Integrations

Last updated: 2026-09-22 13:05 Africa/Lagos

## What was built

- Rebranded the product identity from MOMENT/Moment to ENNOIA across workspace package names (`@ennoia/*`), scripts, runtime metadata, environment examples, documentation headings, visible web/mobile branding, backend messages, and the Envio indexer name/description.
- Added the supplied ENNOIA artwork from `C:\Users\JESSE\Desktop\ENNOIA logo` to `apps/web/public/` and `apps/mobile/assets/`.
- Web now uses the ENNOIA mark and wordmark in the public header, signed-in navigation, and footer, plus an ENNOIA favicon, title, and description.
- Expo mobile now has ENNOIA app name/slug/scheme, launcher icon, Android adaptive icon, splash image, and branded sign-in header.
- Updated web/mobile session storage keys and demo identities from the old brand to ENNOIA.
- The earlier Privy, LiveKit, Monad, and Envio integration work remains in the same dirty worktree, including `packages/indexer/`, backend GraphQL fallback, role-scoped LiveKit tokens, Privy auth, and environment examples.

## Decisions made

- ENNOIA is the application/product name. “Moment” remains the core captured livestream object and user-facing content type.
- Kept `MomentRewards`, Moment DTO/entity names, `/moments` routes, event names, and `MOMENT_REWARDS_ADDRESS` unchanged because they are domain/on-chain API identifiers rather than the app brand.
- Renamed all workspace package scopes from `@moment/*` to `@ennoia/*`.
- Changed native identifiers to `com.ennoia.app`, the Expo slug/scheme to `ennoia`, and local auth storage to `ennoia_token`. The temporary EAS account owner is `jessecinnamonfir`; it is intentionally absent from the public bundle identifier.
- Used the transparent adaptive foreground artwork for web/mobile in-app marks, the store image for launcher/favicon assets, and the full supplied ENNOIA wordmark for the splash screen.

## Problems solved

- The transparent logo asset contained adaptive-icon safety padding, making it appear too small in website navigation. It is now centered and visually cropped through its fixed-size containers without altering the source artwork.
- Refreshed pnpm workspace links and the lockfile after the package-scope rename; no `@moment/*` references remain.
- Confirmed that no stale app-identity strings remain for old names, slugs, schemes, bundle IDs, relying-party display name, page title, or session keys. Domain-level “Moment” references intentionally remain.

## Current state

- Rebrand changes are present but uncommitted in an already-dirty worktree that also contains the earlier integration work. Preserve all unrelated/user changes.
- `pnpm typecheck` passes for core, mobile, server, and web.
- Core tests pass: 42/42. Contract tests pass: 8/8.
- Production web build passes; only existing Privy/Rollup pure-annotation and large-bundle warnings remain.
- Expo SDK 57 public config validates the ENNOIA name, slug, scheme, icon, adaptive icon, splash, and native identifiers.
- Browser visual QA confirmed the ENNOIA header mark and wordmark render clearly. The local preview server and temporary preview tab were stopped/closed.
- Envio indexer remains under `packages/indexer` with `config.yaml`; its configured indexer name is now `ennoia-indexer` while the indexed contract remains `MomentRewards`.

## Next session starts with

1. Run `/remember restore` and confirm this handoff.
2. Review `git diff` without discarding the existing integration changes.
3. If continuing the rebrand, launch the Expo app or a development build to visually verify the launcher icon, splash screen, and mobile sign-in header on a device/simulator.
4. Keep EAS mobile builds manual unless the user explicitly asks Codex to build one.

## Open questions

- External dashboards are outside the repository: Privy app display/allowed origins, passkey relying-party settings, Envio hosted project display name, deployment platform variables, and store listings may still need manual renaming to ENNOIA.
- Changing `ennoia_token` intentionally signs out existing local development sessions. Decide whether a one-time migration from `moment_token` is needed before production rollout.
