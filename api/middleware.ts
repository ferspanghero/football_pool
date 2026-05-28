/**
 * Hono middleware: per-request authentication and origin checks.
 *
 * - `requirePlayer` — gate routes that act on behalf of a logged-in player.
 * - `requireAdmin` — gate routes that mutate global state (game creation, result entry).
 * - `requireOrigin` — defense-in-depth CSRF guard for state-changing endpoints, on top of
 *   the SameSite=Strict cookie attribute.
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

/** Rejects requests whose `Origin` header does not match `DEPLOY_ORIGIN`. */
export const requireOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
    const origin = c.req.header('Origin');
    if (!origin || origin !== c.env.DEPLOY_ORIGIN) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'origin not allowed' } }, 403);
    }
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
