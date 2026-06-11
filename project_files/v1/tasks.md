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
- [x] **A8f** *(added)*: `GET /api/admin/games/:id/players` — lists a game's players for the admin Players tab + tests
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
- [x] **F9d**: Admin Players tab — per-game list via `GET /api/admin/games/:id/players`, delete via `DELETE /api/admin/players/:id`
- [x] **F10**: UI polish — loading skeletons, success/error toasts, color-coded outcome badges, numeric inputmode (offline banner deferred)

## Deployment

- [x] **X1**: `.dev.vars.example`, `scripts/hash-admin-password.ts`, `DEPLOY.md` with one-time and per-deploy steps
- [x] **X2**: Run `./scripts/deploy.sh` — creates the D1 database, applies migrations, sets secrets (`SESSION_SECRET`, `ADMIN_PASSWORD_HASH`), and deploys the single Worker (SPA static assets + API). *Requires one interactive `wrangler login`; documented in README.*
- [x] **X3**: Deployed and smoke-tested (tournament endpoint, admin flow end-to-end). Live at `football-pool.ferspanghero.workers.dev`.

## End-to-End Tests

Scenario specs (preconditions → steps → expected) live in `plan.md` § Test Scenarios → End-to-End Scenarios. Ids here match the scenario ids there. Server clock is controlled at runtime via `POST /api/admin/test/clock` (gated by `requireAdmin` + `DEPLOYMENT_STAGE=TEST`); browser clock via Playwright `page.clock`. Specs run serially (`workers: 1`) and delete the games they create.

- [x] **E0**: Playwright install (`@playwright/test` + Firefox browser; Chromium blocked on `libgbm.so.1` system lib in WSL2) + `playwright.config.ts` (auto-spawns wrangler dev + vite dev)
- [x] **E1**: Happy path — admin → game → player → prediction → result → leaderboard (`tst/e2e/happy-path.spec.ts`)
- [x] **E2**: Prediction lock at kickoff — server clock moved past kickoff; server 403 + `MyPicks` refresh message (`lock.spec.ts`)
- [x] **E2b**: Champion pick lock at first kickoff — folded into `lock.spec.ts`
- [x] **E3**: ~~Champion bonus E2E~~ — **removed in BL5.** With manual knockout teams, the Final (M104) carries placeholder teams in test data, so the champion-bonus flow can't run end-to-end. Champion-bonus logic stays covered by unit tests (`determineChampion` + `computeLeaderboard` in `scoring.test.ts`).
- [x] **E4a**: Groups tab renders 12 cards (`ui-surfaces.spec.ts`)
- [x] **E4b**: Knockouts tab renders phases + placeholder team labels (`ui-surfaces.spec.ts`)
- [x] **E4c**: Match detail pre/post-kickoff visibility (`ui-surfaces.spec.ts`)
- [x] **E4d**: Switch-game clears session, returns to `/` (`ui-surfaces.spec.ts`)
- [x] **E5**: Auth rejections — wrong admin password, wrong game password (`auth.spec.ts`)
- [x] **E6**: Admin Players tab — list a game's players + delete one (`admin-players.spec.ts`)
- [x] **E7**: Viewer-local kickoff times — same match rendered under `timezoneId` LA vs Tokyo shows a different clock label + calendar day (`timezone.spec.ts`); proves BL3 at the browser level
- [x] **E8**: Per-player auth — cookie resume card, cross-device login with the player password, and rejection of an impersonation attempt that knows only the shared game password (`player-auth.spec.ts`); proves BL2 at the browser level
- [x] **E9**: Prediction inputs — unsaved matches show empty score boxes (blank ≠ 0-0) and a save is blocked until both scores are filled (`predictions-ui.spec.ts`)
- [x] **E10**: Unresolved knockout lock — a placeholder R32 match shows a "TBD" row with no inputs and the server rejects a direct save (403) (`predictions-ui.spec.ts`); proves BL5 at the browser level
- [x] **E11**: Mobile reflow — at a phone viewport My picks renders each match as a stacked card and the leaderboard table collapses to labeled cards (no horizontal overflow), and a prediction still saves (`mobile.spec.ts`); proves BL9 at the browser level
- [x] **E12**: First-to-score bonus — the My-picks first-scorer pick persists across a reload, and once the admin records the matching actual it scores on the leaderboard (`bonuses.spec.ts`); proves BL6 at the browser level
- [x] **E13**: Per-phase 2× boost — boosting a match persists across a reload and doubles its points on the leaderboard (`bonuses.spec.ts`); proves BL7 at the browser level

## Verification

- [x] **V1**: `npm run typecheck` clean
- [x] **V2**: `npm run lint` clean
- [x] **V3**: `npm run test` (unit + integration) and `npx playwright test` (E2E) all green
- [x] **V4**: `npm run test:coverage` — ≥ 90% line and branch on `shared/`, `api/`, `data/` (UI excluded)
- [x] **V5**: `npm run build` succeeds
- [x] **V6**: UI flows verified by the Playwright E2E suite (E1-E10); a manual browser pass remains worthwhile before a production deploy

## Backlog (post-v1)

- [x] **BL1**: Country flags next to team names — render each team's flag beside its name everywhere matches show (My picks rows, Groups cards, Knockouts, Match detail, Admin results). Needs a flag source keyed by team id; note FIFA 3-letter codes (`ENG`, `RSA`, …) are **not** ISO 3166 alpha-2, so a code→country mapping is required (then emoji regional-indicator flags, or bundled SVGs). Centralize the mapping next to the team data.
- [x] **BL2**: Per-player passwords + cookie resume (returning-player access). **Design (approved):** each player owns a password *scoped to the game* (no global user concept); reuse PBKDF2 in `api/crypto.ts` + the existing stateless signed `player_session` cookie (no server-side session store). **Signup** (username not yet in the game): requires the shared game password, then the player sets their own password → new `players.password_hash` column. **Login** (existing username): player password only — the game password is the *join* gate and is not re-asked on return. **Resume:** a valid cookie auto-resumes, and the landing page shows a *Continue as <name> in <game>* card, so the common return path needs zero typing. **Keeps the global game list** — invite-link / hidden-games was considered and dropped as out of scope. **Solves:** retype (cookie), impersonation (per-player password — being a player now requires that player's secret, not just the shared game password), typo-duplicates (no typing on your own device; on a new device a typo'd *new* name needs the game password, and strays are deletable via the Admin Players tab). **No selectable name list** (keeps type-it-yourself; doesn't reveal the roster). **Touches:** migration (`players.password_hash`), the enter route (signup-vs-login branch), Entry UI (+ landing resume card); auth middleware unchanged.
- [x] **BL3**: Localize kickoff times to the viewer's browser instead of hardcoded Pacific. Today `shared/time.ts` pins every formatter to `America/Los_Angeles` — a deliberate v1 choice so the whole group saw one shared wall-clock. **Goal:** render each kickoff in the *viewer's* own browser locale + timezone (e.g., a friend in Brazil sees BRT), since players span time zones. **Implementation:** drop the hardcoded `timeZone` (and locale) so `Intl.DateTimeFormat` uses the runtime's resolved zone/locale; these formatters are display-only and run client-side. **Note:** the My-picks per-day grouping keys off `formatKickoffDate`, so day boundaries become per-viewer (expected, not a bug). **Tests:** `tst/shared/time.test.ts` asserts fixed PDT/PST output — make the zone injectable (or pin `TZ` in the test) so it stays deterministic in CI.
- [x] **BL4**: Auto-pull match results instead of manual admin entry. **Done — see `project_files/v2/`.** Today results are entered by hand (`PUT /api/admin/results/:matchId`, Admin → Results tab). **Goal:** fetch final 90-minute scores from an external source and write them into `match_results` automatically. **Candidate approach:** a scheduled Worker (Cloudflare Cron Trigger, free tier) that polls a football results API/feed, maps the provider's fixture ids → our `MatchId`s, and upserts via the existing results repo. **Open questions** (resolve via `project-brainstorm` before building): which data source is free + reliable for the 2026 World Cup; how to map provider fixtures to our static `data/tournament.ts` ids; how to record only the 90-minute result (extra time / penalties excluded, per scoring rules); auth/secret storage for the provider key. **Keep manual entry as the fallback/override** — don't remove it.
- [x] **BL5**: Manual knockout teams + unify the match model. Collapsed `GroupMatch`/`KnockoutMatch`/`BracketSlot` into one `Match` shape (`homeTeamId`/`awayTeamId` + optional `group`); knockout fixtures seed **placeholder** team labels (e.g. `"Winner of Group A"`) in `data/tournament.ts` that an admin replaces with real ids per round + redeploys. **Deleted the auto-resolver** (`shared/bracket.ts` — `resolveBracket`/`groupStandings`/`bestThirds`, superseding the K-section tasks) so no FIFA tiebreaker/fair-play/lots logic is maintained; the champion bonus reads the Final match's real teams directly. New `hasResolvedTeams` (`shared/phases.ts`) gates predictions: a knockout with placeholder teams is **locked** — `MyPicks` shows a read-only "TBD" row and `PUT /me/predictions/:matchId` returns 403. A teamId typo just leaves the match safely locked. Coverage held ≥90% (line 98.4% / branch 93.6%).
- [x] **BL6**: First-team-to-score bonus. A player predicts which side scores first (home / away / no goal); a correct pick earns a base **+2** (phase-weighted), a wrong pick **−2** (phase-weighted) — a risk/reward bet — and no pick is neutral. The leaderboard shows net first-scorer points in its own column (`LeaderboardRow.firstScorerPoints`). **Decisions:** players pick a **side or neither** via an inline ⚽ toggle beside each team in the score line (no "no goal" option — the player route rejects a NONE pick); a goalless draw therefore makes any pick wrong (−2). The admin still records the actual as HOME/AWAY/**NONE** (NONE ⇔ 0-0, enforced) so a side pick on a 0-0 is penalized. `first_scorer` is folded onto the `predictions` row (saved with the score) and onto `match_results`. The admin Results dropdown is **score-driven**: 0-0 → "no goal", a one-sided result auto-picks the lone scorer (both locked), only a both-scored result is selectable; the server rejects a first scorer that contradicts the score. **Per-match feedback:** once a result is recorded, each scored My-picks row shows its net points, the actual score, and a green/red ⚽ — fed by a new public `GET /api/results` and the shared `scorePrediction` helper (also reused by `computeLeaderboard`). New `FirstScorer` type + pure `scoreFirstScorer` in `shared/scoring.ts`; `computeLeaderboard` folds the bonus into each match's contribution. UI: a first-to-score selector on the My-picks row and the Admin Results row. Locks at the match's kickoff like the score. Abandoned matches are out of scope (only recorded 90-minute results score).
- [x] **BL7**: Per-phase 2× boost. In each phase a player may flag one match to double everything it earns. **Decisions:** the boost **stacks** on the phase multiplier (base × phaseMult × 2, and it also doubles that match's first-to-score bonus); it locks at the **phase's first kickoff** (new `phaseFirstKickoffUtc` helper); the flat champion bonus is never boosted. Stored in a new `phase_boosts` table keyed `(player_id, phase_id)` (one-per-phase), with `boostsRepo`; `computeLeaderboard` takes a per-(player,phase) boost map; `PUT /me/boosts/:phaseId` sets/clears it (validates the match belongs to the phase). UI: a per-row ⚡ boost toggle on My picks (selecting another match in the phase replaces the prior one; read-only badge once the phase locks).
- [ ] **BL8**: First-goalscorer bonus. Let a player predict the first player to score in a match; award bonus points if correct. **Heaviest of the three** — needs squad data the app doesn't have today (~26 players × 48 teams, and rosters change), a way for the admin to record the actual first scorer, and a player-search prediction UI. **Touches:** new squad dataset (+ source/refresh strategy), `match_results` first-scorer field + Admin UI, a prediction field, the scoring engine. **Open questions:** free + reliable squad-data source; own-goal / no-goal handling; point value; locks at kickoff.
- [x] **BL9**: First-class mobile experience. **Approach (chosen):** hybrid — minimal markup + CSS, keeping the single 640px breakpoint and leaving desktop byte-for-byte unchanged. Scope was the densest player-facing surfaces: My picks and the Leaderboard/Match-detail tables (Groups and Knockouts already reflow; Admin is desktop-only). **My picks:** each match is wrapped in a `.pick-row` that is `display: contents` on desktop (so its children stay in the shared `picks-grid` exactly as before) and becomes a self-contained card below 640px; the two score inputs carry `home`/`away` classes for placement, and the Save button is fixed-width so it doesn't resize between Save/Saving…/Saved ✓. **Tables:** `<td>`s gained `data-label`s and collapse to stacked labeled cards (header row hidden) below 640px. **Tap targets** bumped to ~44px. Also fixed a pre-existing Admin Results misalignment (variable-width Save button shifted the score inputs). **Locked in** by a mobile-viewport Playwright spec (`mobile.spec.ts`, see E11) since CSS has no unit-coverage path.
