# v1 Tasks — Football Pool (FIFA 2026)

## Bootstrap

- [x] **B1**: Init `package.json`, install deps, npm scripts, root `tsconfig.json` (single consolidated config; split deferred from plan since `@cloudflare/workers-types` + DOM lib coexist without conflict in our usage)
- [x] **B2**: `vite.config.ts` with React plugin, path aliases, `/api` proxy to wrangler dev
- [x] **B3**: `wrangler.toml` with D1 binding + `nodejs_compat` flag; placeholder `database_id` documented in DEPLOY.md; stub `api/index.ts`
- [x] **B4**: ESLint 9 flat config + Prettier config; `npm run lint` and `npm run typecheck` clean
- [x] **B5**: Vitest 4 config with `node` + `jsdom` projects; coverage exclusions per conventions

## Static Tournament Data

- [x] **D1**: Type model in `shared/types.ts` (Phase, GroupLetter, TeamId, MatchId, Team, BracketSlot incl. KNOCKOUT_LOSER, GroupMatch, KnockoutMatch, Score, Player, Prediction, LeaderboardRow)
- [x] **D2**: `data/tournament.ts` with 48 teams, 12 groups, 72 group matches, 32 knockout matches, `FIRST_KICKOFF_UTC`. Times converted Sky Sports UK BST → UTC by subtracting 1 hour.
- [x] **D3**: Data integrity tests (19 tests covering unique IDs, group composition, slot references, ISO timestamps, FIRST_KICKOFF_UTC correctness)

## Scoring Engine

- [x] **S1**: `shared/scoring.ts` — `scoreMatch`, `scoreMatchWeighted`, `computeLeaderboard`, `determineChampion`, `POINTS` constants, `CHAMPION_BONUS`
- [x] **S2a**: `scoreMatch` table tests (exact, outcome+GD, outcome only, GD-only, none, draws, 0-0)
- [x] **S2b**: `scoreMatchWeighted` × phase tests (parameterised over all phases)
- [x] **S2c**: `computeLeaderboard` ordering + tiebreaker tests (3-way ties broken by exact / outcome / name)
- [x] **S2d**: Champion bonus award/non-award tests + `determineChampion` unit tests

## Bracket Resolution

- [x] **K1**: `shared/bracket.ts` — `groupStandings`, `bestThirds`, `resolveBracket`, internal slot assignment for BEST_THIRD_OF (greedy v1)
- [x] **K2a**: Group standings tests (full, partial, GD tiebreak, GF tiebreak, alphabetical fallback)
- [x] **K2b**: `bestThirds` ranking tests (12 complete groups → 8 entries; partial returns fewer)
- [x] **K2c**: `resolveBracket` tests — R32 with group winner + runner-up; undefined when feeders incomplete; KNOCKOUT_WINNER cascade; KNOCKOUT_LOSER for 3rd-place; feeder draw → undefined; BEST_THIRD_OF home-slot branch
- [x] **K3** *(added)*: Assertion guards — `groupStandings` rejects ≠ 4 teams; `resolveBracket` rejects matches with BEST_THIRD_OF on both sides

## D1 Schema & Repos

- [x] **M1**: `migrations/0001_init.sql` with `games`, `players`, `predictions`, `match_results` + indexes + foreign keys
- [x] **M2a**: `gamesRepo` (create, findById, findByName, listAll)
- [x] **M2b**: `playersRepo` (findOrCreate, findById, listByGame, setChampionTeamId, delete)
- [x] **M2c**: `predictionsRepo` (upsert, findByPlayer, findByMatch, findAllForGame)
- [x] **M2d**: `resultsRepo` (upsert, findById, findAll)
- [x] **M3**: Repo tests using in-memory better-sqlite3 D1 shim (`tst/api/testdb.ts`) — empty, single, duplicate, boundary, case-insensitive, cascade delete

## Worker API

- [x] **A1**: `api/crypto.ts` — PBKDF2 password hashing + HMAC cookie sign/verify with constant-time comparison, tests
- [x] **A2**: Middleware `requirePlayer`, `requireAdmin`, `requireOrigin` with tests
- [x] **A3**: `GET /api/games`, `GET /api/tournament` + tests
- [x] **A4a**: `POST /api/games/:id/enter` (player login) + tests
- [x] **A4b**: `POST /api/auth/logout`, `GET /api/me` + tests
- [x] **A5a**: `PUT /api/me/predictions/:matchId` + lock/validation tests
- [x] **A5b**: `PUT /api/me/champion` + lock tests
- [x] **A6**: `GET /api/games/:id/predictions/:matchId` (pre/post-kickoff visibility) + tests
- [x] **A7**: `GET /api/games/:id/leaderboard` integration test
- [x] **A8a**: `POST /api/admin/login`, `/api/admin/logout`, `GET /api/admin/whoami` + tests (`whoami` added after an E2E run revealed the admin UI was probing the public `/api/tournament` endpoint to detect login state)
- [x] **A8b**: `POST /api/admin/games` + tests
- [x] **A8c**: `PUT /api/admin/results/:matchId` + tests
- [x] **A8d**: `DELETE /api/admin/players/:id` + tests
- [x] **A8e** *(added)*: `DELETE /api/admin/games/:id` + `gamesRepo.delete` — removes a game's players + predictions (global `match_results` untouched); used by E2E cleanup
- [x] **A9**: Standardized error envelope (`{ error: { code, message } }` with codes UNAUTHENTICATED / FORBIDDEN / NOT_FOUND / VALIDATION / RATE_LIMITED / INTERNAL); Cloudflare rate-limit rules **deferred to deploy-time configuration** (documented in DEPLOY.md)

## Clock Injection (supersedes scattered `Date.now()` calls)

- [x] **C1**: `api/clock.ts` — `ClockProvider` type, `WallClockProvider` default, `FixedClockProvider(iso)` factory (throws on invalid ISO)
- [x] **C2**: `buildApp(injectedClock?: ClockProvider)` — uses injected clock when provided, else `WallClockProvider`. Sets `c.var.clock` via app-level middleware; a `requireAdmin` + `DEPLOYMENT_STAGE=TEST`-gated `POST /api/admin/test/clock` swaps the active clock at runtime for E2E lock scenarios
- [x] **C3**: Routes (predictions, leaderboard, auth, admin) read time via `c.var.clock()`; `verifyCookie` accepts an optional `nowMs` and middleware passes `c.var.clock()`
- [x] **C4**: Migrated `predictions-routes`, `admin-routes`, `leaderboard-routes`, `middleware` tests off `vi.useFakeTimers()` to inject `FixedClockProvider` (mutable-closure pattern for mid-test time advancement)
- [x] **C5**: `tst/api/clock.test.ts` — `WallClockProvider`/`FixedClockProvider` unit tests + `POST /api/admin/test/clock` tests (admin + stage gating, mode/ISO validation, and proof the override moves the clock routes observe)

## Display Time Zone

- [x] **T1**: `shared/time.ts` — `formatKickoff(isoUtc)` formats in `America/Los_Angeles` (PDT in summer 2026); unit-tested for both PDT and PST
- [x] **T2**: Replaced `new Date(iso).toLocaleString()` in `MyPicks.tsx`, `Knockouts.tsx`, `MatchDetail.tsx` with `formatKickoff`

## Frontend

- [x] **F1**: App shell, router, `app.css` desktop-first layout (960px container, mobile breakpoint at 640px)
- [x] **F2**: `api-client.ts` — typed API wrapper with `ApiError` for non-2xx responses (replaces per-endpoint hooks — simpler for v1)
- [x] **F3**: Game entry screen (`/`)
- [x] **F4**: Game home / My picks tab (champion banner, upcoming with inputs, past with predictions)
- [x] **F5**: Groups view (12 cards with team rosters and match list)
- [x] **F6**: Knockouts view (list by phase, open/locked badges, slot labels for unresolved teams)
- [x] **F7**: Match detail (pre/post-kickoff modes)
- [x] **F8**: Leaderboard table
- [x] **F9a**: Admin login screen
- [x] **F9b**: Admin Games tab (list + create)
- [x] **F9c**: Admin Results tab (filter by phase + score inputs per match)
- [ ] **F9d**: Admin Players tab (per-game list + delete) — *placeholder text only; delete endpoint exists, UI form not built*
- [ ] **F10**: Loading skeletons, error toast, outcome icons, offline banner — *deferred to polish pass*

## Deployment

- [x] **X1**: `.dev.vars.example`, `scripts/hash-admin-password.ts`, `DEPLOY.md` with one-time and per-deploy steps
- [ ] **X2**: Cloudflare D1 create + migrations apply; secrets via `wrangler secret put`; Pages project linked — *requires interactive `wrangler login`; documented in DEPLOY.md*
- [ ] **X3**: Deploy + smoke tests (tournament endpoint, admin flow end-to-end) — *blocked on X2*

## End-to-End Tests

Scenario specs (preconditions → steps → expected) live in `plan.md` § Test Scenarios → End-to-End Scenarios. Ids here match the scenario ids there. Server clock is controlled at runtime via `POST /api/admin/test/clock` (gated by `requireAdmin` + `DEPLOYMENT_STAGE=TEST`); browser clock via Playwright `page.clock`. Specs run serially (`workers: 1`) and delete the games they create.

- [x] **E0**: Playwright install (`@playwright/test` + Firefox browser; Chromium blocked on `libgbm.so.1` system lib in WSL2) + `playwright.config.ts` (auto-spawns wrangler dev + vite dev)
- [x] **E1**: Happy path — admin → game → player → prediction → result → leaderboard (`tst/e2e/happy-path.spec.ts`)
- [x] **E2**: Prediction lock at kickoff — server clock moved past kickoff; server 403 + `MyPicks` refresh message (`lock.spec.ts`)
- [x] **E2b**: Champion pick lock at first kickoff — folded into `lock.spec.ts`
- [x] **E3**: Champion bonus after final — seeded full-bracket results resolve M104; verify +20 for the correct pick and none for a wrong one (`champion-bonus.spec.ts`)
- [x] **E4a**: Groups tab renders 12 cards (`ui-surfaces.spec.ts`)
- [x] **E4b**: Knockouts tab renders phases + slot labels (`ui-surfaces.spec.ts`)
- [x] **E4c**: Match detail pre/post-kickoff visibility (`ui-surfaces.spec.ts`)
- [x] **E4d**: Switch-game clears session, returns to `/` (`ui-surfaces.spec.ts`)
- [x] **E5**: Auth rejections — wrong admin password, wrong game password (`auth.spec.ts`)

## Verification

- [x] **V1**: `npm run typecheck` clean
- [x] **V2**: `npm run lint` clean
- [x] **V3**: `npm run test` (unit + integration) and `npx playwright test` (E2E) all green
- [x] **V4**: `npm run test:coverage` — ≥ 90% line and branch on `shared/`, `api/`, `data/` (UI excluded)
- [x] **V5**: `npm run build` succeeds
- [x] **V6**: UI flows verified by the Playwright E2E suite (E1-E5); a manual browser pass remains worthwhile before a production deploy
