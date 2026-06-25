/**
 * Scheduled bracket sync (v4) — resolves knockout fixtures' real teams from ESPN's scheduled feed
 * into the `knockout_teams` overlay, so an admin no longer hand-edits `data/tournament.ts` + redeploys.
 *
 * Each run: takes the knockout fixtures with no overlay row yet, fetches ESPN's scheduled fixtures
 * across the knockout date span, and maps each ESPN event to ours by **exact kickoff datetime**
 * (validated against the live schedule — ESPN's knockout dates and home/away orientation match ours).
 * A fixture is written (as `AUTO`) only once ESPN lists **both** sides as real teams; a side still on
 * a placeholder pseudo-code (`2A`, `1F`, `3RD`, …) is left for a later run. An `AUTO` write never
 * overwrites an admin `MANUAL` override. Already-resolved fixtures are skipped, so the sync is cheap
 * and idempotent — and once every knockout is resolved it does no ESPN fetch at all.
 *
 * Pure orchestration with the fixtures fetcher injected, so it is fully unit-tested.
 */

import { MATCHES, TEAMS } from '@data/tournament';
import { isKnockoutMatch } from '@shared/phases';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import { log } from '@api/log';
import { espnDateFromKickoff, shiftYmd, type EspnFixture } from '@api/providers/espn';
import { isWithinTournamentWindow } from '@api/sync-results';

/** Fetches scheduled fixtures across `[startDate, endDate]` (YYYYMMDD). */
export type FixturesFetcher = (startDate: string, endDate: string) => Promise<EspnFixture[]>;

export type BracketSyncDeps = {
    fixtures: FixturesFetcher;
    db: D1Database;
    /** Current time (ms) — the sync no-ops outside the tournament window unless `ignoreWindow`. */
    now: number;
    /** Bypass the window guard — used by the manual admin trigger, which is always intentional. */
    ignoreWindow?: boolean | undefined;
};

/** Counts from one bracket sync run, for logging. */
export type BracketSyncSummary = { processed: number; written: number; skipped: number };

const KNOCKOUT_MATCHES = MATCHES.filter(isKnockoutMatch);
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));

const NOOP: BracketSyncSummary = { processed: 0, written: 0, skipped: 0 };

/**
 * Run one bracket sync pass. Returns counts of what happened. No-ops (and skips all fetching)
 * outside the tournament window unless `ignoreWindow`, and once every knockout fixture is resolved.
 */
export async function syncBracket({ fixtures, db, now, ignoreWindow = false }: BracketSyncDeps): Promise<BracketSyncSummary> {
    if (!ignoreWindow && !isWithinTournamentWindow(now)) return NOOP;

    // Only fixtures still missing an overlay row are candidates; a resolved row (AUTO or a MANUAL
    // override) is left untouched.
    const resolved = new Set((await knockoutTeamsRepo.findAll(db)).map((r) => r.matchId));
    const pending = KNOCKOUT_MATCHES.filter((m) => !resolved.has(m.id));
    if (pending.length === 0) return NOOP;

    const dates = pending.map((m) => espnDateFromKickoff(m.kickoffUtc)).sort();
    const fetched = await fixtures(shiftYmd(dates[0]!, -1), shiftYmd(dates[dates.length - 1]!, 1));

    // Index fetched events by kickoff instant. Two events at one instant are ambiguous — we can't
    // tell which is ours — so flag the instant and skip it rather than silently last-write-wins.
    const byKickoff = new Map<number, EspnFixture>();
    const ambiguous = new Set<number>();
    for (const f of fetched) {
        const key = Date.parse(f.kickoffUtc);
        if (byKickoff.has(key)) ambiguous.add(key);
        byKickoff.set(key, f);
    }

    let written = 0;
    let skipped = 0;
    for (const match of pending) {
        const key = Date.parse(match.kickoffUtc);
        if (ambiguous.has(key)) {
            log.warn('bracket sync: ambiguous ESPN events at fixture kickoff', { matchId: match.id, kickoffUtc: match.kickoffUtc });
            skipped++;
            continue;
        }
        const fixture = byKickoff.get(key);
        if (!fixture) {
            // ESPN lists every knockout round (even with undecided teams), so a missing event — when
            // ESPN did return data — signals a schedule drift worth surfacing rather than an invisible
            // permanent skip. An empty feed is just an outage (the provider already logged it).
            if (byKickoff.size > 0) {
                log.warn('bracket sync: no ESPN event maps to fixture kickoff', { matchId: match.id, kickoffUtc: match.kickoffUtc });
            }
            skipped++;
            continue;
        }
        // Either side still a placeholder code → teams not decided yet; expected, so no warning.
        if (!VALID_TEAM_IDS.has(fixture.homeTeamCode) || !VALID_TEAM_IDS.has(fixture.awayTeamCode)) {
            skipped++;
            continue;
        }
        await knockoutTeamsRepo.upsert(db, {
            matchId: match.id,
            homeTeamId: fixture.homeTeamCode,
            awayTeamId: fixture.awayTeamCode,
            source: 'AUTO',
        });
        written++;
    }

    return { processed: pending.length, written, skipped };
}
