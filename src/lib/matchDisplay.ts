/** Display helpers for matches — shared by the Groups, Knockouts, My picks, and Admin views. */

import { isGroupMatch } from '@shared/phases';
import type { BracketSlot, Match, Team } from '@shared/types';

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
 * The two sides of a match as display strings: team names for a group match, slot labels
 * (e.g., "Winner of Group A") for a knockout whose teams aren't resolved yet.
 */
export function matchSides(match: Match, teams: ReadonlyArray<Team>): { home: string; away: string } {
    if (isGroupMatch(match)) {
        const name = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

        return { home: name(match.homeTeamId), away: name(match.awayTeamId) };
    }

    return { home: slotLabel(match.homeSlot), away: slotLabel(match.awaySlot) };
}
