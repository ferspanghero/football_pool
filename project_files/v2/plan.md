# v2 Implementation Plan — Auto-Pull Match Results (BL4)

## Goal

Replace per-match manual admin entry with an hourly scheduled Worker that auto-populates match
**scores** and **first-scorer** from ESPN's key-less feed into `match_results`. Scores honor the
90-minute rule — a match decided in extra time / penalties is stored as its **regulation (90')
score**, i.e. a draw. Manual admin entry stays as the always-on override and can never be
overwritten by the cron. The tournament champion becomes an explicit hand-set constant so an
extra-time Final still pays the champion bonus. An admin can also trigger the sync on demand.

Every extraction rule and the migration below was validated against live ESPN data during design.

## User Experience

Mostly internal automation. Three surfaces change:

- **Players** — no flow change. Results, leaderboard, and My-picks per-row feedback simply populate
  on their own shortly after a match finishes, instead of waiting for an admin to key each score.
- **Admin → Results tab** — each match row gains an **`AUTO` / `MANUAL` badge** showing provenance.
  The admin can still edit any result; saving an edit marks it `MANUAL`, after which the cron will
  never touch it. A **"Sync results now"** button runs the pull on demand and reports a
  `processed/written/skipped` summary as a toast.
- **Operator (deploy)** — nothing new: ESPN needs no API key, so there is no new secret.

No new player-facing endpoints. `GET /api/admin/results` (read by the Results tab) gains a `source` field.

## Architecture

```
  Cloudflare Cron ("0 * * * *")                 POST /api/admin/sync-results (admin, ignoreWindow)
        │  scheduled(event, env, ctx)                    │
        ▼                                                ▼
  api/scheduled.ts · runResultsSync ──────────────────► (shared live-fetch + ESPN wiring)
        │
        ▼
  syncResults({ results, db, now, ignoreWindow })   ← pure, injected deps (unit-tested)
        │  • window guard (skip outside 06-11…07-19, unless ignoreWindow)
        │  • candidates = resolved fixtures, kicked off, NOT already recorded
        │  • fetch ESPN results across the candidates' date span (±1 day)
        │  • match provider→our fixture by team identity; align score + first-scorer to our home/away
        ▼
  resultsRepo.upsert(db, { matchId, score, firstScorer, source:"AUTO" })
        • SKIP any row whose existing source === "MANUAL"
```

The Hono app (`api/app.ts`) is unchanged; `api/index.ts` exports `{ fetch, scheduled }`. The ESPN
adapter takes an injected `fetch`, so all listing/extraction/orientation logic is unit-tested; only
the thin `scheduled()`/`runResultsSync` wiring is glue.

## Source & Extraction (ESPN, validated)

ESPN's unofficial soccer feed (`site.api.espn.com/.../soccer/fifa.world`), no key required. Team
abbreviations equal our `TeamId`s, so no code reconciliation.

### Listing finished matches
- `GET …/scoreboard?dates=YYYYMMDD-YYYYMMDD` returns events with status + headline score. The
  response caps at ~100 events, so the adapter queries in ≤5-day windows covering the candidate
  dates (±1 day, to absorb ESPN's date-boundary fuzziness).
- A match counts only when `status.type.completed === true`.

### 90-minute score
- **Regulation finish** (`STATUS_FULL_TIME`): the headline competitor scores *are* the 90-minute score.
- **Extra time / penalties** (`STATUS_FINAL_AET` / `STATUS_FINAL_PEN`, or any period-≥3 goal): the
  headline includes those goals, so the 90-minute score is **reconstructed** by counting goals in
  periods 1–2 from the match summary `keyEvents`. *(Validated: 2022 Final headline 3-3 → 90' 2-2.)*
- A goal is any `keyEvents` entry with `scoringPlay === true` and not a shootout penalty (`!shootout`)
  — robust across ESPN's goal-type strings (`Goal`, `Goal - Header`, `Penalty - Scored`, `Own Goal`).
  Own goals are credited to the side that benefits, so all goals map to the side whose score rose.

### First-scorer
| 90-min score | Source | Result |
|---|---|---|
| `0-0` | score | `NONE` |
| `X-0` (X>0) | score | `HOME` |
| `0-X` (X>0) | score | `AWAY` |
| both > 0 | summary `keyEvents` | side of the first period-1–2 goal, **guarded** by: the regulation goal count must reconcile with the 90-min score (against an incomplete `keyEvents` list), else `undefined` (admin fills it) |

### Fetch economy & failure
- A summary is fetched **only** for a match that went past 90 minutes (score reconstruction) or where
  both sides scored (first-scorer) — most matches resolve from the scoreboard alone.
- A summary failure degrades gracefully: a regulation match still yields its headline score
  (first-scorer left for the admin); an extra-time match is skipped so a wrong 90-minute score is
  never written. A scoreboard-window failure skips that window; the next sync retries.

## Champion

- `export const CHAMPION: TeamId | undefined` in `data/tournament.ts`, set by hand after the Final
  (one last `tournament.ts` edit + redeploy, like advancing the bracket).
- `determineChampion` returns `CHAMPION` (asserting it is one of the Final's resolved teams, else
  `undefined`). It no longer infers the winner from the Final's 90-min score, so an extra-time Final
  (a 90-min draw) still awards the champion bonus.

## Manual-override protection

- `match_results.source` column (`'AUTO' | 'MANUAL'`, default `'MANUAL'`).
- The admin results route writes `MANUAL` (via the repo default). The cron writes `AUTO` and **skips**
  any match whose existing row is `MANUAL`. The sync further excludes already-recorded matches from
  its candidate set, so it never re-fetches or re-writes them. Existing pre-migration rows default to
  `MANUAL`, protecting anything already hand-entered.

## Migration (production-safe)

`migrations/0004_results_source.sql`:
```sql
ALTER TABLE match_results ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('AUTO','MANUAL'));
```
- **Additive and non-destructive** — verified against a real SQLite engine simulating existing prod
  rows: rows preserved, scores + `first_scorer` intact, existing rows default to `MANUAL`, `AUTO`
  inserts accepted, `CHECK` rejects bad values. Same proven pattern as the live `0002_bonuses.sql`.
- **This is the only DB migration in v2.** The `CHAMPION` constant is code, not schema; no
  `players.champion_team_id` migration. No `DROP`, rename, table rewrite, or value-mutating backfill.

## Components

### DB & repo
- `migrations/0004_results_source.sql` (above).
- `resultsRepo.upsert` takes `source`; `MatchResult` + `findAll` carry it; an `AUTO` write never
  overwrites a `MANUAL` row.
- `GET /api/admin/results` (admin.ts, read by the Results tab) adds `source` per row.

### Champion
- `CHAMPION` constant + `determineChampion` refactor + unit tests.

### ESPN adapter (`api/providers/espn.ts`)
- `fetchFinishedResults(fetchFn, startDate, endDate)` → `EspnResult[]` (per match: codes, 90-min
  `score`, `firstScorer`). Pure helpers `extractFromSummary`, `dateRangeWindows`, `shiftYmd`,
  `espnDateFromKickoff` are unit-tested against captured real payloads.

### Sync core & Worker
- `api/sync-results.ts` — `syncResults({ results, db, now, ignoreWindow })`: window guard, candidate
  selection, team-identity matching, home/away orientation (swap score + flip first-scorer), `AUTO`
  upsert.
- `api/scheduled.ts` — `runResultsSync` (shared live wiring) + `runScheduledSync` (hourly cron);
  `api/index.ts` `export default { fetch, scheduled }`; `wrangler.toml` `crons = ["0 * * * *"]`.

### Manual sync
- `POST /api/admin/sync-results` (admin-gated) runs `runResultsSync` with `ignoreWindow: true` and
  returns the summary; 502 on an unexpected failure. A "Sync results now" button in the Results tab
  calls it, toasts the summary, and refreshes the rows.

### Admin badge UI
- `src/api-client.ts` carries `source` (and `adminSyncResults()`); `src/routes/Admin.tsx` renders an
  `AUTO`/`MANUAL` badge per row.

### Tests & fixtures
- `tst/fixtures/` holds **trimmed real ESPN payloads** (re-fetched fresh, not fabricated): a
  scoreboard, a regular-match summary, a both-scored own-goal summary, and an ET/penalty summary.

## File Manifest

```
migrations/0004_results_source.sql     (new)
api/providers/espn.ts                  (new — sole results source)
api/sync-results.ts                    (new)
api/scheduled.ts                       (new)
api/index.ts                           (modified — export { fetch, scheduled })
api/repos/results.ts                   (modified — source field)
api/routes/admin.ts                    (modified — source on /admin/results; POST /admin/sync-results)
api/routes/leaderboard.ts              (modified — determineChampion(CHAMPION))
shared/scoring.ts                      (modified — determineChampion returns CHAMPION)
shared/types.ts                        (modified — ResultSource)
data/tournament.ts                     (modified — CHAMPION constant)
src/api-client.ts                      (modified — source + adminSyncResults)
src/routes/Admin.tsx                   (modified — badge + Sync button)
src/styles/app.css                     (modified — badge variants)
wrangler.toml                          (modified — cron trigger)
tst/fixtures/espn-*.json               (new — real captured payloads)
tst/api/providers/espn.test.ts         (new)
tst/api/sync-results.test.ts           (new)
tst/e2e/admin-results-source.spec.ts   (new — E15 badge, E16 sync button)
```

## Verification

1. `npm run test` — all unit/integration green.
2. `npm run test:coverage` — ≥ 90% line AND branch on `shared/`, `api/`, `data/`.
3. `npm run check` — typecheck + lint + coverage + build clean.
4. `npx playwright test tst/e2e/admin-results-source.spec.ts` — badge + sync button.
5. Migration dry-run: apply `0004` to a copy with seeded rows; confirm rows/values survive and new
   rows default to `MANUAL`.
6. `security-audit` diff mode over the change.

## Test Scenarios

Unit (driven by real fixtures unless noted):

- **U1** — regular finished match: 90-min = headline; first-scorer forced by the score.
- **U2** — extra-time/penalty match: 90-min reconstructed from period-1–2 goals, not the headline.
- **U3** — both-scored regular match: first regulation goal's side; own goal credited to the beneficiary.
- **U4** — both-scored but `keyEvents` disagree with the score → first-scorer `undefined`.
- **U5** — `dateRangeWindows` splits a long span into ≤5-day windows; single-day and month-boundary cases.
- **U6** — `fetchFinishedResults`: regular match resolved from the scoreboard with no summary call;
  summary fetched for both-scored and ET matches; non-completed events skipped.
- **U7** — degradation: ET match with no summary skipped; regular both-scored with no summary →
  headline score, no first-scorer; scoreboard-window failure → empty.
- **U8** — sync writes `AUTO` for a matched candidate over the buffered date span.
- **U9** — orientation: score swap + first-scorer flip when ESPN lists the teams reversed.
- **U10** — sync skips a candidate ESPN has no result for, and a result matching no candidate.
- **U11** — sync skips an already-recorded match (MANUAL protected, AUTO not re-fetched).
- **U12** — window guard: no-op (no fetch) outside the window; `ignoreWindow` runs anyway.
- **U13** — champion: `CHAMPION` set → `determineChampion` returns it even on a 90-min draw Final;
  unset / not-a-Final-team → `undefined`.
- **U14** — migration: seeded pre-migration rows survive, get `source='MANUAL'`.
- **U15** — manual sync endpoint: 401 (no admin), 200 writes `AUTO` + returns the summary (stubbed
  fetch), 502 on an unexpected failure.

E2E (Playwright, Firefox), ids continue the suite's `E`-series:

- **E15** — Admin Results badge renders `AUTO`/`MANUAL`; recording a result marks it `MANUAL`.
- **E16** — "Sync results now" runs the live sync and surfaces a summary toast.

## Implementation Order

```
DB(schema+repo+source) → CH(champion constant)
        │
        └─ ESPN(adapter) → SY(sync core) → SC(scheduled + cron) ──┬─ MS(manual sync endpoint + button)
                                                                   ├─ UI(admin badge)
                                                                   └─ E(e2e)
        ▼
T(coverage) → review → verify → publish
```
