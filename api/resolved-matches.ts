/**
 * Resolved-match view (v4) — the static tournament fixtures with the `knockout_teams` overlay merged
 * in. The static `data/tournament.ts` owns every fixture's id, phase, kickoff, and placeholder
 * labels; the overlay supplies the *real* team identities for a knockout fixture once they are known
 * (filled by the scheduled bracket sync from ESPN, or an admin override). Consumers that read team
 * identities — `/api/tournament`, the prediction lock, the results-sync match-up, the champion
 * check, and the MCP `list_matches` tool — should read this view, not the raw `MATCHES`. Consumers
 * that read only `phase`/`kickoff` (scoring, the boost lock) can keep using `MATCHES` directly.
 */

import { MATCHES } from '@data/tournament';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import type { Match, MatchId, TeamId } from '@shared/types';

/** Minimal shape of a team-identity override (a `KnockoutTeams` row satisfies it). */
export type TeamOverride = { matchId: MatchId; homeTeamId: TeamId; awayTeamId: TeamId };

/**
 * Pure merge: return each base fixture with its team ids replaced by a matching override, or
 * unchanged when none applies. Order and count mirror `matches`; inputs are never mutated.
 */
export function resolveMatches(matches: ReadonlyArray<Match>, overrides: ReadonlyArray<TeamOverride>): Match[] {
    const byId = new Map(overrides.map((o) => [o.matchId, o]));

    return matches.map((m) => {
        const o = byId.get(m.id);

        return o ? { ...m, homeTeamId: o.homeTeamId, awayTeamId: o.awayTeamId } : m;
    });
}

/** The static `MATCHES` with the persisted `knockout_teams` overlay applied. */
export async function getResolvedMatches(db: D1Database): Promise<Match[]> {
    return resolveMatches(MATCHES, await knockoutTeamsRepo.findAll(db));
}
