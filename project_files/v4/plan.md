# v4 Implementation Plan — Knockout Team Sync + Per-Match Boost Lock

## Goal

Two independent player/admin quality-of-life features:

1. **Knockout team sync.** Stop hand-editing `data/tournament.ts` + redeploying every time a
   knockout round's pairing is known. A new **D1 overlay** (`knockout_teams`) holds resolved team
   identities that merge onto the static placeholder fixtures at read time, populated automatically
   by an **ESPN scheduled-bracket pull folded into the existing hourly sync** (and the manual admin
   trigger), with an admin **MANUAL override** as the safety net — exactly mirroring how recorded
   results already overlay the static matches via `match_results`.
2. **Per-match boost lock.** Replace the all-or-nothing "the whole phase locks at its first
   kickoff" rule with a **per-target-match** rule: a player may set/move/clear their one per-phase
   boost among the matches in that phase that have not yet kicked off — even after earlier matches
   in the phase are done — but can never retract or move a boost once *its* match has kicked off.

## User Experience

### Knockout sync (admin + player)

- **Player:** unchanged surface. A knockout fixture shows placeholder labels ("Runner-up of Group
  A") until both teams are known, then automatically flips to the real teams and becomes
  predictable — no admin action, no redeploy. Knockout **results** then also auto-sync (they were
  previously skipped because the teams were unresolved).
- **Admin — automatic:** the hourly cron and the Results tab's **"Sync now"** button (renamed from
  "Sync results now") each run a **bracket pass then a results pass**. The bracket pass writes a
  knockout fixture's teams only once ESPN lists *both* sides as real teams.
- **Admin — manual override (safety net):** the Results tab lists knockout fixtures with their
  resolved teams and a `source` badge (`AUTO`/`MANUAL`). The admin can inline-edit home/away team
  ids; saving writes a `MANUAL` overlay row that an `AUTO` sync will never overwrite.
  - `GET /api/admin/knockout` → `{ overrides: [{ matchId, homeTeamId, awayTeamId, source }], nowMs }`
  - `PUT /api/admin/knockout/:matchId` body `{ homeTeamId, awayTeamId }` → writes a `MANUAL` row
    (400 on unknown team id, the two ids equal, or a non-knockout match; 404 on unknown match).

### Per-match boost (player)

In **My picks**, the per-phase boost control no longer greys out the moment the phase's first match
kicks off. Each match in a phase is independently boost-eligible until *that* match kicks off:

- Phase has matches 1–5; matches 1–2 have kicked off, player has no boost → they may still boost any
  of 3–5.
- Player boosted match 3 (not yet kicked off) → they may move it to 4 or 5, or clear it, any time
  before match 3 kicks off.
- Once the boosted match kicks off → the boost is **locked** (cannot move or clear it).
- Once *every* match in the phase has kicked off with no boost set → nothing left to boost.

Same rules hold on the MCP `set_boost` tool (both surfaces call the one service).

## Architecture

```
                       data/tournament.ts (static base: id, phase, kickoff, placeholder labels)
                                  │
   knockout_teams (D1 overlay)    │   resolveMatches(static, overrides)  ── pure, unit-tested
   matchId → home/away + source ──┴──────────────┬─────────────────────►  Resolved Match[]
            ▲                                     │
            │ AUTO upsert (never clobbers MANUAL) │ consumed by team-identity readers:
            │                                     │   • GET /api/tournament (SPA)
   syncBracket(fetcher, db, now) ◄──┐             │   • submitPrediction hasResolvedTeams gate
            │                       │             │   • syncResults candidate match-up (knockouts now resolve)
   fetchScheduledFixtures(fetch) ───┘             │   • determineChampion (Final teams)
   (ESPN scoreboard: date + both team codes)      │   • MCP list_matches
                                                  │
   runScheduledSync: bracket pass → results pass  ┘   (cron + POST /api/admin/sync-results)

  Boost lock (api/services/predictions.setBoost): per-target-match
   set/move → target not kicked off AND current boost (if any) not kicked off
   clear     → current boost not kicked off (boostable phases); always allowed on non-boostable
```

Kickoffs and phases live only in the static base — the overlay changes **team identities only** —
so `FIRST_KICKOFF_UTC`, the tournament window, the champion-pick lock, and the boost kickoff checks
are all unaffected.

## Feature 1 — Knockout team sync

### Data: `knockout_teams` overlay (migration `0006_knockout_teams.sql`)

```sql
CREATE TABLE knockout_teams (
  match_id     TEXT PRIMARY KEY,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO','MANUAL')),
  updated_at   INTEGER NOT NULL
);
```

### Repo: `api/repos/knockoutTeams.ts`

Mirror `resultsRepo`: `upsert({matchId, homeTeamId, awayTeamId, source?})` where an `AUTO` write is
guarded `WHERE knockout_teams.source != 'MANUAL'` (a `MANUAL` write always wins), `findAll(db)`,
`findById(db, matchId)`. Type `KnockoutTeams = { matchId, homeTeamId, awayTeamId, source, updatedAt }`.

### Merge: resolved matches

- Pure `resolveMatches(matches: readonly Match[], overrides: readonly {matchId,homeTeamId,awayTeamId}[]): Match[]`
  — for each static match, swap in an override's team ids when present, else return as-is. Lives in
  a new module (`api/resolved-matches.ts`), exported for unit test.
- `getResolvedMatches(db): Promise<Match[]>` = `resolveMatches(MATCHES, await knockoutTeamsRepo.findAll(db))`.
- Thread `getResolvedMatches(db)` through the five team-identity consumers; keep `MATCHES` for
  consumers that read only `phase`/`kickoff` (scoring, boost service, admin results-PUT existence
  check).

### Provider: `api/providers/espn.ts` → `fetchScheduledFixtures`

`fetchScheduledFixtures(fetchFn, startDate, endDate): Promise<EspnFixture[]>` where
`EspnFixture = { kickoffUtc: string; homeTeamCode: TeamId; awayTeamCode: TeamId }`. Queries the
scoreboard in the existing `dateRangeWindows`, and for every event with a readable `competitorPair`
emits the event date (normalized to an ISO instant via `Date.parse`) + both team abbreviations —
**real or placeholder** (placeholders like `2A`/`1F`/`3RD` pass through; the sync layer filters
them). No summary fetch needed. A window fetch failure is logged and skipped (as today).

### Orchestrator: `api/sync-bracket.ts` → `syncBracket`

```
syncBracket({ fixtures, db, now, ignoreWindow }):
  no-op outside tournament window unless ignoreWindow
  knockout = MATCHES.filter(isKnockoutMatch)
  span the knockout kickoff dates → fetch fixtures, index by Date.parse(kickoffUtc)
  for each knockout fixture m:
    f = byKickoff.get(Date.parse(m.kickoffUtc));   if !f → skipped (log unmapped at debug/info aggregate)
    if !VALID_TEAM_IDS.has(f.home) || !VALID_TEAM_IDS.has(f.away) → skipped (still placeholder)
    upsert AUTO {matchId: m.id, homeTeamId: f.home, awayTeamId: f.away}   (repo guard skips MANUAL)
  return { processed, written, skipped }
```

- **Mapping key:** exact kickoff-datetime equality (validated live today against scheduled R32 —
  ESPN dates match our `kickoffUtc` to the minute and the home/away orientation matches our
  placeholders). An unmapped event (schedule drift) is left for the admin override; surfaced in the
  summary counts.
- **Orientation:** adopt ESPN's home/away directly (the fixture had no real teams before, and the
  results sync reads the same ESPN orientation, so they stay consistent).
- Pure orchestration with the fixtures fetcher injected — fully unit-tested like `syncResults`.

### Wiring: combined sync (`api/scheduled.ts`)

- `runBracketSync(env, {now, ignoreWindow})` composes `fetch` + `fetchScheduledFixtures` into
  `syncBracket` (mirrors `runResultsSync`).
- `runScheduledSync` runs **bracket then results**, each logged with its summary; a bracket failure
  is caught/logged and does not abort the results pass.
- `POST /api/admin/sync-results` runs both (bracket then results, `ignoreWindow: true`) and returns
  both summaries `{ bracket, results }`. Button relabeled "Sync now". Path kept for minimal churn.

### Admin override + UI

- `GET /api/admin/knockout` and `PUT /api/admin/knockout/:matchId` (validations above) in `api/routes/admin.ts`.
- `src/routes/Admin.tsx` Results tab: list knockout fixtures (resolved teams + `source` badge),
  inline editable home/away team ids → `PUT`. `src/api-client.ts` gains the two calls.

## Feature 2 — Per-match boost lock (`api/services/predictions.ts` `setBoost`)

Replace the `phaseFirstKickoffUtc` lock with a per-match rule. New shape:

```
setBoost(db, nowMs, { playerId, phaseId, matchId }):
  if phaseId unknown → NOT_FOUND
  current = boostsRepo.findByPlayer(playerId).find(phaseId)         // the one boost for this phase, if any
  currentLocked = current && nowMs >= kickoff(current.matchId)      // its match already started
  if clearing (matchId null/undefined):
    if BOOSTABLE_PHASE_IDS.has(phaseId) && currentLocked → FORBIDDEN  // can't retract a started boost
    clear; return OK                                                  // stale non-boostable rows always clearable
  if !BOOSTABLE_PHASE_IDS.has(phaseId) → FORBIDDEN
  if currentLocked → FORBIDDEN                                        // can't move off a started boost
  match = MATCH_BY_ID.get(matchId);  if !match || match.phase != phaseId → VALIDATION
  if nowMs >= kickoff(match) → FORBIDDEN                              // target already started
  set {playerId, phaseId, matchId: match.id}; return OK
```

- `kickoff(matchId)` reads the static `MATCH_BY_ID` (kickoffs never change — no resolved-matches
  read needed here).
- Scoring (`shared/scoring.ts`) is unchanged: a boost only ever lands on a not-yet-started match,
  then freezes.
- Remove the now-dead `phaseFirstKickoffUtc` from `shared/phases.ts` (and its import + unit test).
- My-picks UI (`src/routes/MyPicks.tsx`): each match in a phase is boost-eligible until its own
  kickoff; the boosted match shows locked once it kicks off.

## File Manifest

```
project_files/v4/plan.md                      new
project_files/v4/tasks.md                     new
migrations/0006_knockout_teams.sql            new
api/repos/knockoutTeams.ts                    new   (overlay repo, AUTO≠clobber-MANUAL)
api/resolved-matches.ts                       new   (pure resolveMatches + getResolvedMatches)
api/providers/espn.ts                         mod   (fetchScheduledFixtures + EspnFixture)
api/sync-bracket.ts                           new   (syncBracket orchestrator)
api/scheduled.ts                              mod   (runBracketSync; runScheduledSync bracket→results)
api/routes/admin.ts                           mod   (GET/PUT /admin/knockout; sync runs both)
api/routes/public.ts                          mod   (/api/tournament serves resolved matches)
api/routes/leaderboard.ts                     mod   (determineChampion uses resolved Final teams)
api/services/predictions.ts                   mod   (submitPrediction resolved gate; setBoost per-match lock)
api/mcp/tools.ts                              mod   (list_matches serves resolved matches)
shared/phases.ts                              mod   (remove dead phaseFirstKickoffUtc)
src/routes/Admin.tsx                          mod   (knockout override UI in Results tab)
src/routes/MyPicks.tsx                        mod   (per-match boost eligibility)
src/api-client.ts                             mod   (admin knockout get/put)
tst/** (unit + e2e)                           new/mod
```

## Verification

1. `npm run check` (typecheck → lint → coverage → build) green; coverage ≥ 90% line **and** branch
   on `shared/`, `api/`, `data/`.
2. `npx playwright test` (Firefox) green, including the new per-match boost + knockout-resolves specs.
3. Independent code-review pass (Phase 4) and security-audit diff pass (Phase 5) — Critical/Important
   addressed.

## Test Scenarios

Knockout sync (unit unless noted):
- **K1** — resolve both real: ESPN lists a knockout fixture's two real teams → overlay AUTO row
  written; `getResolvedMatches` returns the real ids; fixture becomes predictable.
- **K2** — one side placeholder: ESPN home real, away `3RD` → no write (fixture stays unresolved).
- **K3** — MANUAL not clobbered: a `MANUAL` override exists → an AUTO sync leaves it unchanged.
- **K4** — unmapped event: ESPN datetime has no matching fixture → skipped, counted, no write.
- **K5** — idempotent: re-running the sync with the same ESPN data writes the same AUTO row, no churn.
- **K6** — window guard: outside the tournament window the scheduled bracket sync no-ops; the manual
  trigger (`ignoreWindow`) runs.
- **K7** — combined sync order: one tick resolves a knockout's teams (bracket) then records its
  finished result (results) — knockout result is auto-recorded.
- **K8** — admin override endpoint: `PUT /admin/knockout/:matchId` writes MANUAL; rejects unknown
  team id, equal ids, non-knockout/unknown match.
- **K9** (E2E) — admin sees a resolved knockout fixture with its `source` badge, edits the teams,
  and the change persists and shows `MANUAL`.

Per-match boost (unit unless noted):
- **B1** — boost a later match after earlier ones started: matches 1–2 kicked off, no boost → boost
  match 4 (not started) succeeds.
- **B2** — move among future matches: boosted match 4 (not started) → move to match 5 succeeds.
- **B3** — target already kicked off → FORBIDDEN.
- **B4** — move off a started boost (rescue) rejected: boosted match 3, match 3 kicked off → setting
  match 5 → FORBIDDEN; clearing → FORBIDDEN.
- **B5** — clear a not-yet-started boost succeeds.
- **B6** — match not in phase → VALIDATION; unknown phase → NOT_FOUND; non-boostable phase set →
  FORBIDDEN; clear on a non-boostable phase with a stale row → OK even after its match kicked off.
- **B7** (E2E) — My-picks: after early matches in a phase have kicked off, a later match is still
  boost-selectable; once the boosted match kicks off it shows locked.

## Implementation Order

```
Feature 2 (boost) is independent and small → do first to bank a clean win:
  B-svc (setBoost per-match lock + remove phaseFirstKickoffUtc) → B-e2e (MyPicks)

Feature 1 (knockout sync), bottom-up:
  migration 0006 → knockoutTeams repo → resolveMatches/getResolvedMatches (pure first)
    → thread resolved matches through the 5 consumers
    → espn.fetchScheduledFixtures → syncBracket → scheduled wiring (bracket→results)
    → admin GET/PUT knockout + Admin.tsx UI → knockout-resolves E2E
(Feature 1 and Feature 2 touch disjoint code except the predictions service file — sequence them.)
```
