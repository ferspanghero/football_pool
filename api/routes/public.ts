/**
 * Public read-only routes — no auth required.
 *
 * - `GET /api/games` — list of games (id + name only; password hash is never exposed).
 * - `GET /api/tournament` — the static tournament data (teams, matches, first kickoff).
 * - `GET /api/results` — every recorded match result (score + first scorer). Global, not secret:
 *   a result only exists once the admin records it after a match, so there's nothing to leak.
 */

import { Hono } from 'hono';
import { gamesRepo } from '@api/repos/games';
import { resultsRepo } from '@api/repos/results';
import { TEAMS, MATCHES, FIRST_KICKOFF_UTC } from '@data/tournament';
import type { AppEnv } from '@api/types';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/games', async (c) => {
    const games = await gamesRepo.listAll(c.env.DB);

    return c.json({ games: games.map((g) => ({ id: g.id, name: g.name })) });
});

publicRoutes.get('/tournament', (c) =>
    c.json({ teams: TEAMS, matches: MATCHES, firstKickoffUtc: FIRST_KICKOFF_UTC }),
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
