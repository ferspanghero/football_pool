/**
 * Admin routes — guarded by `requireAdmin`. Single admin password set via the
 * `ADMIN_PASSWORD_HASH` env var; no admin user table.
 *
 * Routes:
 * - `POST /admin/login` — body `{ password }`; sets `admin_session` cookie.
 * - `POST /admin/logout` — clears cookie.
 * - `POST /admin/games` — create a new game (`{ name, password }`).
 * - `DELETE /admin/games/:id` — remove a game and its players + predictions (results are global).
 * - `GET /admin/games/:id/players` — list a game's players (for the admin Players tab).
 * - `PUT /admin/results/:matchId` — record/overwrite a match's 90-minute score.
 * - `DELETE /admin/players/:id` — remove a player (cascade-deletes their predictions).
 */

import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { hashPassword, signCookie, verifyPassword } from '@api/crypto';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { resultsRepo } from '@api/repos/results';
import { requireAdmin } from '@api/middleware';
import { MATCHES } from '@data/tournament';
import type { AppEnv } from '@api/types';

const ADMIN_COOKIE = 'admin_session';
const ADMIN_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_GOALS = 99;
const MAX_GAME_NAME_LENGTH = 60;
const MATCH_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.post('/admin/login', async (c) => {
    const body = await readJson<{ password?: unknown }>(c.req.raw);
    const password = typeof body?.password === 'string' ? body.password : '';
    const ok = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH);
    if (!ok) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'wrong password' } }, 401);
    const exp = Math.floor(c.var.clock() / 1000) + ADMIN_COOKIE_MAX_AGE_SECONDS;
    const token = await signCookie({ admin: true, exp }, c.env.SESSION_SECRET);
    setCookie(c, ADMIN_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
    });

    return c.json({ ok: true });
});

adminRoutes.post('/admin/logout', (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: '/' });

    return c.json({ ok: true });
});

adminRoutes.get('/admin/whoami', requireAdmin, (c) => c.json({ admin: true }));

adminRoutes.post('/admin/games', requireAdmin, async (c) => {
    const body = await readJson<{ name?: unknown; password?: unknown }>(c.req.raw);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!name || name.length > MAX_GAME_NAME_LENGTH) {
        return c.json({ error: { code: 'VALIDATION', message: 'game name must be 1-60 characters' } }, 400);
    }
    if (!password) {
        return c.json({ error: { code: 'VALIDATION', message: 'password is required' } }, 400);
    }
    const existing = await gamesRepo.findByName(c.env.DB, name);
    if (existing) return c.json({ error: { code: 'VALIDATION', message: 'game name already taken' } }, 400);
    const passwordHash = await hashPassword(password);
    const game = await gamesRepo.create(c.env.DB, { name, passwordHash });

    return c.json({ game: { id: game.id, name: game.name } });
});

adminRoutes.put('/admin/results/:matchId', requireAdmin, async (c) => {
    const matchId = c.req.param('matchId');
    if (!MATCH_BY_ID.has(matchId)) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'match not found' } }, 404);
    }
    const body = await readJson<{ homeGoals?: unknown; awayGoals?: unknown }>(c.req.raw);
    if (!isValidGoal(body?.homeGoals) || !isValidGoal(body?.awayGoals)) {
        return c.json(
            { error: { code: 'VALIDATION', message: `homeGoals/awayGoals must be integers in [0, ${MAX_GOALS}]` } },
            400,
        );
    }
    await resultsRepo.upsert(c.env.DB, {
        matchId,
        score: { home: body.homeGoals, away: body.awayGoals },
    });

    return c.json({ ok: true });
});

adminRoutes.delete('/admin/games/:id', requireAdmin, async (c) => {
    const gameId = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(gameId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid game id' } }, 400);
    }
    await gamesRepo.delete(c.env.DB, gameId);

    return c.json({ ok: true });
});

adminRoutes.get('/admin/games/:id/players', requireAdmin, async (c) => {
    const gameId = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(gameId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid game id' } }, 400);
    }
    const players = await playersRepo.listByGame(c.env.DB, gameId);

    return c.json({
        players: players.map((p) => ({ id: p.id, displayName: p.displayName, championTeamId: p.championTeamId ?? null })),
    });
});

adminRoutes.delete('/admin/players/:id', requireAdmin, async (c) => {
    const playerId = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(playerId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid player id' } }, 400);
    }
    await playersRepo.delete(c.env.DB, playerId);

    return c.json({ ok: true });
});

function isValidGoal(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_GOALS;
}

async function readJson<T>(req: Request): Promise<T | undefined> {
    try {
        return (await req.json()) as T;
    } catch {
        return undefined;
    }
}
