/**
 * Player authentication routes.
 *
 * - `POST /games/:id/enter` — body `{ password, displayName }`. Verifies the game password,
 *   does a case-insensitive find-or-create on `players(game_id, display_name)`, sets a
 *   long-lived `player_session` cookie.
 * - `POST /auth/logout` — clears the cookie.
 * - `GET /me` — returns the current player, their predictions, and champion pick.
 */

import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { hashPassword, signCookie, verifyPassword } from '@api/crypto';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { requirePlayer } from '@api/middleware';
import type { AppEnv } from '@api/types';

const PLAYER_COOKIE = 'player_session';
const PLAYER_COOKIE_MAX_AGE_SECONDS = 60 * 24 * 60 * 60; // 60 days
const MAX_DISPLAY_NAME_LENGTH = 40;

// `hashPassword` is re-exported so tests / scripts that seed games can share the same
// hashing function as the production code path.
export { hashPassword };

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/games/:id/enter', async (c) => {
    const gameId = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(gameId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid game id' } }, 400);
    }
    const body = await readJson<{ password?: unknown; displayName?: unknown }>(c.req.raw);
    const password = typeof body?.password === 'string' ? body.password : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        return c.json(
            { error: { code: 'VALIDATION', message: 'display name must be 1-40 characters' } },
            400,
        );
    }
    const game = await gamesRepo.findById(c.env.DB, gameId);
    if (!game) return c.json({ error: { code: 'NOT_FOUND', message: 'game not found' } }, 404);
    const ok = await verifyPassword(password, game.passwordHash);
    if (!ok) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'wrong password' } }, 401);
    const player = await playersRepo.findOrCreate(c.env.DB, { gameId, displayName });
    const exp = Math.floor(c.var.clock() / 1000) + PLAYER_COOKIE_MAX_AGE_SECONDS;
    const token = await signCookie({ sub: player.id, gid: gameId, exp }, c.env.SESSION_SECRET);
    setCookie(c, PLAYER_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: PLAYER_COOKIE_MAX_AGE_SECONDS,
    });

    return c.json({ playerId: player.id, displayName: player.displayName, gameId });
});

authRoutes.post('/auth/logout', (c) => {
    deleteCookie(c, PLAYER_COOKIE, { path: '/' });

    return c.json({ ok: true });
});

authRoutes.get('/me', requirePlayer, async (c) => {
    const playerId = c.var.playerId!;
    const player = await playersRepo.findById(c.env.DB, playerId);
    if (!player) return c.json({ error: { code: 'NOT_FOUND', message: 'player not found' } }, 404);
    const predictions = await predictionsRepo.findByPlayer(c.env.DB, playerId);

    return c.json({
        playerId: player.id,
        gameId: player.gameId,
        displayName: player.displayName,
        championTeamId: player.championTeamId ?? null,
        predictions,
    });
});

async function readJson<T>(req: Request): Promise<T | undefined> {
    try {
        return (await req.json()) as T;
    } catch {
        return undefined;
    }
}
