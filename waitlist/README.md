# ENNOIA waitlist

A standalone Next.js site for the ENNOIA pre-launch waitlist. It is separate from the main app
(`apps/`, `packages/`) and shares no code or config with it, so it can be deployed on its own.

It has a "Coming soon" hero, an email signup form with a role picker (scout, creator or both),
referral links, and a live signup count. Signups are stored in Neon Postgres.

## Run locally

```bash
cp .env.example .env.local   # then fill in DATABASE_URL
npm install
npm run dev                  # http://localhost:3000
```

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string. Server-only; never give it a `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SITE_URL` | no | Public URL of this site, used for social preview images. |

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

**Vercel:** import the repo, set **Root Directory** to `waitlist`, and add the environment variables
above. The framework is detected automatically.

**Any Node host:** from this folder, run `npm ci && npm run build`, then `npm start` (set `PORT` to
change the port from 3000).

## API

- `GET /api/waitlist` returns `{ count }`.
- `POST /api/waitlist` takes `{ email, name?, role?, ref? }` and returns
  `{ already, position, referrals, referralCode, count }`. It responds `201` for a new signup and
  `200` if the email is already on the list, in which case it keeps its original place.

Abuse protection is a hidden bot-trap field plus a per-IP limit of 8 requests a minute. The limit
is held in memory, so on serverless or multi-instance hosts it applies per instance. Add a
CDN/WAF rule in front if you need a hard limit.
