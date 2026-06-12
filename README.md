# Football Pool — FIFA 2026

A web app for a group of friends to predict FIFA 2026 World Cup match scores and compete on a leaderboard. Multiple independent games (friend groups) run on one deployment; each game tracks its own players, predictions, and standings.

## How It Works

1. An admin (single shared password) creates games; finished matches' results are pulled automatically from an external results feed, and the admin can record or correct any result by hand
2. Players join a game with that game's shared password, choosing a display name and a personal password; on return they sign in with just that personal password (and resume automatically on the same device), predict scores for upcoming matches, and pick a tournament champion
3. Predictions lock at each match's kickoff; the champion pick locks at the tournament's first kickoff
4. The leaderboard is computed live from recorded results

```
admin creates game → players predict → results sync (or admin entry) → leaderboard recomputes
```

Players can switch the interface between the default look and a set of opt-in retro themes; the choice is remembered in the browser.

## Scoring

Per-match base points:

| Outcome | Points |
|---|---|
| Exact score | 7 |
| Correct outcome + correct goal-difference magnitude | 5 |
| Correct outcome only | 3 |
| Correct goal-difference magnitude, wrong winner | 2 |
| Nothing right | 0 |

Base points are multiplied by a phase factor (group stage ×1, escalating to the final ×6). A correct champion pick adds a flat bonus. Knockout matches are scored against the 90-minute result. Phases are first-class entities in `shared/phases.ts` (each owns its multiplier, label, and stage); `shared/scoring.ts` holds the scoring math.

Two optional extras can add to — or subtract from — a match's points:

- **First to score** *[optional]*: pick which team scores first, or neither. A correct pick earns a bonus; a wrong one — including a goalless draw — costs the same, both multiplied by the phase factor, so it's a genuine risk. Skipping it changes nothing. Locks at the match's kickoff; the admin records the actual first scorer (or a goalless draw) alongside the result, since it isn't derivable from the 90-minute score.
- **2× boost** *[optional]*: flag one match per round to double everything that match earns — including negative points. Locks at that round's first kickoff.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TypeScript (static SPA) |
| Backend | Cloudflare Worker (Hono), REST API under `/api` |
| Database | Cloudflare D1 (SQLite) |
| Hosting | A single Cloudflare Worker serves the SPA (as static assets) and the API (free tier) |

Static tournament data (teams and all fixtures) lives in `data/`; only mutable state lives in D1. Knockout fixtures start with placeholder team labels that an admin replaces with the actual teams (by editing `data/tournament.ts`) once each round's pairings are known — there is no automatic standings/bracket resolution. An hourly scheduled job (a Cloudflare Cron Trigger) pulls finished matches' 90-minute scores from an external results feed and writes them automatically — and the admin can trigger the same pull on demand from the Results tab; results entered or corrected by an admin take precedence and are never overwritten. Time-dependent behavior reads a clock provider (`api/clock.ts`) so it can be controlled deterministically in tests.

## Getting Started

### Prerequisites

- Node.js 22+ (the `engines` field pins to 22)
- A Cloudflare account — only for deployment, not for local development

### Setup

```bash
npm install
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars`. Generate the admin password hash:

```bash
echo -n "your-admin-password" | npx tsx scripts/hash-admin-password.ts
```

Apply the schema to the local database:

```bash
npx wrangler d1 migrations apply football-pool --local
```

### Usage

Run the two dev servers in separate terminals:

```bash
npm run dev:worker   # Worker + local D1 on :8787
npm run dev          # Vite SPA on :5173, proxies /api to the worker
```

Open http://localhost:5173. Visit `/admin` to create a game and enter results.

Common scripts:

```bash
npm run test            # unit + integration tests
npm run test:coverage   # tests with coverage report
npm run lint            # ESLint
npm run typecheck       # TypeScript check
npx playwright test     # browser end-to-end tests
```

## Project Structure

```
src/             # Frontend (React) — routes, api-client
api/             # Worker — routes, auth, clock, repositories, result-feed providers, scheduled sync
shared/          # Pure logic shared by client + worker (scoring, phases, time, types)
data/            # Static tournament data
migrations/      # D1 schema
tst/             # Tests (unit, integration, e2e)
project_files/   # Versioned plan and task docs
```

## Tests

```bash
npm run test            # Vitest unit + integration
npm run test:coverage   # with coverage gate
npx playwright test     # Playwright browser e2e
```

End-to-end test scenarios (preconditions, steps, expected outcomes) are documented in `project_files/v1/plan.md` under "Test Scenarios" and are the basis the Playwright specs implement against.

## Deployment

Deploy with one command:

```bash
./scripts/deploy.sh
```

It's idempotent and handles both the first deploy and every later one — `wrangler login` (interactive, first time only), creating the D1 database, applying migrations, setting secrets (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`), and deploying the single Worker (SPA static assets + API). Re-running is always safe; the script header documents each step. For a quick redeploy without the full check gate, `npm run deploy`.

> The local-only `DEPLOYMENT_STAGE=TEST` flag (see `.dev.vars.example`) enables the test-clock endpoint and must never be set in production — the deploy script does not set it.

## License

Released under the [MIT License](LICENSE).
