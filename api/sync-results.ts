/**
 * Scheduled results sync (BL4) — pulls finished matches' 90-minute results from ESPN and records them.
 *
 * Each run: finds our resolved fixtures that have kicked off but have no recorded result yet,
 * fetches ESPN's finished results across their date span, matches each to our fixture by team
 * identity (a team pair plays at most once), aligns the score and first-scorer to our home/away
 * orientation, and upserts an `AUTO` result — which the repo refuses to write over a `MANUAL`
 * (admin) row. Already-recorded matches are skipped, so the sync is cheap and idempotent.
 *
 * Pure orchestration with the results fetcher and clock injected, so it is fully unit-tested.
 */

import { MATCHES, TEAMS } from '@data/tournament';
import { hasResolvedTeams } from '@shared/phases';
import { getResolvedMatches } from '@api/resolved-matches';
import { resultsRepo } from '@api/repos/results';
import { espnDateFromKickoff, shiftYmd, type EspnResult } from '@api/providers/espn';
import type { FirstScorer, Match, Score } from '@shared/types';

/** Fetches finished 90-minute results across `[startDate, endDate]` (YYYYMMDD). */
export type ResultsFetcher = (startDate: string, endDate: string) => Promise<EspnResult[]>;

export type SyncDeps = {
    results: ResultsFetcher;
    db: D1Database;
    /** Current time (ms) — the sync no-ops outside the tournament window unless `ignoreWindow`. */
    now: number;
    /** Bypass the window guard — used by the manual admin trigger, which is always intentional. */
    ignoreWindow?: boolean | undefined;
};

/** Counts from one sync run, for logging. */
export type SyncSummary = { processed: number; written: number; skipped: number };

// Tournament window: from the first kickoff until a grace period after the last match, so a final
// result still has time to land. Outside it the cron does nothing (no point polling year-round).
const RESULT_GRACE_MS = 24 * 60 * 60 * 1000;
const kickoffsMs = MATCHES.map((m) => Date.parse(m.kickoffUtc));
const TOURNAMENT_START_MS = Math.min(...kickoffsMs);
const TOURNAMENT_END_MS = Math.max(...kickoffsMs) + RESULT_GRACE_MS;

/** Whether `now` (ms) falls within the tournament window the sync operates in. */
export function isWithinTournamentWindow(now: number): boolean {
    return now >= TOURNAMENT_START_MS && now <= TOURNAMENT_END_MS;
}

const teamPairKey = (a: string, b: string): string => [a, b].sort().join('|');

/** Flip a first-scorer side (HOME↔AWAY); NONE and undefined are unchanged. */
function flipSide(fs: FirstScorer | undefined): FirstScorer | undefined {
    if (fs === 'HOME') return 'AWAY';
    if (fs === 'AWAY') return 'HOME';

    return fs;
}

/** Align an ESPN result to our fixture's home/away orientation, swapping if the teams are reversed. */
function alignToOurOrientation(match: Match, rec: EspnResult): { score: Score; firstScorer: FirstScorer | undefined } {
    if (match.homeTeamId === rec.homeTeamCode && match.awayTeamId === rec.awayTeamCode) {
        return { score: { home: rec.score.home, away: rec.score.away }, firstScorer: rec.firstScorer };
    }

    return { score: { home: rec.score.away, away: rec.score.home }, firstScorer: flipSide(rec.firstScorer) };
}

/**
 * Run one sync pass. Returns counts of what happened. No-ops (and skips all fetching) outside the
 * tournament window unless `ignoreWindow`, and when there are no unrecorded kicked-off fixtures.
 */
export async function syncResults({ results, db, now, ignoreWindow = false }: SyncDeps): Promise<SyncSummary> {
    if (!ignoreWindow && !isWithinTournamentWindow(now)) return { processed: 0, written: 0, skipped: 0 };

    const recorded = new Set((await resultsRepo.findAll(db)).map((r) => r.matchId));
    // Candidates: resolved fixtures that have kicked off and have no result recorded yet. A
    // placeholder knockout has no real teams, so it's excluded (and can't match an ESPN result) —
    // until the bracket sync fills its teams into the overlay, after which its result auto-records.
    const candidates = (await getResolvedMatches(db)).filter(
        (m) => hasResolvedTeams(m, TEAMS) && Date.parse(m.kickoffUtc) <= now && !recorded.has(m.id),
    );
    if (candidates.length === 0) return { processed: 0, written: 0, skipped: 0 };

    const dates = candidates.map((m) => espnDateFromKickoff(m.kickoffUtc)).sort();
    const records = await results(shiftYmd(dates[0]!, -1), shiftYmd(dates[dates.length - 1]!, 1));
    const byPair = new Map(records.map((r) => [teamPairKey(r.homeTeamCode, r.awayTeamCode), r]));

    let written = 0;
    let skipped = 0;
    for (const match of candidates) {
        const rec = byPair.get(teamPairKey(match.homeTeamId, match.awayTeamId));
        if (!rec) {
            skipped++; // not finished on ESPN yet — a later sync will pick it up
            continue;
        }
        const { score, firstScorer } = alignToOurOrientation(match, rec);
        await resultsRepo.upsert(db, { matchId: match.id, score, firstScorer, source: 'AUTO' });
        written++;
    }

    return { processed: candidates.length, written, skipped };
}
