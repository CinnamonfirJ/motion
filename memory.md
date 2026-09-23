# Memory — ENNOIA Testnet Deployment Handoff

Last updated: 2026-09-23 15:08 Africa/Lagos

## What was built

- ENNOIA web and Expo mobile integrate Privy, LiveKit, Monad testnet, Cloudflare R2, Neon PostgreSQL, and an Envio indexer. Mobile application ID is `com.ennoia.app`; “Moment” remains the captured livestream object.
- Local values from root `env.txt` were split into ignored root, web, mobile, and indexer `.env` files; the redundant `env.txt` was removed. The incomplete multiline Privy verification key was cleared and must be recopied from Privy if desired; it is optional for the current SDK path.
- Pinned TypeScript 5.9.3 in `packages/contracts/package.json` to resolve Hardhat’s TypeScript 6 `moduleResolution=node10` failure. Contract build and all 8 tests pass.
- Migrated `packages/indexer` from Envio V2 to V3.12.1, including config, event handlers, and tsconfig. The config defaults to the deployed public contract address and working Monad testnet RPC, starts at deployment block 65,032,013, and still allows Envio environment overrides.
- Committed and pushed the contracts/indexer fixes to `origin/envio` as `5e01829`. Did not include ignored secrets, the untracked deployment artifact, `.gitignore`, or this memory file.

## Decisions made

- Hackathon exhibition uses real Monad testnet, not a simulated or mainnet release. Neon is the app database; Render hosts only the API, Vercel hosts the web, and Envio Cloud hosts the indexer.
- The user will run the EAS mobile build and handle Google Play submission; do not run a mobile build without a new request.
- Keep secrets in ignored local files and platform dashboards. Client bundles receive only public `VITE_*` and `EXPO_PUBLIC_*` values.
- A full production-mode Moment demo needs four eligible distinct reactors after 15 seconds’ watch time and 25 deduplicated Moment views before settlement. Development fast-forward is disabled in production.

## Problems solved

- The user deployed `MomentRewards` on Monad testnet at public address `0xF5dBf042aaDb38e4519D2B972C0a4f16C22a20EA`. Read-only RPC checks located deployment block 65,032,013, confirmed contract code and 0.5 testnet MON pool, and confirmed the configured backend settler is authorized.
- An Envio dashboard warning concerned a V2 indexer version with a rollback-on-reorg bug; the package and source were migrated to current V3.12.1 rather than installing `latest` only at the workspace root.
- Local Envio codegen cannot run on this Windows host: the CLI native runner returns a null `runCli` error; WSL/Docker is unavailable. The V3 YAML was parsed and checked for one chain, one contract, seven events, correct handler path, address fallback, and start block.

## Current state

- Branch `envio`, latest pushed commit `5e01829`. The Git push should trigger a new Envio Cloud deployment, but its build/codegen result has not been verified. Earlier deployment at `7b8afe0` failed at codegen; exact dashboard log lines were not provided.
- Root/server and indexer local ignored `.env` files contain the deployed contract address. The public deployment artifact under `packages/contracts/deployments/` remains untracked. Existing local edits to `.gitignore` and `memory.md` are intentionally separate from the pushed commit.
- An existing `ENVIO_GRAPHQL_URL` in local config did not respond to a GraphQL health query; obtain the working URL after Envio succeeds.
- Production configuration is still incomplete: Neon `DATABASE_URL`, non-default `JWT_SECRET`, `PLATFORM_ADDRESS`, deployed HTTPS web/API URLs, final domain/passkey association, and hosted environment settings need attention. Local `APP_MODE` is development with seed/demo routes enabled; production must disable both.
- No Render/Vercel deployment, signed EAS mobile build, physical-device test, or full end-to-end demo has been verified this session.

## Next session starts with

1. Run `/remember restore` and confirm this state.
2. Check the Envio deployment for commit `5e01829`. If it failed, obtain the new Codegen log lines and diagnose; if successful, verify indexed events and put its GraphQL URL in the API’s Render environment.
3. Ensure Envio dashboard branch is `envio`, root is `packages/indexer`, config path is `config.yaml`, and any address/RPC overrides are correct. Do not assume local `.env` values reached Envio Cloud.
4. Finish Neon/Render/Vercel and final domain/passkey setup; let the user make the EAS build. Rehearse real LiveKit streaming, reactions, R2 clips, tips, Envio indexing, and settlement.

## Open questions

- Did the `5e01829` Envio Cloud deployment pass codegen, and what are its GraphQL URL or exact error logs?
- What is the final web domain, platform-recipient wallet address, and Android signing certificate fingerprint?
- Are all hosted environment variables configured, and can the full flow pass on physical devices?
