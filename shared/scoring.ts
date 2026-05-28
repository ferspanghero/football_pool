/**
 * Pure scoring functions. Imported by both the Worker (for leaderboards) and the frontend
 * (for "what would I score" hints).
 */

import type {
    LeaderboardRow,
    Match,
    MatchId,
    PhaseId,
    Player,
    Prediction,
    Score,
    TeamId,
} from '@shared/types';
import { phaseById } from '@shared/phases';

/** Flat bonus applied when a player's championTeamId matches the actual winner of the Final. */
export const CHAMPION_BONUS = 20;

/**
 * Determine the tournament champion from the Final's resolved teams and 90-minute score.
 * Returns undefined if either input is missing or the Final ended in a draw at 90 minutes.
 */
export function determineChampion(
    finalMatchTeams: { homeTeamId: TeamId; awayTeamId: TeamId } | undefined,
    finalScore: Score | undefined,
): TeamId | undefined {
    if (!finalMatchTeams || !finalScore) return undefined;
    if (finalScore.home > finalScore.away) return finalMatchTeams.homeTeamId;
    if (finalScore.away > finalScore.home) return finalMatchTeams.awayTeamId;

    return undefined;
}

/** Per-match base points awarded by `scoreMatch`. */
export const POINTS = {
    EXACT: 7,
    OUTCOME_AND_GD: 5,
    OUTCOME_ONLY: 3,
    GD_ONLY: 2,
    WRONG: 0,
} as const;

/**
 * Compute the per-match base points a prediction earns.
 *
 * - Exact score → `POINTS.EXACT`
 * - Correct outcome + same absolute goal difference (inexact) → `POINTS.OUTCOME_AND_GD`
 * - Correct outcome only → `POINTS.OUTCOME_ONLY`
 * - Wrong outcome but same absolute goal difference → `POINTS.GD_ONLY`
 * - Otherwise → `POINTS.WRONG`
 *
 * The result must be multiplied by `PHASE_MULTIPLIER[phase]` to get the contribution to a player's total.
 */
export function scoreMatch(prediction: Score, actual: Score): number {
    if (prediction.home === actual.home && prediction.away === actual.away) return POINTS.EXACT;

    const predDiff = prediction.home - prediction.away;
    const actDiff = actual.home - actual.away;
    const outcomeRight = Math.sign(predDiff) === Math.sign(actDiff);
    const gdRight = Math.abs(predDiff) === Math.abs(actDiff);

    if (outcomeRight && gdRight) return POINTS.OUTCOME_AND_GD;
    if (outcomeRight) return POINTS.OUTCOME_ONLY;
    if (gdRight) return POINTS.GD_ONLY;

    return POINTS.WRONG;
}

/** Phase-weighted score. Equivalent to `scoreMatch(...) * phaseById(phase).multiplier`. */
export function scoreMatchWeighted(prediction: Score, actual: Score, phase: PhaseId): number {
    return scoreMatch(prediction, actual) * phaseById(phase).multiplier;
}

type MatchPhaseLookup = ReadonlyMap<MatchId, Pick<Match, 'id' | 'phase'>>;

/**
 * Build a sorted leaderboard for a game.
 *
 * Returns one row per player, sorted by:
 *   1. `totalPoints` (descending)
 *   2. `exactScoreCount` (descending) — tiebreak
 *   3. `correctOutcomeCount` (descending) — tiebreak
 *   4. `displayName` (ascending, case-insensitive) — final tiebreak
 *
 * Predictions whose match has no recorded result are skipped silently. The champion bonus
 * is applied only when `actualChampionTeamId` is provided AND matches the player's pick.
 */
export function computeLeaderboard(
    players: ReadonlyArray<Player>,
    predictions: ReadonlyArray<Prediction>,
    results: ReadonlyMap<MatchId, Score>,
    matchesById: MatchPhaseLookup,
    actualChampionTeamId: TeamId | undefined,
): LeaderboardRow[] {
    const byPlayer = new Map<number, Prediction[]>();
    for (const p of predictions) {
        const list = byPlayer.get(p.playerId) ?? [];
        list.push(p);
        byPlayer.set(p.playerId, list);
    }

    const rows: LeaderboardRow[] = players.map((player) => {
        let totalPoints = 0;
        let exactScoreCount = 0;
        let correctOutcomeCount = 0;
        const playerPredictions = byPlayer.get(player.id) ?? [];

        for (const pred of playerPredictions) {
            const actual = results.get(pred.matchId);
            if (actual === undefined) continue;
            const match = matchesById.get(pred.matchId);
            if (match === undefined) continue;

            const base = scoreMatch(pred.score, actual);
            totalPoints += base * phaseById(match.phase).multiplier;
            if (base === POINTS.EXACT) exactScoreCount++;

            const predDiff = pred.score.home - pred.score.away;
            const actDiff = actual.home - actual.away;
            if (Math.sign(predDiff) === Math.sign(actDiff)) correctOutcomeCount++;
        }

        if (actualChampionTeamId !== undefined && player.championTeamId === actualChampionTeamId) {
            totalPoints += CHAMPION_BONUS;
        }

        return {
            playerId: player.id,
            displayName: player.displayName,
            totalPoints,
            exactScoreCount,
            correctOutcomeCount,
        };
    });

    rows.sort((a, b) => {
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        if (a.exactScoreCount !== b.exactScoreCount) return b.exactScoreCount - a.exactScoreCount;
        if (a.correctOutcomeCount !== b.correctOutcomeCount) return b.correctOutcomeCount - a.correctOutcomeCount;
        return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    });

    return rows;
}
