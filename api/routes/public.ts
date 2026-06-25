/**
 * Public read-only routes — no auth required.
 *
 * - `GET /api/games` — list of games (id + name only; password hash is never exposed).
 * - `GET /api/tournament` — tournament data (teams, fixtures with any resolved knockout teams
 *   merged in from the overlay, first kickoff).
 * - `GET /api/results` — every recorded match result (score + first scorer). Global, not secret:
 *   a result only exists once the admin records it after a match, so there's nothing to leak.
 */

import { Hono } from 'hono';
import { gamesRepo } from '@api/repos/games';
import { resultsRepo } from '@api/repos/results';
import { getResolvedMatches } from '@api/resolved-matches';
import { TEAMS, FIRST_KICKOFF_UTC } from '@data/tournament';
import type { AppEnv } from '@api/types';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/games', async (c) => {
    const games = await gamesRepo.listAll(c.env.DB);

    return c.json({ games: games.map((g) => ({ id: g.id, name: g.name })) });
});

publicRoutes.get('/tournament', async (c) =>
    c.json({ teams: TEAMS, matches: await getResolvedMatches(c.env.DB), firstKickoffUtc: FIRST_KICKOFF_UTC }),
);

publicRoutes.get('/results', async (c) => {
    const results = await resultsRepo.findAll(c.env.DB);

    return c.json({
        results: results.map((r) => ({
            matchId: r.matchId,
            home: r.score.home,
            away: r.score.away,
            firstScorer: r.firstScorer ?? null,
        })),
    });
});
