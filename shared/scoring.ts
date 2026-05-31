/**
 * Pure scoring functions. Imported by both the Worker (for leaderboards) and the frontend
 * (for "what would I score" hints).
 */

import type {
    FirstScorer,
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
export const CHAMPION_BONUS = 100;

/** Base for the first-to-score bonus (BL6), before the phase multiplier is applied. */
export const FIRST_SCORER_BONUS = 2;

/**
 * Points for a first-to-score pick (BL6) — a risk/reward bet, phase-weighted:
 * `+FIRST_SCORER_BONUS × multiplier` when the pick matches the recorded actual, `−FIRST_SCORER_BONUS
 * × multiplier` when it is wrong. Returns 0 when the player made no pick or no actual was recorded
 * (both arrive as `undefined`) — no pick means no risk.
 */
export function scoreFirstScorer(
    pick: FirstScorer | undefined,
    actual: FirstScorer | undefined,
    phase: PhaseId,
): number {
    if (pick === undefined || actual === undefined) return 0;
    const weighted = FIRST_SCORER_BONUS * phaseById(phase).multiplier;

    return pick === actual ? weighted : -weighted;
}

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
 * Multiply by `phaseById(phase).multiplier` (or call `scoreMatchWeighted`) to get a prediction's
 * contribution to a player's total.
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

/** A single prediction's contribution to a match: total points, the first-scorer component (each
 * already doubled when the match is boosted, so they reconcile with the total), and the raw
 * (unweighted) base tier. Shared by `computeLeaderboard` and the My-picks per-row feedback so the
 * two never drift. */
export type PredictionScore = { points: number; firstScorerPoints: number; base: number };

/**
 * Score one prediction against a recorded result: weighted base + first-to-score bonus/penalty,
 * with the whole contribution doubled when the match is boosted (BL7). `firstScorerPoints` is the
 * first-to-score share of that total (boost included). `base` is the unweighted `scoreMatch` tier
 * (for exact-count tracking / UI labels).
 */
export function scorePrediction(
    prediction: Score,
    firstScorerPick: FirstScorer | undefined,
    actual: Score,
    firstScorerActual: FirstScorer | undefined,
    phase: PhaseId,
    boosted: boolean,
): PredictionScore {
    const factor = boosted ? 2 : 1;
    const base = scoreMatch(prediction, actual);
    const firstScorerPoints = scoreFirstScorer(firstScorerPick, firstScorerActual, phase) * factor;
    const points = base * phaseById(phase).multiplier * factor + firstScorerPoints;

    return { points, firstScorerPoints, base };
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
 *
 * Each scored match contributes `scoreMatch × phase multiplier`, plus the first-to-score bonus
 * (`scoreFirstScorer`) when both the player's pick and the recorded actual (`firstScorerActuals`)
 * are present and agree. A match a player boosted for its phase (`boostsByPlayer`) has its whole
 * contribution doubled (BL7). The flat champion bonus is separate and never boosted. The
 * tiebreaker counts (exact/outcome/goal-diff) track score accuracy only and ignore all bonuses.
 */
export function computeLeaderboard(
    players: ReadonlyArray<Player>,
    predictions: ReadonlyArray<Prediction>,
    results: ReadonlyMap<MatchId, Score>,
    matchesById: MatchPhaseLookup,
    actualChampionTeamId: TeamId | undefined,
    firstScorerActuals: ReadonlyMap<MatchId, FirstScorer> = new Map(),
    boostsByPlayer: ReadonlyMap<number, ReadonlyMap<PhaseId, MatchId>> = new Map(),
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
        let correctGoalDiffCount = 0;
        let firstScorerPoints = 0;
        const playerPredictions = byPlayer.get(player.id) ?? [];

        for (const pred of playerPredictions) {
            const actual = results.get(pred.matchId);
            if (actual === undefined) continue;
            const match = matchesById.get(pred.matchId);
            if (match === undefined) continue;

            // BL7: a player may boost one match per phase to double everything that match earns.
            const boosted = boostsByPlayer.get(player.id)?.get(match.phase) === pred.matchId;
            const scored = scorePrediction(
                pred.score,
                pred.firstScorer,
                actual,
                firstScorerActuals.get(pred.matchId),
                match.phase,
                boosted,
            );
            totalPoints += scored.points;
            firstScorerPoints += scored.firstScorerPoints;
            if (scored.base === POINTS.EXACT) exactScoreCount++;

            const predDiff = pred.score.home - pred.score.away;
            const actDiff = actual.home - actual.away;
            if (Math.sign(predDiff) === Math.sign(actDiff)) correctOutcomeCount++;
            if (Math.abs(predDiff) === Math.abs(actDiff)) correctGoalDiffCount++;
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
            correctGoalDiffCount,
            firstScorerPoints,
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
