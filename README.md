# Football Pool — FIFA 2026

A web app for a group of friends to predict FIFA 2026 World Cup match scores and compete on a leaderboard. Multiple independent games (friend groups) run on one deployment; each game tracks its own players, predictions, and standings.

## How It Works

1. An admin (single shared password) creates games and records real match results as they happen
2. Players join a game with that game's shared password and a display name, predict scores for upcoming matches, and pick a tournament champion
3. Predictions lock at each match's kickoff; the champion pick locks at the tournament's first kickoff
4. The leaderboard is computed live from recorded results

```
admin creates game → players predict → admin records results → leaderboard recomputes
```

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

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TypeScript (static SPA) |
| Backend | Cloudflare Worker (Hono), REST API under `/api` |
| Database | Cloudflare D1 (SQLite) |
| Hosting | Cloudflare Pages + Workers (free tier) |

Static tournament data (teams, fixtures, bracket template) lives in `data/`; only mutable state lives in D1. Time-dependent behavior reads a clock provider (`api/clock.ts`) so it can be controlled deterministically in tests.

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
api/             # Worker — routes, auth, clock, repositories
shared/          # Pure logic shared by client + worker (scoring, bracket, phases, time, types)
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

See [`DEPLOY.md`](DEPLOY.md) for one-time Cloudflare setup and the per-deploy steps.
