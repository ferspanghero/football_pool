# v4 Tasks — Knockout Team Sync + Per-Match Boost Lock

## Feature 2 — Per-match boost lock (do first; independent)

- [x] **BST1**: Rewrite `setBoost` (`api/services/predictions.ts`) to the per-target-match rule —
  set/move requires target + current boost (if any) not kicked off; clear blocked only on a
  boostable phase whose boosted match has kicked off (stale non-boostable rows stay clearable).
- [x] **BST2**: Remove the now-dead `phaseFirstKickoffUtc` from `shared/phases.ts` (import + export + its unit test).
- [x] **BST3**: Unit tests B1–B6 (set later match after earlier started, move among future, target
  kicked off, rescue-set + rescue-clear rejected, clear future boost, phase/validation/non-boostable cases).
- [x] **BSTe2e**: Playwright B7 — MyPicks per-match boost eligibility + locked-after-kickoff (`src/routes/MyPicks.tsx`).

## Feature 1 — Knockout team sync

### Data + repo
- [x] **KS1**: Migration `migrations/0006_knockout_teams.sql` (`match_id` PK, home/away team ids, `source` CHECK, `updated_at`).
- [x] **KS2**: `api/repos/knockoutTeams.ts` — `upsert` (AUTO guarded `!= 'MANUAL'`), `findAll`, `findById`; `KnockoutTeams` type. Unit tests incl. K3 (MANUAL not clobbered), K5 (idempotent).

### Merge / resolved matches
- [x] **KS3**: `api/resolved-matches.ts` — pure `resolveMatches(matches, overrides)` + `getResolvedMatches(db)`. Unit tests (override applied, absent passthrough, K1 shape).
- [x] **KS4**: Thread `getResolvedMatches(db)` through the five team-identity consumers: `/api/tournament` (public.ts), `submitPrediction` gate, `syncResults` candidate match-up, `determineChampion` (leaderboard.ts), MCP `list_matches`.

### ESPN provider + orchestrator
- [x] **KS5**: `fetchScheduledFixtures` + `EspnFixture` in `api/providers/espn.ts` (date + both team codes, placeholders passed through). Unit tests with a captured scoreboard fixture.
- [x] **KS6**: `api/sync-bracket.ts` — `syncBracket` (datetime map, both-real filter, AUTO upsert, window guard, summary counts). Unit tests K1, K2, K4, K6.

### Wiring + combined sync
- [x] **KS7**: `api/scheduled.ts` — `runBracketSync`; `runScheduledSync` runs bracket→results (bracket failure isolated). Test K7 (combined order resolves then records).
- [x] **KS8**: `POST /api/admin/sync-results` runs both, returns `{ bracket, results }`; button relabeled "Sync now".

### Admin override + UI
- [x] **KS9**: `GET /api/admin/knockout` + `PUT /api/admin/knockout/:matchId` (validation: unknown team id, equal ids, non-knockout/unknown match). Unit test K8.
- [x] **KS10**: `src/routes/Admin.tsx` Results-tab knockout override UI (resolved teams + `source` badge, inline edit) + `src/api-client.ts` calls.
- [x] **KSe2e**: Playwright K9 — admin views a resolved knockout fixture, overrides teams, change persists as `MANUAL`.

## Ship (Phase 5–6)
- [x] **V1**: Full gate `npm run check` green; coverage ≥ 90% line+branch on `shared/`/`api/`/`data/`.
- [x] **V2**: `npx playwright test` (Firefox) green.
- [x] **V3**: Independent code review (Phase 4) + security-audit diff (Phase 5); Critical/Important addressed.
- [x] **V4**: `create-readme` + `create-claude-md` doc-sync; note the new overlay + combined sync.

## Post-review reworks (completed)

Follow-ups from code review and hands-on admin testing, all landed under v4:

- [x] **R1**: Bracket sync surfaces drift — `log.warn` on a pending fixture with no mapped ESPN event, and skips+warns on two events sharing a kickoff instant (vs. silent last-write-wins).
- [x] **R2**: Leaderboard champion check reads the Final via an indexed `knockoutTeamsRepo.findById` instead of building the whole resolved list on the hot path.
- [x] **R3**: Admin Results tab is one reusable `ResultRow` for every phase — the separate knockout panel/badge/"unresolved" tag is gone; a knockout fixture's teams are editable inline (home/away dropdowns) only **before kickoff**, auto-saving as `MANUAL`.
- [x] **R4**: `PUT /api/admin/knockout/:matchId` rejects (403) once the match has kicked off; `GET`/`DELETE` retained for the E2E cleanup helper. Unit test + E2E **E21** (edit before kickoff, persists) / **E22** (locked after kickoff).
- [x] **R5**: E2E `cleanup` clears knockout overrides (a live `Sync now` resolves real fixtures) so specs that assert all-placeholder knockouts stay isolated.
- [x] **R6**: Doc/comment consistency sweep — README, CLAUDE.md, and code comments reflect the per-match boost lock and inline knockout editing.
