/**
 * Public read routes for game-scoped state: leaderboard and per-match prediction grid.
 *
 * - `GET /games/:id/leaderboard` — computed on every request from current results +
 *   predictions. Sorted by total points (see `shared/scoring.ts`).
 * - `GET /games/:id/predictions/:matchId` — visible only after the match's kickoff.
 *   Returns every player's prediction + the actual result if recorded.
 */

import { Hono } from 'hono';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { resultsRepo } from '@api/repos/results';
import { computeLeaderboard, determineChampion } from '@shared/scoring';
import { resolveBracket } from '@shared/bracket';
import { MATCHES, TEAMS } from '@data/tournament';
import type { AppEnv } from '@api/types';
import type { MatchId, Score } from '@shared/types';

const MATCH_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));
const MATCH_LOOKUP = new Map(MATCHES.map((m): [string, { id: string; phase: typeof m.phase }] => [m.id, { id: m.id, phase: m.phase }]));

export const leaderboardRoutes = new Hono<AppEnv>();

leaderboardRoutes.get('/games/:id/leaderboard', async (c) => {
    const gameId = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(gameId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid game id' } }, 400);
    }
    const game = await gamesRepo.findById(c.env.DB, gameId);
    if (!game) return c.json({ error: { code: 'NOT_FOUND', message: 'game not found' } }, 404);
    const players = await playersRepo.listByGame(c.env.DB, gameId);
    const predictions = await predictionsRepo.findAllForGame(c.env.DB, gameId);
    const allResults = await resultsRepo.findAll(c.env.DB);
    const resultsMap = new Map<MatchId, Score>(allResults.map((r) => [r.matchId, r.score]));
    const bracket = resolveBracket(TEAMS, MATCHES, resultsMap);
    const actualChampionTeamId = determineChampion(bracket.get('M104'), resultsMap.get('M104'));
    const rows = computeLeaderboard(players, predictions, resultsMap, MATCH_LOOKUP, actualChampionTeamId);

    return c.json({ rows });
});

leaderboardRoutes.get('/games/:id/predictions/:matchId', async (c) => {
    const gameId = Number.parseInt(c.req.param('id'), 10);
    const matchId = c.req.param('matchId');
    if (!Number.isFinite(gameId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid game id' } }, 400);
    }
    const match = MATCH_BY_ID.get(matchId);
    if (!match) return c.json({ error: { code: 'NOT_FOUND', message: 'match not found' } }, 404);
    if (c.var.clock() < Date.parse(match.kickoffUtc)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'predictions visible after kickoff' } }, 403);
    }
    const game = await gamesRepo.findById(c.env.DB, gameId);
    if (!game) return c.json({ error: { code: 'NOT_FOUND', message: 'game not found' } }, 404);
    const players = await playersRepo.listByGame(c.env.DB, gameId);
    const playerById = new Map(players.map((p) => [p.id, p]));
    const allPredictions = await predictionsRepo.findByMatch(c.env.DB, matchId);
    const inGame = allPredictions.filter((p) => playerById.has(p.playerId));
    const result = await resultsRepo.findById(c.env.DB, matchId);

    return c.json({
        predictions: inGame.map((p) => ({
            playerId: p.playerId,
            displayName: playerById.get(p.playerId)!.displayName,
            score: p.score,
        })),
        result: result?.score ?? null,
    });
});

