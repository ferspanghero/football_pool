# v1 Implementation Plan — Football Pool (FIFA 2026)

## Goal

Web app for ≤20 friends to predict FIFA 2026 World Cup match scores across multiple independent friend groups ("games"), with leaderboards updated as the admin enters real results. Single-deploy stack on Cloudflare's free tier (Pages + Workers + D1). Desktop-first browser UI with mobile fallback.

## Architecture

```
┌───────────────────────┐   /api/*    ┌─────────────────────────────┐
│  Cloudflare Pages     │────────────►│  Cloudflare Worker (Hono)   │
│  Vite + React + TS    │   fetch     │  Auth, scoring, admin       │
└───────────────────────┘             └──────────────┬──────────────┘
                                                     │ D1 binding
                                                     ▼
                                              ┌──────────────┐
                                              │   D1 SQLite  │
                                              └──────────────┘

  /data/tournament.ts ─── imported by both client and Worker via /shared
```

- Stateless Worker. HMAC-signed cookies hold session, no session store.
- Static tournament data (teams, groups, fixtures, bracket template) lives in TypeScript; D1 holds only mutable state.
- Scoring is a pure module reused by client (for preview hints) and Worker (for the leaderboard).
- Knockout bracket resolution is a pure function over recorded `match_results`.

## Repo Layout

```
football_pool/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── wrangler.toml
├── eslint.config.js
├── .prettierrc
├── src/                  Frontend (React)
│   ├── main.tsx
│   ├── app.tsx
│   ├── api-client.ts     Typed API wrapper (ApiError on non-2xx)
│   ├── components/       Reusable UI (Skeleton, Toast)
│   ├── lib/              Display helpers (match labels)
│   ├── routes/
│   └── styles/app.css
├── api/                  Worker
│   ├── index.ts          Worker entry (exports the built app)
│   ├── app.ts            Hono app + route registration + clock wiring
│   ├── clock.ts          ClockProvider (wall clock / fixed)
│   ├── middleware.ts     Auth + origin checks
│   ├── crypto.ts         PBKDF2 hashing + HMAC cookie sign/verify
│   ├── routes/
│   └── repos/            D1 access
├── shared/               Imported by both src/ and api/
│   ├── scoring.ts
│   ├── bracket.ts
│   ├── phases.ts         Phase entities (order, multiplier, label, stage)
│   ├── types.ts
│   └── time.ts           Kickoff comparison helpers
├── data/
│   └── tournament.ts     Teams, groups, fixtures, bracket template
├── migrations/
│   └── 0001_init.sql
├── tst/                  Tests mirroring source layout
│   ├── shared/
│   ├── api/
│   ├── data/
│   └── e2e/             Playwright specs + helpers
└── project_files/
    └── v1/
        ├── plan.md
        └── tasks.md
```

## Bootstrap (B)

### B1 — package.json + toolchain
- Init `package.json` with scripts: `dev`, `dev:worker`, `build`, `test`, `test:coverage`, `lint`, `typecheck`, `deploy`.
- Dependencies: `react`, `react-dom`, `react-router-dom`, `hono`.
- Dev deps: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `@vitest/coverage-v8`, `wrangler`, `better-sqlite3` (for test fixtures), `eslint`, `@typescript-eslint/*`, `prettier`.
- Single root `tsconfig.json` (strict, ES2022, DOM + `@cloudflare/workers-types`), with path aliases `@/`, `@shared/`, `@data/`, `@api/`.

### B2 — Vite + dev server
- `vite.config.ts` with React plugin, `@/` alias to `src/`, `@shared/` alias to `shared/`, `@data/` alias to `data/`.
- Dev server proxies `/api/*` → `http://localhost:8787` (wrangler dev port).

### B3 — Wrangler + D1
- `wrangler.toml` defining the Worker name, compatibility date, `[[d1_databases]]` binding `DB`, and assets binding for the built SPA.
- `wrangler d1 create football-pool` produces a database ID; record it in `wrangler.toml`.
- Worker entrypoint at `api/index.ts` exporting `default { fetch }`.

### B4 — Lint, format, typecheck
- ESLint config extending `@typescript-eslint/recommended`, with rule: no `any` without inline `// any: <reason>` comment.
- Prettier defaults; no opinions enforced beyond defaults.
- `tsc --noEmit` runs on every CI / pre-commit.

### B5 — Test runner
- Vitest with two projects: `node` (api + shared) and `jsdom` (src components when needed).
- Coverage via `@vitest/coverage-v8`. Exclusions configured per `~/.claude/skills/.conventions/javascript.md`: entry points, view rendering, logging.
- Test file convention: `tst/<mirror>/<name>.test.ts`.

## Static Tournament Data (D)

### D1 — Type model in `shared/types.ts`
- `PhaseId = 'GROUP_R1' | 'GROUP_R2' | 'GROUP_R3' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL'` — group rounds are first-class phases.
- `Stage = 'GROUP' | 'KNOCKOUT'` — the single source of the group/knockout distinction. Per-phase metadata (label, multiplier, stage, order) lives on the `Phase` entity in `shared/phases.ts`.
- `TeamId`, `MatchId` as branded string types.
- `Team = { id: TeamId; name: string; group: GroupLetter }`.
- `BracketSlot` discriminated union (`GROUP_WINNER`, `GROUP_RUNNER_UP`, `BEST_THIRD` with rank 1–8, `KNOCKOUT_WINNER` with matchId).
- `Match` union — group matches carry fixed `homeTeamId`/`awayTeamId`; knockout matches carry `homeSlot`/`awaySlot`. Narrowed via the `isGroupMatch`/`isKnockoutMatch` guards.
- `Score = { home: number; away: number }`.

### D2 — `data/tournament.ts`
- Export `TEAMS: Team[]` — all 48 qualified teams.
- Export `MATCHES: Match[]` — 72 group matches (12 groups × 6) + 32 knockout matches (16 R32 + 8 R16 + 4 QF + 2 SF + 1 3rd-place + 1 final) = **104 matches**.
- Each match has a stable string ID (`GROUP_A_1`, …, `R32_1`, …, `FINAL`) and a UTC kickoff timestamp (ISO 8601).
- Initial kickoff times pulled from FIFA's published 2026 schedule; admin can patch the file and redeploy if FIFA reshuffles.
- Export `FIRST_KICKOFF_UTC` derived as `min(MATCHES.map(m => m.kickoffUtc))`.

### D3 — Data validation tests
- Test: every match ID is unique.
- Test: each group has exactly 4 teams; each team plays exactly 3 group matches.
- Test: every knockout match's slot references resolve to defined feeders (group letter exists, feeder match ID exists).
- Test: kickoff timestamps are monotonically non-decreasing within a phase.
- Test: `FIRST_KICKOFF_UTC` equals the earliest group match kickoff.

## Scoring Engine (S)

### S1 — `shared/scoring.ts`
- Phase multipliers live on the `Phase` entity (`shared/phases.ts`): group rounds ×1, R32 ×2, R16 ×3, QF ×4, SF ×5, 3rd-place ×5, Final ×6. `CHAMPION_BONUS = 20` is defined here in `scoring.ts`.
- `scoreMatch(prediction, actual): number` — pure, returns 0/2/3/5/7 per the design.
- `scoreMatchWeighted(prediction, actual, phase): number` — multiplies by `phaseById(phase).multiplier`.
- `computeLeaderboard(players, predictions, results, matchesById, actualChampionTeamId)` — returns sorted `LeaderboardRow[]` with `totalPoints`, `exactScoreCount`, `correctOutcomeCount`.

### S2 — Scoring tests (TDD-first)
- `scoreMatch` table cases (mirroring brainstorm table): exact, outcome+GD, outcome only, GD-only-wrong-team, nothing right, draws (exact, outcome+GD), 0-0 exact.
- `scoreMatchWeighted`: each phase × exact-score case.
- Tiebreaker tests: two players tied on points sorted by exact count; three-way tie sorted by outcome count then name; name comparison is case-insensitive.
- Champion bonus: applied only when actual champion is known and matches player's pick.

## Bracket Resolution (K)

### K1 — `shared/bracket.ts`
- `groupStandings(results, groupLetter)` — returns 1st/2nd/3rd/4th per FIFA tiebreakers (points, GD, GF, head-to-head, fair play simplified to alphabetical fallback for v1).
- `bestThirds(results)` — returns the 8 best 3rd-place teams ranked 1–8.
- `resolveBracketSlot(slot, results)` — returns `TeamId | undefined` for a slot.
- `resolveMatchTeams(match, results)` — returns `{ homeTeamId, awayTeamId } | undefined` for any match.

### K2 — Bracket tests
- Group standings: full group with 6 results returns 4 teams in correct order.
- Group standings: partial results return `undefined` standings (or whatever the contract defines).
- Best-thirds: 12 groups × 1 third-place team each → top 8 ranked correctly.
- Tiebreak path: two teams tied on points but different GD → GD wins.
- Tiebreak path: tied on points + GD + GF → alphabetical (v1 simplification, documented).
- `resolveMatchTeams` for an R32 match: feeders complete → returns teams; feeders incomplete → returns `undefined`.

## D1 Schema (M)

### M1 — `migrations/0001_init.sql`
- Tables `games`, `players`, `predictions`, `match_results` per the design.
- Indexes: `predictions(match_id)`, plus unique constraints on `(game_id, display_name)` and game name `COLLATE NOCASE`.
- `wrangler d1 migrations apply football-pool` runs locally and on deploy.

### M2 — Repository layer in `api/repos/`
- `gamesRepo.ts`: `findById`, `findByName`, `listAll`, `create({ name, passwordHash })`.
- `playersRepo.ts`: `findOrCreate({ gameId, displayName })`, `findById`, `delete`, `setChampionTeamId`.
- `predictionsRepo.ts`: `upsert({ playerId, matchId, score })`, `findByPlayer`, `findByMatch`, `findAllForGame`.
- `resultsRepo.ts`: `upsert({ matchId, score })`, `findAll`, `findById`.
- Repos take a `D1Database` argument. Tests use in-memory `better-sqlite3` with the same SQL.

### M3 — Repo tests
- For each repo: empty, single-row insert, duplicate (constraint), boundary (zero goals), case-insensitive lookup.

## Worker API (A)

### A1 — `api/crypto.ts`
- `hashPassword(password)` — PBKDF2-SHA256 with a random salt; returns a combined `salt:hash` string for game/admin password storage.
- `verifyPassword(password, stored)` — constant-time comparison.
- `signCookie(payload)` / `verifyCookie(cookieValue, secret, nowMs?)` — HMAC-SHA256 with `SESSION_SECRET`.
- Tests for all four with known vectors.

### A2 — Middleware
- `requirePlayer` reads `player_session` cookie, validates HMAC, attaches `(gameId, playerId)` to context. 401 otherwise.
- `requireAdmin` same shape for `admin_session`. 401 otherwise.
- `requireOrigin` rejects writes whose `Origin` header ≠ deploy origin.
- Tests for valid cookie, expired cookie, tampered cookie, missing cookie.

### A3 — Public + tournament routes
- `GET /api/games` — `[{ id, name }]`.
- `GET /api/tournament` — projects `data/tournament.ts` to wire shape; cacheable.
- Tests for empty and seeded states.

### A4 — Player auth routes
- `POST /api/games/:id/enter` — body `{ password, displayName }`; verifies game password, find-or-create player, set cookie. Rate-limited.
- `POST /api/auth/logout` — clears cookie.
- `GET /api/me` — current player + their predictions + champion pick.
- Tests: success, wrong password, bad name (empty / >40 chars), cookie issuance.

### A5 — Prediction routes
- `PUT /api/me/predictions/:matchId` — body `{ homeGoals, awayGoals }`. Rejects when `now ≥ match.kickoffUtc`, when match isn't open (knockout w/ unresolved teams), or on invalid score.
- `PUT /api/me/champion` — body `{ teamId }`. Rejects when `now ≥ FIRST_KICKOFF_UTC` or teamId is unknown.
- Tests: open match success; locked match 403; unknown match 404; out-of-range score 400; champion lock window.

### A6 — Predictions visibility
- `GET /api/games/:id/predictions/:matchId` — only after `now ≥ match.kickoffUtc`; otherwise 403. Returns each player's pick plus the actual result if recorded.
- Tests: pre/post kickoff visibility.

### A7 — Leaderboard
- `GET /api/games/:id/leaderboard` — loads players, predictions, results; calls `computeLeaderboard`; returns sorted rows.
- Test: integration test with a seeded game, 3 players, 5 results.

### A8 — Admin routes
- `POST /api/admin/login` — body `{ password }`; verifies against `ADMIN_PASSWORD_HASH`; sets `admin_session`. Rate-limited.
- `POST /api/admin/logout`.
- `GET /api/admin/whoami` — 200 if the `admin_session` is valid, else 401 (used by the admin UI to detect login state).
- `POST /api/admin/games` — `{ name, password }` → creates a game.
- `DELETE /api/admin/games/:id` — removes a game and its players + predictions (global `match_results` are kept).
- `GET /api/admin/games/:id/players` — lists a game's players (for the admin Players tab).
- `PUT /api/admin/results/:matchId` — `{ homeGoals, awayGoals }`. Persists to `match_results`.
- `DELETE /api/admin/players/:id`.
- Tests: each route's success + auth-failure + validation paths.

### A9 — Error envelope + rate limiting
- All errors returned as `{ error: { code, message } }` with codes from the minimal taxonomy (UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION, RATE_LIMITED, INTERNAL).
- Cloudflare rate-limit rules attached to `/api/games/:id/enter` and `/api/admin/login`.

## Frontend (F)

### F1 — App shell + routing
- `main.tsx` mounts `<App />` with `BrowserRouter`.
- Routes: `/`, `/game/:gameId`, `/game/:gameId/groups`, `/game/:gameId/knockouts`, `/game/:gameId/leaderboard`, `/game/:gameId/match/:matchId`, `/admin`.
- The game layout checks `/api/me` on mount and redirects to `/` on 401.
- `app.css` with desktop-first layout (960px container, 1 breakpoint at 640px).

### F2 — API client
- `api-client.ts` — a single typed wrapper over `fetch` with one method per endpoint (`listGames`, `enterGame`, `me`, `savePrediction`, `saveChampion`, `leaderboard`, `adminLogin`, `adminCreateGame`, `adminSetResult`, …). Throws an `ApiError` (carrying `code` + `message`) on non-2xx.

### F3 — Game entry screen (`/`)
- Form: game dropdown, password, display name. Submit → `POST /api/games/:id/enter` → redirect to `/game/:gameId`.
- Inline error display from server `error.message`.

### F4 — Game home (`/game/:gameId`)
- Header: tabs, current player, "Switch game" link.
- "My picks" tab: pinned champion banner, then one phase at a time with ◀ ▶ navigation (defaults to the current phase via `currentPhaseIndex`). Matches are laid out in per-day cards; each row shows an open/locked badge, the group/slot label, both sides, score inputs, and a Save button.
- Save per row (button + "Saved ✓" indicator). Matches whose kickoff has passed render read-only.

### F5 — Groups view (`/game/:gameId/groups`)
- 12 group cards in a responsive grid (3×4 desktop, 1-col mobile).
- Each card: group letter, its 4 teams, and the group's 6 matches (read-only overview; predictions are made on the My picks tab).

### F6 — Knockouts view (`/game/:gameId/knockouts`)
- Vertical list grouped by phase. Each row: resolved teams or feeder description, kickoff time, open/locked badge, link to match detail.

### F7 — Match detail (`/game/:gameId/match/:matchId`)
- Pre-kickoff: my prediction editable + actual result placeholder.
- Post-kickoff: my prediction (read-only), actual result, table of all players' predictions with points earned.

### F8 — Leaderboard (`/game/:gameId/leaderboard`)
- Sortable-looking table (no actual sort — server sorts). Columns: rank, name, points, exact count, correct-outcome count.

### F9 — Admin UI (`/admin`)
- Login form. After login: tabs Games / Results / Players.
- Games: list + "new game" form.
- Results: filter by phase, score inputs per match, save updates `/api/admin/results/:matchId`.
- Players: list per game with delete button.

### F10 — UI polish
- Loading skeletons for loads over ~300ms.
- Toast component for transient success/error feedback (used by the admin actions).
- Color-coded outcome badges on match detail (exact / outcome+GD / outcome / GD-only / miss).
- Numeric `inputmode` on score inputs.

## Deployment (X)

### X1 — Local secrets
- `.dev.vars` (gitignored) holds `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `DEPLOY_ORIGIN`, and `DEPLOYMENT_STAGE=TEST` (local/test only — enables the test clock endpoint; never set in production).
- `scripts/hash-admin-password.ts` reads a password on stdin and prints the `salt:hash` string for `ADMIN_PASSWORD_HASH`.

### X2 — Cloudflare setup
- `wrangler d1 create football-pool` (one-time).
- `wrangler d1 migrations apply football-pool --remote` after each migration commit.
- `wrangler secret put SESSION_SECRET`, `wrangler secret put ADMIN_PASSWORD_HASH`, `wrangler secret put DEPLOY_ORIGIN`.
- Cloudflare Pages project linked to the repo; build command `npm run build`; output dir `dist/`.
- Pages Functions route `/api/*` → the Worker.

### X3 — Deploy verification
- `npm run deploy` triggers `wrangler deploy` for the Worker and Pages build.
- Smoke test: hit `/api/tournament` and check it returns 104 matches.
- Smoke test: admin login + create a game + enter a result + read the leaderboard.

## Test Scenarios

Two parts. **API integration (curl)** documents the no-browser smoke sweep of the HTTP contract — quick to run, exercises the full Hono → repo → SQLite chain. **End-to-End Scenarios** are the deeper artifact — each is written as preconditions → steps → expected outcome and serves as the specification the Playwright specs implement against. (Unit-test coverage is enforced by the gate in § Verification and lives in the test files themselves — not re-listed here.)

### API integration (curl)

Real `wrangler dev` (port 8787) + local D1 (`.wrangler/state/v3/d1`). Exercises the full Hono → repo → SQLite chain without a browser — a fast smoke sweep of the wire contract.

Documented happy-path sweep — 21 steps:

1. `GET /api/tournament` returns the teams payload.
2. `GET /api/games` empty.
3. `POST /api/admin/login` correct password → cookie.
4. `POST /api/admin/login` wrong password → 401 `UNAUTHENTICATED`.
5. `POST /api/admin/games` creates a game.
6. `GET /api/games` now shows it.
7. Enter game with wrong password → 401.
8. Enter as Alice with correct password → player created, cookie issued.
9. `GET /api/me` returns Alice + empty predictions.
10. `PUT /api/me/predictions/G_A_1` saves 2-1.
11. `PUT /api/me/champion` saves MEX.
12. `GET /api/me` reflects both writes.
13. `PUT /api/admin/results/G_A_1` records 2-1.
14. `GET /api/games/1/leaderboard` shows Alice with 7 pts.
15. Add Bob, prediction 4-1.
16. Leaderboard now Alice 7, Bob 3 (correct outcome only).
17. `GET /api/games/1/predictions/G_A_1` → 403 pre-kickoff (current date is before any FIFA 2026 match).
18. `/api/me` without cookie → 401.
19. `PUT /api/me/predictions/M104` (final, far future) → 200.
20. Logout, then `/api/me` → 401.
21. Admin result with negative score → 400 `VALIDATION`.

### End-to-End Scenarios (Playwright basis)

Real Firefox; `playwright.config.ts` auto-spawns `wrangler dev` + `vite dev`. Specs live in `tst/e2e/`. Each scenario has a stable id (`E1`…) that maps to a task in `tasks.md` and names the spec that implements it. (Implementation status is tracked in `tasks.md`, not here.)

Conventions for all scenarios:
- A fresh game name per run keeps runs idempotent against the persisted local D1; each spec deletes the games it created in `afterEach`.
- Clock-dependent scenarios set the server clock at runtime via `POST /api/admin/test/clock` (enabled by `DEPLOYMENT_STAGE=TEST`); the browser clock, where it matters, is driven by Playwright's `page.clock`.
- "Admin" and "Player" act in separate browser contexts (separate cookie jars).

---

**E1 — Happy path: predict → result → leaderboard** (`happy-path.spec.ts`)

| | |
|---|---|
| Preconditions | Empty DB; admin password configured. |
| Steps | 1. Admin opens `/admin`, enters admin password, clicks Log in. 2. In Games tab, enters name + game password, clicks Create. 3. Player (new context) opens `/`, selects the game, enters game password + "Alice", clicks Enter. 4. On My picks, fills the Mexico vs South Africa row 2-1, clicks Save. 5. Admin opens Results tab, finds G_A_1, fills 2-1, clicks Save. 6. Player opens Leaderboard tab. |
| Expected | Admin panel renders only after login (not before). New game appears in the list and in the player dropdown. Player routes to `/game/:id`. Save button shows "Saved". Leaderboard shows Alice with **7 points** (exact). |

**E2 — Prediction locks at kickoff** (`lock.spec.ts`)

| | |
|---|---|
| Preconditions | Game exists; player Alice logged in; the server clock is fixed at G_A_1 kickoff − 5 min. |
| Steps | 1. Alice saves a 2-1 prediction on G_A_1 → "Saved". 2. The server clock is moved to G_A_1 kickoff + 1 ms. 3. Alice changes the score and clicks Save. |
| Expected | Step 3 → server responds **403**; the row shows an error message instructing the user to refresh. A direct re-attempt to save still returns 403 (server enforces independent of client state). |

**E2b — Champion pick locks at first kickoff** (folded into `lock.spec.ts`)

| | |
|---|---|
| Preconditions | Player logged in. |
| Steps | 1. With the server clock before first kickoff, player picks a champion, saves → success. 2. With the server clock after first kickoff, player attempts to change champion. |
| Expected | Step 1 succeeds (confirmed via `GET /api/me`). Step 2 → **403**; the banner shows the refresh message and the change is rejected. |

**E3 — Champion bonus after the final** (`champion-bonus.spec.ts`)

| | |
|---|---|
| Preconditions | Game with players Alice + Bob; server clock at its real-time default (today is before the first kickoff, so champion picks are open). |
| Steps | 1. Alice picks the champion that the scripted results will crown; Bob picks a different team. 2. Admin records a full, decisive set of results that resolves the bracket through M104 with Alice's pick winning. 3. Players open the Leaderboard. |
| Expected | Alice's total includes **+20** for the champion bonus; Bob, who picked a different champion, gets no bonus. (Result recording and leaderboard scoring are not clock-gated, so no post-final clock change is needed.) |

**E4a — Groups tab renders** (`ui-surfaces.spec.ts`)

| | |
|---|---|
| Preconditions | Player logged in. |
| Steps | Open the Groups tab. |
| Expected | 12 group cards (A–L), each listing its 4 teams and its group fixtures. |

**E4b — Knockouts tab renders** (`ui-surfaces.spec.ts`)

| | |
|---|---|
| Preconditions | Player logged in. |
| Steps | Open the Knockouts tab. |
| Expected | Each knockout phase (R32 → Final) listed; unresolved slots show descriptive labels (e.g., "Winner of Group A", "Best 3rd from A/B/C/D/F"); open/locked badge per match. |

**E4c — Match detail visibility (pre / post kickoff)** (`ui-surfaces.spec.ts`)

| | |
|---|---|
| Preconditions | Game with Alice + Bob, both having predicted G_A_1. |
| Steps | 1. With the clock before kickoff, open the G_A_1 detail page. 2. Move the server and browser clocks past kickoff; reload the detail page. |
| Expected | Step 1 → only "visible after kickoff" message; no other players' picks shown. Step 2 → table of all players' predictions + the recorded result. |

**E4d — Switch game** (`ui-surfaces.spec.ts`)

| | |
|---|---|
| Preconditions | Player logged into game X. |
| Steps | Click "Switch game" in the header. |
| Expected | Session cookie cleared; routed back to `/`; `/api/me` would now 401. |

**E5 — Auth rejections** (`auth.spec.ts`)

| | |
|---|---|
| Preconditions | A game exists. |
| Steps | 1. On `/admin`, submit a wrong admin password. 2. On `/`, select the game and submit a wrong game password. |
| Expected | Step 1 → error shown, admin panel not rendered. Step 2 → error shown, no navigation to `/game/:id`. |

**E6 — Admin manages players** (`admin-players.spec.ts`)

| | |
|---|---|
| Preconditions | A game with two players (Alice + Bob). |
| Steps | 1. Admin opens the Players tab and selects the game. 2. Admin clicks Delete on Bob. |
| Expected | Both players are listed; after the delete, Bob is gone and Alice remains. |

## Verification

1. `npm run typecheck` — clean.
2. `npm run lint` — clean.
3. `npm run test` — all green.
4. `npm run test:coverage` — ≥ 90% line and ≥ 90% branch on `shared/`, `api/`, `data/` (UI rendering excluded per conventions). Any file below threshold listed and triaged.
5. `npm run build` — successful production build.
6. `npx playwright test` — browser E2E scenarios (E1–E5) green.
7. `wrangler dev` + Vite dev server — optional manual smoke test: create a game (admin), enter as player, save a prediction, lock at kickoff, enter a result, see leaderboard update.

## Implementation Order

```
B1 → B2 → B3 → B4 → B5
                    │
                    ▼
                    D1 → D2 → D3
                         │
                         ▼
                         S1 → S2 ──┐
                                   │  parallel
                         K1 → K2 ──┘
                              │
                              ▼
                              M1 → M2 → M3
                                        │
                                        ▼
                                        A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9
                                                                            │
                                                                            ▼
                                                                            F1 → F2 → (F3..F9 parallel) → F10
                                                                                                            │
                                                                                                            ▼
                                                                                                            X1 → X2 → X3
```

Parallelization notes:
- S and K can be developed concurrently after D is done — they share types but not code.
- Frontend screens F3..F9 can be parallelized once F1+F2 are in place.
- M3 repo tests run while you're writing A1..A2.
