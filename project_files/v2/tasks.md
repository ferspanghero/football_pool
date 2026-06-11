# v2 Tasks — Auto-Pull Match Results (BL4)

Each maps to a step in `plan.md`. Unit scenario ids (`U*`) and E2E ids (`E15`/`E16`) are defined in
`plan.md` § Test Scenarios.

## DB & Repo

- [x] **DB1**: `migrations/0004_results_source.sql` — `ALTER TABLE match_results ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('AUTO','MANUAL'))`. Apply to local D1. (U14)
- [x] **DB2**: `resultsRepo` — add `source` to `MatchResult`; `upsert` takes `source`; `findAll` returns it; an `AUTO` write never overwrites a `MANUAL` row. (U11)
- [x] **DB3**: `GET /api/admin/results` (read by the Results tab) exposes `source` per row; admin route writes `MANUAL`.

## Champion

- [x] **CH1**: `export const CHAMPION: TeamId | undefined` in `data/tournament.ts` (initially `undefined`).
- [x] **CH2**: `determineChampion` returns `CHAMPION`, asserting it is one of the Final's teams; update `leaderboard-routes` + `scoring.test.ts`. (U13)

## ESPN adapter (sole results source)

- [x] **ES1**: `tst/fixtures/` — capture trimmed real ESPN payloads: a scoreboard, a regular-match summary, a both-scored own-goal summary, an ET/penalty summary.
- [x] **ES2**: `api/providers/espn.ts` — `extractFromSummary` (90-min score via headline-or-reconstruct by status; goal = `scoringPlay && !shootout`; first-scorer matrix + count guard). (U1–U4)
- [x] **ES3**: `fetchFinishedResults(fetchFn, startDate, endDate)` — scoreboard listing in ≤5-day windows; conditional summary fetch; graceful degradation. Helpers `dateRangeWindows` / `shiftYmd` / `espnDateFromKickoff`. (U5–U7)

## Sync core & Worker

- [x] **SY1**: `api/sync-results.ts` — `syncResults({ results, db, now, ignoreWindow })`: candidate selection (resolved + kicked off + unrecorded), team-identity matching, orientation (swap score + flip first-scorer), `AUTO` upsert. (U8–U11)
- [x] **SY2**: Window guard + `ignoreWindow`. (U12)
- [x] **SY3**: `api/scheduled.ts` (`runResultsSync` + `runScheduledSync`) + `api/index.ts` `export default { fetch, scheduled }` + `wrangler.toml` `[triggers] crons = ["0 * * * *"]`.

## Manual Sync (admin on-demand trigger)

- [x] **MS1**: `POST /api/admin/sync-results` (requireAdmin, `ignoreWindow`, 502 on failure) + tests (auth / stubbed-fetch happy path / failure). (U15)
- [x] **MS2**: `src/api-client.ts` `adminSyncResults()` + `src/routes/Admin.tsx` "Sync results now" button (toasts summary, refreshes rows).

## Admin badge UI

- [x] **UI1**: `src/api-client.ts` carry `source` on results.
- [x] **UI2**: `src/routes/Admin.tsx` — `AUTO`/`MANUAL` badge per result row.

## Verification & Coverage

- [x] **T1**: `npm run test:coverage` — ≥ 90% line AND branch on `shared/`, `api/`, `data/`.
- [x] **T2**: `npm run check` — typecheck + lint + coverage + build clean.

## End-to-End

- [x] **E15**: `tst/e2e/admin-results-source.spec.ts` — Admin Results badge renders `AUTO`/`MANUAL`; recording marks `MANUAL`; self-cleans.
- [x] **E16**: `tst/e2e/admin-results-source.spec.ts` — "Sync results now" runs the live sync and surfaces a summary toast.
