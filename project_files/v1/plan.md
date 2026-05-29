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
- Static tournament data (teams, groups, fixtures) lives in TypeScript; D1 holds only mutable state.
- Scoring is a pure module reused by client (for preview hints) and Worker (for the leaderboard).
- Knockout fixtures carry placeholder team labels; the admin fills in the actual teams (by editing `data/tournament.ts`) once each round's pairings are known. There is no automatic standings/tiebreaker computation — the admin records reality, which keeps FIFA's head-to-head / fair-play / drawing-of-lots rules out of the codebase.
- Time-dependent behavior (locks, visibility) reads an injectable clock provider so it is deterministic in tests and controllable from the admin UI in a test deployment.

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
│   ├── components/       Reusable UI (Skeleton, Toast, Flag/TeamSide)
│   ├── lib/              Display helpers (matchSides)
│   ├── routes/
│   └── styles/app.css
├── api/                  Worker
│   ├── index.ts          Worker entry (exports the built app)
│   ├── app.ts            Hono app + route registration + clock wiring + test-clock endpoint
│   ├── clock.ts          ClockProvider (wall clock / fixed)
│   ├── middleware.ts     Auth + origin checks
│   ├── crypto.ts         PBKDF2 hashing + HMAC cookie sign/verify
│   ├── routes/
│   └── repos/            D1 access
├── shared/               Imported by both src/ and api/
│   ├── scoring.ts
│   ├── phases.ts         Phase entities (order, multiplier, label, stage) + match predicates
│   ├── types.ts
│   └── time.ts           Viewer-local kickoff formatting
├── data/
│   ├── tournament.ts     Teams, groups, fixtures
│   └── flags.ts          Team → flag emoji
├── migrations/
│   └── 0001_init.sql
├── tst/                  Tests mirroring source layout
│   ├── shared/
│   ├── api/
│   ├── data/
│   ├── src/
│   └── e2e/             Playwright specs + helpers
└── project_files/
    └── v1/
        ├── plan.md
        └── tasks.md
```

## Bootstrap (B)

### B1 — package.json + toolchain
- Init `package.json` with scripts: `dev`, `dev:worker`, `build`, `test`, `test:coverage`, `test:e2e`, `lint`, `typecheck`, `check`, `deploy`, `deploy:pages`, `release`.
- Dependencies: `react`, `react-dom`, `react-router-dom`, `hono`.
- Dev deps: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `wrangler`, `better-sqlite3` (for test fixtures), `eslint`, `typescript-eslint`, `prettier`.
- Single root `tsconfig.json` (strict, ES2022, DOM + `@cloudflare/workers-types`), with path aliases `@/`, `@shared/`, `@data/`, `@api/`.

### B2 — Vite + dev server
- `vite.config.ts` with React plugin and the path aliases.
- Dev server proxies `/api/*` → `http://localhost:8787` (wrangler dev port).

### B3 — Wrangler + D1
- `wrangler.toml` defining the Worker name, compatibility date, `[[d1_databases]]` binding `DB`, and assets binding for the built SPA.
- `wrangler d1 create football-pool` produces a database ID; record it in `wrangler.toml`.
- Worker entrypoint at `api/index.ts` exporting `default { fetch }`.

### B4 — Lint, format, typecheck
- ESLint flat config (`typescript-eslint` recommended), with rule: no `any` without an inline justification comment.
- Prettier defaults.
- `tsc --noEmit` runs on every CI / pre-commit.

### B5 — Test runner
- Vitest with two projects: `node` (`tst/shared`, `tst/api`, `tst/data`) and `jsdom`/browser (`tst/src`).
- Coverage via `@vitest/coverage-v8`. Exclusions per `~/.claude/skills/.conventions/javascript.md`: entry points, view rendering (`src/`), logging.
- Test file convention: `tst/<mirror>/<name>.test.ts`.

## Static Tournament Data (D)

### D1 — Type model in `shared/types.ts`
- `PhaseId = 'GROUP_R1' | 'GROUP_R2' | 'GROUP_R3' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL'` — group rounds are first-class phases.
- `Stage = 'GROUP' | 'KNOCKOUT'` — the single source of the group/knockout distinction. Per-phase metadata (label, multiplier, stage, order) lives on the `Phase` entity in `shared/phases.ts`.
- `TeamId`, `MatchId` as string types.
- `Team = { id: TeamId; name: string; group: GroupLetter }`.
- `Match = { id; phase: PhaseId; kickoffUtc; homeTeamId: TeamId; awayTeamId: TeamId; group?: GroupLetter }` — one shape for every fixture. Group matches reference real teams; knockout matches start with placeholder team labels (e.g. `"Winner of Group A"`) until the admin fills in real ids. `isGroupMatch` / `isKnockoutMatch` (in `phases.ts`) classify by the phase's stage.
- `Score = { home: number; away: number }`.
- `LeaderboardRow = { playerId; displayName; totalPoints; exactScoreCount; correctOutcomeCount; correctGoalDiffCount }`.

### D2 — `data/tournament.ts`
- Export `TEAMS: Team[]` — all 48 qualified teams (12 groups × 4).
- Export `MATCHES: Match[]` — 72 group matches + 32 knockout matches (16 R32 + 8 R16 + 4 QF + 2 SF + 1 3rd-place + 1 final) = **104 matches**.
- Group matches reference real team ids. Knockout matches seed placeholder labels describing the bracket: `"Winner of Group A"`, `"Runner-up of Group B"`, `"Best 3rd from A/B/C/D/F"`, `"Winner of M74"`, `"Loser of M101"`. Replacing a placeholder with a real team id (and redeploying) is how a round is resolved.
- Each match has a stable string id (`G_A_1`, …, `M73`, …, `M104`) and a UTC kickoff timestamp (ISO 8601).
- Export `FIRST_KICKOFF_UTC` derived as the earliest kickoff.

### D3 — `data/flags.ts`
- Map each team's FIFA code to its flag emoji. FIFA's 3-letter codes are not ISO 3166-1 alpha-2, so the module maps each team to its alpha-2 code and derives the regional-indicator emoji; England and Scotland use subdivision tag-sequence flags. `flagEmoji(teamId)` returns the emoji (empty string for an unknown id, e.g. a knockout placeholder).

### D4 — Data validation tests
- Every match id is unique; there are 104 matches with the expected per-phase counts.
- Each group has exactly 4 teams; each team plays exactly 3 group matches; group matches reference teams from their own group.
- Every knockout match has two distinct, non-empty side labels; feeder placeholders (`"Winner/Loser of Mxx"`) reference an existing match id.
- Kickoff timestamps are valid ISO 8601 UTC; `FIRST_KICKOFF_UTC` equals the earliest.
- Every team resolves to a non-empty flag.

## Scoring Engine (S)

### S1 — `shared/scoring.ts`
- Phase multipliers live on the `Phase` entity (`shared/phases.ts`): group rounds ×1, R32 ×2, R16 ×3, QF ×4, SF ×5, 3rd-place ×5, Final ×6. `CHAMPION_BONUS = 100` is defined here.
- `scoreMatch(prediction, actual): number` — pure, returns 0/2/3/5/7.
- `scoreMatchWeighted(prediction, actual, phase): number` — multiplies by `phaseById(phase).multiplier`.
- `computeLeaderboard(players, predictions, results, matchesById, actualChampionTeamId)` — returns sorted `LeaderboardRow[]` with `totalPoints`, `exactScoreCount`, `correctOutcomeCount`, and `correctGoalDiffCount` (predictions whose absolute goal difference matched).
- `determineChampion(finalMatchTeams, finalScore)` — returns the winning `TeamId` of the Final (or undefined for a draw / missing input).

### S2 — Scoring tests (TDD-first)
- `scoreMatch` table cases: exact, outcome+GD, outcome only, GD-only-wrong-team, nothing right, draws, 0-0 exact.
- `scoreMatchWeighted`: each phase × exact-score case.
- `computeLeaderboard`: ordering + tiebreakers (exact → outcome → name, case-insensitive); independent tracking of exact / outcome / goal-diff counts; champion bonus applied only when the actual champion matches the player's pick.
- `determineChampion`: home/away winner, draw → undefined.

## Knockout Teams & Prediction Locking (K)

### K1 — Manual knockout resolution
- Knockout teams are resolved by editing the placeholder labels in `data/tournament.ts` to real team ids as each round's pairings become known, then redeploying. No standings or tiebreaker code is maintained.

### K2 — `hasResolvedTeams(match, teams)` in `shared/phases.ts`
- True when both `homeTeamId` and `awayTeamId` reference real teams. Group matches are always resolved; a knockout becomes resolved once filled in.
- Predictions are accepted only for resolved matches: the prediction route returns 403 otherwise, and the My picks UI renders the match as a read-only "TBD" row.

### K3 — Champion bonus
- The leaderboard reads the Final (`M104`) match's teams and recorded score via `determineChampion`, and awards `CHAMPION_BONUS` to players whose champion pick matches the winner.

### K4 — Tests
- `hasResolvedTeams`: group match → true; knockout placeholder → false; knockout with real ids → true; one side real → false.
- Prediction route: a placeholder knockout → 403; a resolved match before kickoff → 200.

## D1 Schema (M)

### M1 — `migrations/0001_init.sql`
- Tables `games`, `players`, `predictions`, `match_results`.
- `players` carries a `password_hash` (each player sets their own password on first join) and `UNIQUE(game_id, display_name) COLLATE NOCASE`.
- Indexes: `predictions(match_id)`; game name unique `COLLATE NOCASE`. Foreign keys cascade players + predictions when a game is deleted.

### M2 — Repository layer in `api/repos/`
- `gamesRepo`: `findById`, `findByName`, `listAll`, `create({ name, passwordHash })`, `delete`.
- `playersRepo`: `create({ gameId, displayName, passwordHash })`, `findByName(gameId, displayName)` (returns the player + its stored hash, for login), `findById`, `listByGame`, `setChampionTeamId`, `delete`.
- `predictionsRepo`: `upsert({ playerId, matchId, score })`, `findByPlayer`, `findByMatch`, `findAllForGame`.
- `resultsRepo`: `upsert({ matchId, score })`, `findAll`, `findById`.
- Repos take a `D1Database` argument. Tests use in-memory `better-sqlite3` with the same SQL.

### M3 — Repo tests
- For each repo: empty, single insert, duplicate (constraint), boundary, case-insensitive lookup, cascade delete. `findById`/`listByGame` never expose the player password hash.

## Worker API (A)

### A1 — `api/crypto.ts`
- `hashPassword` — PBKDF2-SHA256 with a random salt; returns a combined `salt:hash` string (used for game, admin, and per-player passwords).
- `verifyPassword` — constant-time comparison.
- `signCookie` / `verifyCookie(token, secret, nowMs?)` — HMAC-SHA256 with `SESSION_SECRET`; expiry checked against the injected clock.

### A2 — Middleware
- `requirePlayer` / `requireAdmin` validate the respective HMAC cookie and attach context (401 otherwise).
- `requireOrigin` rejects writes whose `Origin` ≠ the deploy origin.
- Cookie expiry is checked against `c.var.clock()`.

### A3 — Public + tournament routes
- `GET /api/games` — `[{ id, name }]`.
- `GET /api/tournament` — projects `data/tournament.ts` to wire shape.

### A4 — Player auth routes
- `POST /api/games/:id/enter` — body `{ displayName, playerPassword, gamePassword? }`. If the display name is new in the game → **signup**: verify the shared game password, then store the chosen player password. If it already exists → **login**: verify the player password only (the game password is the join gate, not re-asked on return). Either path sets the long-lived `player_session` cookie.
- `POST /api/auth/logout` — clears the cookie.
- `GET /api/me` — current player, their predictions, champion pick, and `nowMs` (the server clock, so the UI locks against authoritative time).

### A5 — Prediction routes
- `PUT /api/me/predictions/:matchId` — body `{ homeGoals, awayGoals }`. Rejected (403) when the match's teams are unresolved (`hasResolvedTeams` false) or when `now ≥ match.kickoffUtc`; 400 on invalid score; 404 unknown match.
- `PUT /api/me/champion` — body `{ teamId }`. Rejected when `now ≥ FIRST_KICKOFF_UTC` or the team id is unknown.

### A6 — Predictions visibility
- `GET /api/games/:id/predictions/:matchId` — only after `now ≥ match.kickoffUtc`; returns each player's pick plus the recorded result.

### A7 — Leaderboard
- `GET /api/games/:id/leaderboard` — loads players, predictions, results; computes the champion from the Final; returns sorted rows.

### A8 — Admin routes
- `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/whoami` (`{ admin: true }` when authenticated).
- `POST /api/admin/games` — creates a game.
- `DELETE /api/admin/games/:id` — removes a game and its players + predictions (global `match_results` are kept).
- `GET /api/admin/games/:id/players` — lists a game's players.
- `DELETE /api/admin/players/:id`.
- `PUT /api/admin/results/:matchId` — records a 90-minute score into `match_results`.
- `GET /api/admin/results` — every recorded result (the Results tab pre-fills its inputs from this).

### A9 — Test clock control (`api/app.ts`)
- `POST /api/admin/test/clock` — body `{ mode: 'REALTIME' }` or `{ mode: 'FIXED', iso }`; swaps the active clock at runtime.
- `GET /api/admin/test/clock` — reports the active mode/iso so the admin UI reflects it on reload.
- Both are gated by `requireAdmin` **and** `DEPLOYMENT_STAGE === 'TEST'`, so they are permanently 403 in production.

### A10 — Error envelope + rate limiting
- All errors returned as `{ error: { code, message } }` with codes UNAUTHENTICATED / FORBIDDEN / NOT_FOUND / VALIDATION / RATE_LIMITED / INTERNAL.
- Cloudflare rate-limit rules attached to the enter + admin-login routes at deploy time.

## Display Time (T)

- `shared/time.ts` formats kickoffs in the **viewer's** own browser locale and time zone, so friends in different regions each see their local wall-clock. The formatters accept an optional `{ locale, timeZone }` override so tests pin a zone for deterministic assertions.

## Frontend (F)

### F1 — App shell + routing
- Routes: `/`, `/game/:gameId` (+ `/groups`, `/knockouts`, `/leaderboard`, `/match/:matchId`), `/admin`.
- The game layout loads `/api/me` + `/api/tournament` on mount, redirects to `/` on 401, and exposes `{ me, tournament, refresh }` via outlet context. Desktop-first `app.css` (960px container, 640px breakpoint).

### F2 — API client
- `api-client.ts` — one typed method per endpoint; throws `ApiError` (carrying `code` + `message`) on non-2xx.

### F3 — Game entry screen (`/`)
- A valid `player_session` cookie surfaces a "Continue as <name>" resume card (one tap, no typing).
- Form: game dropdown, display name, your password, and a game password (needed only the first time you join). Submit → enter the game.

### F4 — Game home (`/game/:gameId`)
- "My picks": pinned champion banner, then one phase at a time with ◀ ▶ navigation (defaults to the current phase via the server clock). Matches in per-day cards; team names show flags. Each row is **open** (editable inputs + Save), **locked** (read-only, kickoff passed), or **TBD** (a knockout whose teams aren't assigned yet). Open/locked is decided against the server clock (`me.nowMs`); saving refreshes the session so picks persist across navigation. Unsaved scores render empty (a blank is not 0-0) and both are required to save.

### F5 — Groups view (`/game/:gameId/groups`)
- 12 group cards (3×4 desktop, 1-col mobile): group letter, its 4 teams (with flags), and its fixtures.

### F6 — Knockouts view (`/game/:gameId/knockouts`)
- List grouped by phase. Each row shows the two sides (real teams with flags once resolved, otherwise the placeholder label), kickoff time, and an open/locked badge.

### F7 — Match detail (`/game/:gameId/match/:matchId`)
- Header shows the two sides (teams + flags). Pre-kickoff: a "visible after kickoff" notice. Post-kickoff: the recorded result and a table of all players' predictions with color-coded outcome badges.

### F8 — Leaderboard (`/game/:gameId/leaderboard`)
- A scoring-rules blurb (point values, phase multipliers, and the champion bonus — all read from the scoring constants so they can't drift) above the table.
- Table columns: Rank, Player, Points, Exact Predictions, Right Outcome, Right Goal Diff (server sorts).

### F9 — Admin UI (`/admin`)
- Login form. After login: a Test clock control (Real time / Fixed time with a date-time picker; disabled with a note in a production build) and tabs Games / Results / Players.
- Games: list + "new game" form.
- Results: filter by phase; inputs pre-filled from recorded results (empty when none); both scores required to save.
- Players: list per game with delete.

### F10 — UI polish
- Loading skeletons for loads over ~300ms; toasts for transient success/error; color-coded outcome badges; numeric `inputmode` on score inputs; country flags beside team names.

## Deployment (X)

### X1 — Local secrets
- `.dev.vars` (gitignored) holds `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `DEPLOY_ORIGIN`, and `DEPLOYMENT_STAGE=TEST` (local/test only — enables the test clock endpoint; never set in production).
- `scripts/hash-admin-password.ts` reads a password on stdin and prints the `salt:hash` string for `ADMIN_PASSWORD_HASH`.

### X2 — Cloudflare setup
- `wrangler d1 create football-pool` (one-time); `wrangler d1 migrations apply football-pool --remote` per migration.
- `wrangler secret put` for `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `DEPLOY_ORIGIN`.
- Cloudflare Pages project linked; build `npm run build`, output `dist/`; `/api/*` routed to the Worker.

### X3 — Deploy verification
- `npm run release` runs the full `check` (typecheck + lint + coverage + build) then deploys the Worker and Pages.
- Smoke: `GET /api/tournament` returns 104 matches; admin login → create a game → enter a result → read the leaderboard.

## Test Scenarios

Two parts. **API integration (curl)** documents a no-browser smoke sweep of the HTTP contract. **End-to-End Scenarios** are the deeper artifact — each is preconditions → steps → expected, and serves as the specification the Playwright specs implement against. (Unit coverage is enforced by the gate in § Verification and lives in the test files.)

### API integration (curl)

Real `wrangler dev` (port 8787) + local D1. Exercises the full Hono → repo → SQLite chain without a browser.

1. `GET /api/tournament` returns the teams payload.
2. `GET /api/games` empty.
3. `POST /api/admin/login` correct password → cookie.
4. `POST /api/admin/login` wrong password → 401 `UNAUTHENTICATED`.
5. `POST /api/admin/games` creates a game.
6. `GET /api/games` now shows it.
7. Signup with a wrong game password → 401.
8. Signup as Alice (correct game password + a chosen player password) → player created, cookie issued.
9. Re-enter as Alice with just the player password (no game password) → 200, same player.
10. `GET /api/me` returns Alice + empty predictions + `nowMs`.
11. `PUT /api/me/predictions/G_A_1` saves 2-1 (future group match).
12. `PUT /api/me/champion` saves MEX.
13. `PUT /api/admin/results/G_A_1` records 2-1; `GET /api/admin/results` lists it.
14. `GET /api/games/1/leaderboard` shows Alice with 7 pts.
15. Add Bob, prediction 4-1 → leaderboard Alice 7, Bob 3 (correct outcome only).
16. `GET /api/games/1/predictions/G_A_1` → 403 pre-kickoff (today is before any FIFA 2026 match).
17. `PUT /api/me/predictions/M73` (knockout whose teams aren't assigned) → 403 `FORBIDDEN`.
18. `/api/me` without cookie → 401.
19. Logout, then `/api/me` → 401.
20. Admin result with a negative score → 400 `VALIDATION`.

### End-to-End Scenarios (Playwright basis)

Real Firefox; `playwright.config.ts` auto-spawns `wrangler dev` + `vite dev`. Specs live in `tst/e2e/`. Each scenario has a stable id (`E1`…) that maps to a task in `tasks.md` and names the spec that implements it.

Conventions:
- A fresh game name per run keeps runs idempotent against the persisted local D1; each spec deletes the games it created in `afterEach`.
- Clock-dependent scenarios set the server clock at runtime via `POST /api/admin/test/clock` (enabled by `DEPLOYMENT_STAGE=TEST`); the browser clock, where it matters, is driven by Playwright's `page.clock` / context `timezoneId`.
- "Admin" and "Player" act in separate browser contexts.

---

**E1 — Happy path: predict → result → leaderboard** (`happy-path.spec.ts`)

| | |
|---|---|
| Preconditions | Admin password configured. |
| Steps | Admin logs in and creates a game. Player enters (signup: name + player password + game password), saves a 2-1 prediction on G_A_1. Admin records 2-1. Player opens Leaderboard. |
| Expected | Admin panel renders only after login. The game appears in the player dropdown. Save shows "Saved". Leaderboard shows Alice with **7 points**. |

**E2 — Prediction locks at kickoff** (`lock.spec.ts`)

| | |
|---|---|
| Preconditions | Game exists; Alice logged in; server clock fixed just before G_A_1 kickoff. |
| Steps | Alice saves a prediction (succeeds). Server clock moves just past kickoff. Alice edits and re-saves on the stale page; then the page is reloaded. |
| Expected | The stale save → **403** + a refresh hint in the row; a direct retry also 403s. After reload, G_A_1 is a read-only locked row (no editable input, "locked" badge). |

**E2b — Champion pick locks at first kickoff** (folded into `lock.spec.ts`)

| | |
|---|---|
| Preconditions | Player logged in. |
| Steps | Before first kickoff, pick a champion (succeeds). After first kickoff, attempt to change it. |
| Expected | First save confirmed via `GET /api/me`; the second → **403** with a refresh message. |

**E4a — Groups tab renders** (`ui-surfaces.spec.ts`) — 12 group cards (A–L), each with 4 teams and its fixtures.

**E4b — Knockouts tab renders** (`ui-surfaces.spec.ts`) — every knockout phase listed; unresolved sides show their placeholder labels (e.g. "Winner of Group A", "Best 3rd from A/B/C/D/F"); open/locked badge per match.

**E4c — Match detail visibility** (`ui-surfaces.spec.ts`) — before kickoff only a "visible after kickoff" notice; after kickoff, the full predictions table + recorded result.

**E4d — Switch game** (`ui-surfaces.spec.ts`) — "Switch game" clears the session and routes back to `/`; `/api/me` then 401s.

**E5 — Auth rejections** (`auth.spec.ts`) — wrong admin password → error, panel hidden; wrong game password on signup → error, no navigation.

**E6 — Admin manages players** (`admin-players.spec.ts`) — Players tab lists a game's players; deleting one removes it.

**E7 — Viewer-local kickoff times** (`timezone.spec.ts`) — the same match rendered under context `timezoneId` Los Angeles vs Tokyo shows a different clock label and calendar day.

**E8 — Per-player auth** (`player-auth.spec.ts`) — after signup, the landing page offers a one-tap resume; a new context logs in with just the player password; an attacker who knows only the shared game password cannot log in as an existing player.

**E9 — Prediction inputs** (`predictions-ui.spec.ts`) — unsaved matches show empty score boxes (blank ≠ 0-0) and a save is blocked until both are filled.

**E10 — Unresolved knockout lock** (`predictions-ui.spec.ts`) — a placeholder R32 match shows a read-only "TBD" row with no inputs, and a direct save is rejected (403).

## Verification

1. `npm run typecheck` — clean.
2. `npm run lint` — clean.
3. `npm run test` — all green.
4. `npm run test:coverage` — ≥ 90% line and ≥ 90% branch on `shared/`, `api/`, `data/` (UI rendering excluded per conventions). Any file below threshold listed and triaged.
5. `npm run build` — successful production build.
6. `npx playwright test` — browser E2E scenarios (E1–E10) green.
7. `wrangler dev` + Vite dev server — manual smoke: create a game, enter as a player, save a prediction, drive the test clock past kickoff to see the lock, enter a result, read the leaderboard.

## Implementation Order

```
B1 → B2 → B3 → B4 → B5
                    │
                    ▼
                    D1 → D2 → D3 → D4
                              │
                              ▼
                              S1 → S2 ──┐
                                        │  parallel
                              K1..K4 ───┘
                                   │
                                   ▼
                                   M1 → M2 → M3
                                             │
                                             ▼
                                             A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10
                                                                                       │
                                                                                       ▼
                                                                          T → F1 → F2 → (F3..F9 parallel) → F10
                                                                                                              │
                                                                                                              ▼
                                                                                                              X1 → X2 → X3
```

Parallelization notes:
- S and K share types but not code; develop concurrently after D.
- Frontend screens F3..F9 parallelize once F1+F2 are in place.
- Repo tests (M3) run while writing A1..A2.
