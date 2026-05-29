/** Display helpers for matches — shared by the Groups, Knockouts, My picks, and Admin views. */

import { flagEmoji } from '@data/flags';
import type { Match, Team } from '@shared/types';

/** One side of a match for display: a name (team or placeholder label) and, for real teams, a flag. */
export type MatchSide = { name: string; flag?: string };

/**
 * The two sides of a match for display. A real team id resolves to its name + flag; an
 * unresolved knockout placeholder (e.g. "Winner of Group A") falls through to the label itself
 * with no flag.
 */
export function matchSides(match: Match, teams: ReadonlyArray<Team>): { home: MatchSide; away: MatchSide } {
    const side = (id: string): MatchSide => ({ name: teams.find((t) => t.id === id)?.name ?? id, flag: flagEmoji(id) });

    return { home: side(match.homeTeamId), away: side(match.awayTeamId) };
}
