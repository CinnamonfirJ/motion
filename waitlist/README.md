# ENNOIA waitlist

A standalone Next.js site for the ENNOIA pre-launch waitlist. It is separate from the main app
(`apps/`, `packages/`) and shares no code or config with it, so it can be deployed on its own.

It has a "Coming soon" hero, an email signup form with a role picker (scout, creator or both),
referral links, and a live signup count. Signups are stored in Neon Postgres.

## Run locally

```bash
cp .env.example .env.local   # then fill in DATABASE_URL
npm install
npm run dev                  # http://localhost:3000/waitlist
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string. Server-only; never give it a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SITE_URL` | no | Public origin of the main website (for example, `https://ennoia-app.vercel.app`), used for social preview images. Set it to the custom domain's origin after the domain is connected. |

`NEXT_PUBLIC_*` values are compiled into the build. Rebuild after changing them.

## Database

The `waitlist` table (see `db/schema.sql`) is created automatically on the first request. To
create it ahead of time, run:

```bash
npm run db:migrate
```

To export signups, use the Neon SQL editor:

```sql
SELECT email, name, role, referred_by, created_at FROM waitlist ORDER BY created_at;
```

## Deploy

**Vercel Project B (waitlist):** import the repo, set **Root Directory** to `waitlist`, and add
the environment variables above. The framework is detected automatically. This Next.js app uses
`basePath: "/waitlist"`; after deployment, verify
`https://ennoia-waitlist-zeta.vercel.app/waitlist` and its assets/API. Its root URL is no longer
the waitlist entry point.

**Vercel Project A (main Vite app):** deploy the repository-root `vercel.json` after Project B.
It proxies `/waitlist` and everything beneath it to Project B before the Vite SPA fallback.
Attach the custom domain to Project A only. Once DNS points to Project A, visitors use
`https://YOUR_DOMAIN/waitlist` without a redirect. The domain and DNS records themselves must
be configured in Vercel and Hostinger; DNS cannot route a URL path.

Deploy Project B first, then Project A. The waitlist API, public images, and referral links all
use `/waitlist` so they work through the proxy. If Project B's Vercel URL changes, update the
two `/waitlist` destinations in the repository-root `vercel.json` before deploying Project A.

**Any Node host:** from this folder, run `npm ci && npm run build`, then `npm start` (set `PORT` to
change the port from 3000).

## API

- `GET /waitlist/api/waitlist` returns `{ count }`.
- `POST /waitlist/api/waitlist` takes `{ email, name?, role?, ref? }` and returns
  `{ already, position, referrals, referralCode, count }`. It responds `201` for a new signup and
  `200` if the email is already on the list, in which case it keeps its original place.

Abuse protection is a hidden bot-trap field plus a per-IP limit of 8 requests a minute. The limit
is held in memory, so on serverless or multi-instance hosts it applies per instance. Add a
CDN/WAF rule in front if you need a hard limit.
