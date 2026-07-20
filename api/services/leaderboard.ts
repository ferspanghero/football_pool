/**
 * Leaderboard computation service — loads a game's players, predictions, results, and boosts and
 * folds them into sorted {@link LeaderboardRow}s via `computeLeaderboard`.
 *
 * Extracted from the leaderboard route so the HTTP route and the MCP `get_leaderboard` tool share
 * one computation and never drift. Callers own existence checks (the route returns 404 for an
 * unknown game); this assumes a valid `gameId`.
 */

import { boostsRepo } from '@api/repos/boosts';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { resultsRepo } from '@api/repos/results';
import { computeLeaderboard, determineChampion } from '@shared/scoring';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import { log } from '@api/log';
import { CHAMPION, MATCHES } from '@data/tournament';
import type { FirstScorer, LeaderboardRow, MatchId, PhaseId, Score } from '@shared/types';

const FINAL_MATCH_ID = 'M104';
const FINAL_MATCH = MATCHES.find((m) => m.id === FINAL_MATCH_ID)!;
const MATCH_LOOKUP = new Map(MATCHES.map((m): [string, { id: string; phase: PhaseId }] => [m.id, { id: m.id, phase: m.phase }]));

/** One-shot latch so a misconfigured champion logs once per isolate, not once per request. */
let warnedUnmatchedChampion = false;

/** Compute the sorted leaderboard rows for a game from current predictions, results, and boosts. */
export async function loadLeaderboard(db: D1Database, gameId: number): Promise<LeaderboardRow[]> {
    const players = await playersRepo.listByGame(db, gameId);
    const predictions = await predictionsRepo.findAllForGame(db, gameId);
    const allResults = await resultsRepo.findAll(db);
    const resultsMap = new Map<MatchId, Score>(allResults.map((r) => [r.matchId, r.score]));
    const firstScorerMap = new Map<MatchId, FirstScorer>();
    for (const r of allResults) {
        if (r.firstScorer) firstScorerMap.set(r.matchId, r.firstScorer);
    }
    const allBoosts = await boostsRepo.findAllForGame(db, gameId);
    const boostsByPlayer = new Map<number, Map<PhaseId, MatchId>>();
    for (const b of allBoosts) {
        const byPhase = boostsByPlayer.get(b.playerId) ?? new Map<PhaseId, MatchId>();
        byPhase.set(b.phaseId, b.matchId);
        boostsByPlayer.set(b.playerId, byPhase);
    }
    // Validate the configured champion against the Final's *resolved* teams (the overlay fills M104
    // once the bracket reaches it); placeholder labels would never match a real champion id. Only the
    // Final's teams are needed, so an indexed overlay lookup beats building the whole resolved list
    // on this hot read path.
    const finalOverride = await knockoutTeamsRepo.findById(db, FINAL_MATCH_ID);
    const actualChampionTeamId = determineChampion(finalOverride ?? FINAL_MATCH, CHAMPION);
    // A champion that fails validation awards nobody the bonus, and the only symptom is a
    // leaderboard that looks subtly low — surface the misconfiguration rather than swallowing it.
    // Only a *resolved* Final proves a genuine mismatch: an unresolved one is the expected state
    // until the bracket sync reaches M104. This sits on an unauthenticated read path, so the warn
    // is one-shot per isolate — enough to diagnose, without a log line per request.
    if (CHAMPION !== undefined && actualChampionTeamId === undefined && finalOverride !== undefined && !warnedUnmatchedChampion) {
        warnedUnmatchedChampion = true;
        log.warn('configured champion is not one of the Final\'s resolved teams', {
            champion: CHAMPION,
            finalMatchId: FINAL_MATCH_ID,
        });
    }

    return computeLeaderboard(
        players,
        predictions,
        resultsMap,
        MATCH_LOOKUP,
        actualChampionTeamId,
        firstScorerMap,
        boostsByPlayer,
    );
}
