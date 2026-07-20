/**
 * Shared domain types. Used by both the Worker API and the frontend.
 */

/**
 * Tournament phase ids. Group rounds are first-class phases alongside the knockout stages.
 * Per-phase metadata (label, scoring multiplier, ordering, group/knockout stage) lives on the
 * `Phase` entity in `shared/phases.ts`, keyed by these ids.
 */
export type PhaseId = 'GROUP_R1' | 'GROUP_R2' | 'GROUP_R3' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL';

/** Group vs knockout — the single source of this distinction, carried by the `Phase` entity. */
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
 * A single fixture in the tournament.
 *
 * Group matches always reference real teams. Knockout matches start with **placeholder** ids
 * (e.g. `"Winner of Group A"`, `"Best 3rd from A/B/C/D/F"`) and are filled in with the actual
 * team ids by editing `data/tournament.ts` once each round's pairings are known — there is no
 * automatic standings/bracket resolution. A knockout match is "resolved" (and predictable) once
 * both ids are real teams; see `hasResolvedTeams` in `shared/phases.ts`.
 */
export type Match = {
    id: MatchId;
    phase: PhaseId;
    /** ISO 8601 UTC timestamp. Predictions for this match lock at this time. */
    kickoffUtc: string;
    /** Real `TeamId` once known; a placeholder label while a knockout pairing is undecided. */
    homeTeamId: TeamId;
    awayTeamId: TeamId;
    /** Set for group-stage matches only. */
    group?: GroupLetter;
};

/** Final score at the end of 90 minutes (extra time / penalties are not counted). */
export type Score = {
    home: number;
    away: number;
};

/**
 * Which side scored the first goal of a match — the basis of the first-to-score bonus (BL6).
 * `NONE` means the match ended 0-0 (no goal at all). Not derivable from the 90-minute score
 * (a 2-1 could have started either way), so it is recorded alongside the result.
 */
export type FirstScorer = 'HOME' | 'AWAY' | 'NONE';

/**
 * Provenance of a recorded result (BL4). `AUTO` was written by the scheduled results sync;
 * `MANUAL` was entered or edited by an admin. The sync never overwrites a `MANUAL` row, so
 * hand-entered results always win.
 */
export type ResultSource = 'AUTO' | 'MANUAL';

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
    /** Optional first-to-score pick (BL6). Undefined when the player hasn't made one. */
    firstScorer?: FirstScorer | undefined;
};

/**
 * One row of the per-game leaderboard, sorted by descending `totalPoints`.
 *
 * The `*Points` breakdown columns are the weighted + boosted base-score points split into the three
 * **non-overlapping** reasons a prediction scored (see `breakdownMatch`). Every column reconciles
 * with the total:
 *
 *   `exactScorePoints + correctOutcomePoints + correctGoalDiffPoints + firstScorerPoints +
 *    championPoints === totalPoints`
 */
export type LeaderboardRow = {
    playerId: number;
    displayName: string;
    totalPoints: number;
    /** Points earned specifically for nailing the exact score (on top of outcome + goal diff). */
    exactScorePoints: number;
    /** Points earned for predicting the right outcome (winner or draw). */
    correctOutcomePoints: number;
    /** Points earned for predicting the right goal-difference magnitude. */
    correctGoalDiffPoints: number;
    /** Net first-to-score points (BL6): the sum of +/− bonuses, with boosted matches counted
     * doubled so this reconciles with `totalPoints`. */
    firstScorerPoints: number;
    /** The flat champion bonus (BL4) when the player picked the actual winner, else 0. Never
     * boosted — a boost doubles a match's contribution, and the champion pick isn't a match. */
    championPoints: number;
};
