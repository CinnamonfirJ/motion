# ENNOIA release checklist

The codebase fails closed in `APP_MODE=production`. Complete these deployment-owned steps after filling the example environment files.

## Web and API

1. Deploy the web app with `vercel.json` and set every `VITE_*` production variable.
2. Deploy the API with `render.yaml`; use Neon for `DATABASE_URL` (Render does not provision a database for this project).
3. Set `PUBLIC_WEB_URL` and the exact HTTPS `CORS_ORIGINS`. Confirm `/health`, `/config`, REST, and `wss://.../ws` from the production domains.
4. Add the Render API URL to Vercel and the Vercel URL to Render, then redeploy both services.

## Privy passkey association

The domain in `VITE_PRIVY_RELYING_PARTY` / `EXPO_PUBLIC_PRIVY_RELYING_PARTY` must host both association files:

- `/.well-known/apple-app-site-association` with the Apple Team ID and `com.ennoia.app`.
- `/.well-known/assetlinks.json` with `com.ennoia.app` and the SHA-256 fingerprint of the Google Play App Signing certificate.

The certificate fingerprint only exists after Play App Signing is configured, so it cannot be committed safely as a placeholder. Publish the real files, verify they return HTTP 200 without redirects, then test passkey signup and login on physical Android/iOS devices.

## LiveKit and R2

1. Permit the LiveKit Egress credentials to write to the configured R2 bucket.
2. Attach a public read-only custom domain to the bucket and use it for `R2_PUBLIC_BASE_URL`.
3. Start a real stream, wait through a detected Moment, and verify the archive playlist, 2-second segments, and `moments/<id>/index.m3u8` all play from another network.

## Monad and Envio

1. Deploy `MomentRewards` to Monad testnet, authorize and fund the settler, and fund the contract reward pool.
2. Put the deployed address and deployment block in the Envio environment/config, deploy the `envio` branch, then set the resulting GraphQL URL on the API.
3. Verify user-signed tips, batch commitments, Moment creation, settlement, and indexed balances using the explorer and Envio GraphQL.

## Google Play

1. Replace the team/contact placeholders in `/privacy` and `/terms`; obtain legal review appropriate to the launch jurisdictions.
2. Complete Play Console App content: privacy URL, data safety, content rating, target audience, ads declaration, account-deletion URL/instructions, and UGC moderation answers.
3. Fill public mobile environment values in the EAS production environment. The profile in `apps/mobile/eas.json` produces an AAB and defaults submission to the internal track.
4. Run the production EAS build yourself, test the signed AAB on physical devices, then promote internal → closed/open → production when ready.

Do not commit service secrets, signing files, a Google service-account JSON file, or wallet private keys.
