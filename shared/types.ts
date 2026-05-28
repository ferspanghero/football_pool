/**
 * Shared domain types. Used by both the Worker API and the frontend.
 */

/**
 * Tournament phase ids. Group rounds are first-class phases alongside the knockout stages.
 * Per-phase metadata (label, scoring multiplier, ordering, group/knockout stage) lives on the
 * `Phase` entity in `shared/phases.ts`, keyed by these ids.
 */
export type PhaseId = 'GROUP_R1' | 'GROUP_R2' | 'GROUP_R3' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL';

/**
 * Group vs knockout — the single source of this distinction, carried by the `Phase` entity.
 * Group standings and knockout propagation are genuinely different algorithms (see bracket.ts).
 */
export type Stage = 'GROUP' | 'KNOCKOUT';

/** Group letter A-L. FIFA 2026 has 12 groups of 4. */
export type GroupLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

/** Stable identifier for a team (e.g., 3-letter FIFA code). */
export type TeamId = string;

/** Stable identifier for a match (e.g., `G_A_1`, `M73`, `FINAL`). */
export type MatchId = string;

export type Team = {
    id: TeamId;
    name: string;
    group: GroupLetter;
};

/**
 * Description of one side of a knockout match. The actual team is resolved at runtime
 * from match results — see `resolveBracket` in `shared/bracket.ts`.
 *
 * `BEST_THIRD_OF` lists the groups whose 3rd-placed team is a candidate for this slot,
 * per FIFA's published R32 mapping for the 48-team / 12-group format.
 */
export type BracketSlot =
    | { kind: 'GROUP_WINNER'; group: GroupLetter }
    | { kind: 'GROUP_RUNNER_UP'; group: GroupLetter }
    | { kind: 'BEST_THIRD_OF'; eligibleGroups: GroupLetter[] }
    | { kind: 'KNOCKOUT_WINNER'; matchId: MatchId }
    | { kind: 'KNOCKOUT_LOSER'; matchId: MatchId };

export type GroupMatch = {
    id: MatchId;
    phase: PhaseId;
    group: GroupLetter;
    /** ISO 8601 UTC timestamp. Predictions for this match lock at this time. */
    kickoffUtc: string;
    homeTeamId: TeamId;
    awayTeamId: TeamId;
};

export type KnockoutMatch = {
    id: MatchId;
    phase: PhaseId;
    /** ISO 8601 UTC timestamp. */
    kickoffUtc: string;
    homeSlot: BracketSlot;
    awaySlot: BracketSlot;
};

/** A single fixture in the tournament — either a group match or a knockout. */
export type Match = GroupMatch | KnockoutMatch;

/** Final score at the end of 90 minutes (extra time / penalties are not counted). */
export type Score = {
    home: number;
    away: number;
};

export type Player = {
    id: number;
    displayName: string;
    /** Player's one-shot pick for tournament winner. Locks at first kickoff. */
    championTeamId: TeamId | undefined;
};

export type Prediction = {
    playerId: number;
    matchId: MatchId;
    score: Score;
};

/** One row of the per-game leaderboard, sorted by descending `totalPoints`. */
export type LeaderboardRow = {
    playerId: number;
    displayName: string;
    totalPoints: number;
    exactScoreCount: number;
    correctOutcomeCount: number;
};
