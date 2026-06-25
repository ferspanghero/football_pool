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

## Predict from your LLM

Players can also make their picks by chatting with an LLM instead of using the web UI. The same Worker exposes a [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp` with tools to read fixtures, standings, and your entry and to submit predictions, champion, and boosts. From the **Connect LLM** tab, generate a token and paste the one-line `claude mcp add` command into [Claude Code](https://claude.com/claude-code) — then ask it to make your predictions. The token reuses your signed session (scoped to you, in that game, with a 60-day expiry), and every write enforces the same kickoff locks as the web UI. See `project_files/v3/plan.md`.

## Scoring

Per-match base points:

| Outcome | Points |
|---|---|
| Exact score | 7 |
| Correct outcome + correct goal-difference magnitude | 5 |
| Correct outcome only | 3 |
| Correct goal-difference magnitude, wrong winner | 2 |
| Nothing right | 0 |

Base points are multiplied by a phase factor (group stage ×1, escalating to the final ×6). A correct champion pick adds a flat bonus. Knockout matches are scored against the 90-minute result. Phases are first-class entities in `shared/phases.ts` (each owns its multiplier, label, stage, and whether it's boostable); `shared/scoring.ts` holds the scoring math.

Two optional extras can add to — or subtract from — a match's points:

- **First to score** *[optional]*: pick which team scores first, or neither. A correct pick earns a bonus; a wrong one — including a goalless draw — costs the same, both multiplied by the phase factor, so it's a genuine risk. Skipping it changes nothing. Locks at the match's kickoff; the admin records the actual first scorer (or a goalless draw) alongside the result, since it isn't derivable from the 90-minute score.
- **2× boost** *[optional]*: flag one match per round to double everything that match earns — including negative points. The single-match 3rd-place and final rounds aren't boostable. The boost locks per match, not per round: you can set or move it to any match in the round that hasn't kicked off yet — even after earlier matches in the round are done — and once your boosted match kicks off it's locked.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TypeScript (static SPA) |
| Backend | Cloudflare Worker (Hono), REST API + MCP server under `/api` |
| Database | Cloudflare D1 (SQLite) |
| Hosting | A single Cloudflare Worker serves the SPA (as static assets) and the API (free tier) |

Static tournament data (teams and all fixtures) lives in `data/`; only mutable state lives in D1. Knockout fixtures start with placeholder team labels; once a round's pairings are known they're resolved automatically from the external feed into a D1 overlay (no source edit or redeploy), and the admin can correct any resolution by hand in the Results tab — each knockout fixture's teams are editable there until it kicks off. An hourly scheduled job (a Cloudflare Cron Trigger) resolves knockout teams and then pulls finished matches' 90-minute scores from the external feed, writing both automatically — and the admin can trigger the same sync on demand from the Results tab; anything an admin enters by hand (a result or a knockout pairing) takes precedence and is never overwritten by the sync. Time-dependent behavior reads a clock provider (`api/clock.ts`) so it can be controlled deterministically in tests.

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
api/             # Worker — routes, auth, clock, repositories, result-feed providers, scheduled sync, MCP server
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

End-to-end test scenarios (preconditions, steps, expected outcomes) are documented in the versioned plan docs (`project_files/v*/plan.md`) under "Test Scenarios" and are the basis the Playwright specs implement against.

## Deployment

Deploy with one command:

```bash
./scripts/deploy.sh
```

It's idempotent and handles both the first deploy and every later one — `wrangler login` (interactive, first time only), creating the D1 database, applying migrations, setting secrets (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`), and deploying the single Worker (SPA static assets + API). Re-running is always safe; the script header documents each step. For a quick redeploy without the full check gate, `npm run deploy`.

> The local-only `DEPLOYMENT_STAGE=TEST` flag (see `.dev.vars.example`) enables the test-clock endpoint and must never be set in production — the deploy script does not set it.

## License

Released under the [MIT License](LICENSE).
