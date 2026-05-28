/**
 * Tournament phases as first-class entities. `PHASES` is the single source of truth for
 * phase order, display label, scoring multiplier, and group/knockout stage — consumers read
 * from it rather than maintaining parallel maps. Adding or reordering a phase touches only
 * this array.
 */

import type { GroupMatch, KnockoutMatch, Match, PhaseId, Stage } from '@shared/types';

/** A tournament phase and everything that is specific to it. */
export type Phase = {
    id: PhaseId;
    label: string;
    stage: Stage;
    /** Per-match base-point multiplier applied to predictions in this phase. */
    multiplier: number;
};

/** All phases in chronological order. The array order *is* the phase order. */
export const PHASES: readonly Phase[] = [
    { id: 'GROUP_R1', label: 'Group Stage — Round 1', stage: 'GROUP', multiplier: 1 },
    { id: 'GROUP_R2', label: 'Group Stage — Round 2', stage: 'GROUP', multiplier: 1 },
    { id: 'GROUP_R3', label: 'Group Stage — Round 3', stage: 'GROUP', multiplier: 1 },
    { id: 'R32', label: 'Round of 32', stage: 'KNOCKOUT', multiplier: 2 },
    { id: 'R16', label: 'Round of 16', stage: 'KNOCKOUT', multiplier: 3 },
    { id: 'QF', label: 'Quarter-finals', stage: 'KNOCKOUT', multiplier: 4 },
    { id: 'SF', label: 'Semi-finals', stage: 'KNOCKOUT', multiplier: 5 },
    { id: 'THIRD', label: '3rd-place playoff', stage: 'KNOCKOUT', multiplier: 5 },
    { id: 'FINAL', label: 'Final', stage: 'KNOCKOUT', multiplier: 6 },
];

const PHASE_BY_ID = new Map<PhaseId, Phase>(PHASES.map((p) => [p.id, p]));

/** Look up a phase by id. */
export function phaseById(id: PhaseId): Phase {
    const phase = PHASE_BY_ID.get(id);
    /* v8 ignore next */
    if (!phase) throw new Error(`Unknown phase id: ${id}`);

    return phase;
}

/** Position of a phase in the chronological sequence (0-based). */
export function phaseOrder(id: PhaseId): number {
    return PHASES.findIndex((p) => p.id === id);
}

/** Type guard: a group-stage match (carries concrete `homeTeamId`/`awayTeamId`). */
export function isGroupMatch(match: Match): match is GroupMatch {
    return phaseById(match.phase).stage === 'GROUP';
}

/** Type guard: a knockout match (carries `homeSlot`/`awaySlot` resolved from results). */
export function isKnockoutMatch(match: Match): match is KnockoutMatch {
    return !isGroupMatch(match);
}

/** A phase paired with its matches (kickoff-ascending). */
export type PhaseGroup = { phase: Phase; matches: Match[] };

/**
 * Bucket matches into phases, in chronological phase order, dropping phases with no matches.
 * One O(matches) pass; callers memoize it.
 */
export function buildPhaseGroups(matches: ReadonlyArray<Match>): PhaseGroup[] {
    return PHASES.map((phase) => ({
        phase,
        matches: matches
            .filter((m) => m.phase === phase.id)
            .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)),
    })).filter((group) => group.matches.length > 0);
}

/**
 * Index of the phase to show by default: the first phase whose last match has not yet kicked
 * off (i.e. still has something to predict). Falls back to the last phase once everything has
 * started.
 */
export function currentPhaseIndex(groups: ReadonlyArray<PhaseGroup>, nowMs: number): number {
    const index = groups.findIndex((group) => {
        const lastKickoff = Math.max(...group.matches.map((m) => Date.parse(m.kickoffUtc)));

        return lastKickoff >= nowMs;
    });

    return index === -1 ? Math.max(0, groups.length - 1) : index;
}
