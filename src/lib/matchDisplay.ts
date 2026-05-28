/** Display helpers for matches — shared by the Groups, Knockouts, My picks, and Admin views. */

import { isGroupMatch } from '@shared/phases';
import { flagEmoji } from '@data/flags';
import type { BracketSlot, Match, Team } from '@shared/types';

/** One side of a match for display: a name (team or slot label) and, for known teams, a flag emoji. */
export type MatchSide = { name: string; flag?: string };

/** Human-readable label for an unresolved knockout slot (e.g., "Winner of Group A"). */
export function slotLabel(slot: BracketSlot): string {
    switch (slot.kind) {
        case 'GROUP_WINNER':
            return `Winner of Group ${slot.group}`;
        case 'GROUP_RUNNER_UP':
            return `Runner-up of Group ${slot.group}`;
        case 'BEST_THIRD_OF':
            return `Best 3rd from ${slot.eligibleGroups.join('/')}`;
        case 'KNOCKOUT_WINNER':
            return `Winner of ${slot.matchId}`;
        case 'KNOCKOUT_LOSER':
            return `Loser of ${slot.matchId}`;
    }
}

/**
 * The two sides of a match for display: team names + flags for a group match, slot labels
 * (e.g., "Winner of Group A") with no flag for a knockout whose teams aren't resolved yet.
 */
export function matchSides(match: Match, teams: ReadonlyArray<Team>): { home: MatchSide; away: MatchSide } {
    if (isGroupMatch(match)) {
        const side = (id: string): MatchSide => ({ name: teams.find((t) => t.id === id)?.name ?? id, flag: flagEmoji(id) });

        return { home: side(match.homeTeamId), away: side(match.awayTeamId) };
    }

    return { home: { name: slotLabel(match.homeSlot) }, away: { name: slotLabel(match.awaySlot) } };
}
