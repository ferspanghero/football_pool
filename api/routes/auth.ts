/**
 * Player authentication routes.
 *
 * - `POST /games/:id/enter` — body `{ displayName, playerPassword, gamePassword? }`. Two paths:
 *   **login** if the name already exists in the game (verify the player's own password), or
 *   **signup** otherwise (verify the shared game password, then store the chosen player
 *   password). Either way it sets a long-lived `player_session` cookie. The shared game
 *   password is the join gate; it is not re-asked on a returning login.
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
import { readJson } from '@api/http';
import type { AppEnv } from '@api/types';

const PLAYER_COOKIE = 'player_session';
const PLAYER_COOKIE_MAX_AGE_SECONDS = 60 * 24 * 60 * 60; // 60 days
const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_PASSWORD_LENGTH = 200;

// `hashPassword` is re-exported so tests / scripts that seed games can share the same
// hashing function as the production code path.
export { hashPassword };

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/games/:id/enter', async (c) => {
    const gameId = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(gameId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'invalid game id' } }, 400);
    }
    const body = await readJson<{ displayName?: unknown; playerPassword?: unknown; gamePassword?: unknown }>(c.req.raw);
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const playerPassword = typeof body?.playerPassword === 'string' ? body.playerPassword : '';
    const gamePassword = typeof body?.gamePassword === 'string' ? body.gamePassword : '';
    if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        return c.json({ error: { code: 'VALIDATION', message: 'display name must be 1-40 characters' } }, 400);
    }
    if (!playerPassword || playerPassword.length > MAX_PASSWORD_LENGTH) {
        return c.json({ error: { code: 'VALIDATION', message: 'password must be 1-200 characters' } }, 400);
    }
    const game = await gamesRepo.findById(c.env.DB, gameId);
    if (!game) return c.json({ error: { code: 'NOT_FOUND', message: 'game not found' } }, 404);

    const existing = await playersRepo.findByName(c.env.DB, gameId, displayName);
    let player;
    if (existing) {
        // Login: verify the player's own password. The shared game password is not re-asked.
        if (!(await verifyPassword(playerPassword, existing.passwordHash))) {
            return c.json({ error: { code: 'UNAUTHENTICATED', message: 'incorrect password for that name' } }, 401);
        }
        player = existing;
    } else {
        // Signup: the shared game password is the gate to create a new player in this game.
        if (!(await verifyPassword(gamePassword, game.passwordHash))) {
            return c.json({ error: { code: 'UNAUTHENTICATED', message: 'wrong game password' } }, 401);
        }
        player = await playersRepo.create(c.env.DB, {
            gameId,
            displayName,
            passwordHash: await hashPassword(playerPassword),
        });
    }

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
        // Server clock, so the client locks against authoritative time (not the browser's).
        nowMs: c.var.clock(),
    });
});
