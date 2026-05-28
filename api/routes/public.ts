/**
 * Public read-only routes — no auth required.
 *
 * - `GET /api/games` — list of games (id + name only; password hash is never exposed).
 * - `GET /api/tournament` — the static tournament data (teams, matches, first kickoff).
 */

import { Hono } from 'hono';
import { gamesRepo } from '@api/repos/games';
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
