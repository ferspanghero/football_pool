# Deployment

Two artifacts ship: the static SPA (Cloudflare Pages) and the Worker (Cloudflare Worker + D1).

## One-time setup

These steps require interactive Cloudflare auth and cannot be automated from this repo.

### 1. Authenticate

```sh
npx wrangler login
```

### 2. Create the D1 database

```sh
npx wrangler d1 create football-pool
```

Wrangler prints a `database_id`. Paste it into `wrangler.toml`, replacing `PLACEHOLDER_SET_AT_DEPLOY`.

### 3. Apply the schema

```sh
npx wrangler d1 migrations apply football-pool --remote
```

### 4. Set production secrets

```sh
# 32+ random bytes; pipe directly.
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET

# Admin password hash.
echo -n "your-admin-password" | npx tsx scripts/hash-admin-password.ts \
    | npx wrangler secret put ADMIN_PASSWORD_HASH
```

> **Never set `DEPLOYMENT_STAGE` in production.** It is a local/test-only flag that enables
> `POST /api/admin/test/clock` (server-clock control for the E2E suite). Left unset in
> production, that endpoint always returns 403.

### 5. Pages project (one-time)

Either via the dashboard (recommended for the first deploy):

1. Connect this repo to a Cloudflare Pages project.
2. Build command: `npm run build`.
3. Build output: `dist`.
4. Add a Pages Function route or a Worker route that maps `/api/*` to the deployed Worker.

Or fully via CLI:

```sh
npx wrangler pages project create football-pool --production-branch main
npx wrangler pages deploy dist --project-name football-pool
```

## Subsequent deploys

```sh
npm run build           # build the SPA
npx wrangler deploy     # deploy the Worker
npx wrangler pages deploy dist --project-name football-pool   # deploy the SPA
```

Or wire to git push via the Cloudflare Pages dashboard.

## Local development

```sh
cp .dev.vars.example .dev.vars
# Fill in SESSION_SECRET and ADMIN_PASSWORD_HASH.
# Generate the admin hash the same way as step 4 above:
echo -n "your-admin-password" | npx tsx scripts/hash-admin-password.ts

# Apply the schema to the local D1 (creates the tables miniflare uses):
npx wrangler d1 migrations apply football-pool --local

# In one terminal:
npm run dev:worker      # wrangler dev on :8787

# In another:
npm run dev             # vite dev on :5173, proxies /api/* to :8787
```

Open http://localhost:5173. The `/admin` page lets you create games and enter results.

## Smoke test after deploy

1. `GET https://<your-pages-domain>/api/tournament` returns 104 matches.
2. Visit `/admin`, log in with the admin password, create a game.
3. Open `/`, pick the game, log in as a player, save a prediction.
4. As admin, record a result on a past match. The leaderboard updates on refresh.

## Rate limiting (post-deploy, dashboard only)

In the Cloudflare dashboard → Security → WAF → Rate limiting rules, add:

- Path `/api/games/*/enter` — 10 req/min per IP.
- Path `/api/admin/login` — 10 req/min per IP.
