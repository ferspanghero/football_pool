/**
 * Hono middleware: per-request authentication.
 *
 * - `requirePlayer` — gate routes that act on behalf of a logged-in player.
 * - `requireAdmin` — gate routes that mutate global state (game creation, result entry).
 *
 * CSRF is mitigated by the `SameSite=Strict` attribute on the session cookies.
 */

import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyCookie } from '@api/crypto';
import type { AppEnv } from '@api/types';

/** Reads `player_session` cookie; on success, sets `gameId` + `playerId` on the context. */
export const requirePlayer: MiddlewareHandler<AppEnv> = async (c, next) => {
    const token = getCookie(c, 'player_session');
    if (!token) return unauthenticated(c);
    const payload = await verifyCookie(token, c.env.SESSION_SECRET, c.var.clock());
    if (!isPlayerSession(payload)) return unauthenticated(c);
    c.set('gameId', payload.gid);
    c.set('playerId', payload.sub);
    await next();

    return undefined;
};

/**
 * Reads an `Authorization: Bearer <token>` header; on success, sets `gameId` + `playerId` on the
 * context. Used by the MCP endpoint, whose clients (e.g. Claude Code) send a header, not a cookie.
 * The token is the same HMAC-signed player session minted for the browser cookie — verified the
 * same way — so a stolen MCP token has exactly the authority of that one player in that one game.
 * Browser routes stay cookie-only, keeping their `SameSite` CSRF posture.
 */
export const requireMcpPlayer: MiddlewareHandler<AppEnv> = async (c, next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
    if (!token) return unauthenticated(c);
    const payload = await verifyCookie(token, c.env.SESSION_SECRET, c.var.clock());
    if (!isPlayerSession(payload)) return unauthenticated(c);
    c.set('gameId', payload.gid);
    c.set('playerId', payload.sub);
    await next();

    return undefined;
};

/** Reads `admin_session` cookie; on success, sets `admin: true` on the context. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
    const token = getCookie(c, 'admin_session');
    if (!token) return unauthenticated(c);
    const payload = await verifyCookie(token, c.env.SESSION_SECRET, c.var.clock());
    if (!isAdminSession(payload)) return unauthenticated(c);
    c.set('admin', true);
    await next();

    return undefined;
};

function unauthenticated(c: Parameters<MiddlewareHandler<AppEnv>>[0]) {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'authentication required' } }, 401);
}

function isPlayerSession(payload: unknown): payload is { sub: number; gid: number; exp: number } {
    return (
        typeof payload === 'object' &&
        payload !== null &&
        typeof (payload as Record<string, unknown>).sub === 'number' &&
        typeof (payload as Record<string, unknown>).gid === 'number'
    );
}

function isAdminSession(payload: unknown): payload is { admin: true; exp: number } {
    return typeof payload === 'object' && payload !== null && (payload as Record<string, unknown>).admin === true;
}
