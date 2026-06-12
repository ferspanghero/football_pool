/**
 * MCP server routes — the surface Claude Code (and other MCP clients) connect to.
 *
 * - `POST /mcp` — the JSON-RPC endpoint. Authenticated by `requireMcpPlayer` (bearer token);
 *   dispatches one message via `handleRpc`. Notifications get a bodyless 202.
 * - `GET /mcp` — 405: this server offers no server-initiated (SSE) stream, only request/response.
 * - `POST /mcp/token` — cookie-gated. Mints the long-lived bearer the browser "Connect your LLM"
 *   panel hands to the player to paste into `claude mcp add`. Same signed session as the cookie,
 *   scoped to the player + game, so it can only ever act as them.
 */

import { Hono } from 'hono';
import { signCookie } from '@api/crypto';
import { requireMcpPlayer, requirePlayer } from '@api/middleware';
import { handleRpc } from '@api/mcp/server';
import type { AppEnv } from '@api/types';

/** Bearer lifetime — matches the 60-day browser session cookie. */
const MCP_TOKEN_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;

export const mcpRoutes = new Hono<AppEnv>();

mcpRoutes.post('/mcp/token', requirePlayer, async (c) => {
    const exp = Math.floor(c.var.clock() / 1000) + MCP_TOKEN_MAX_AGE_SECONDS;
    const token = await signCookie({ sub: c.var.playerId!, gid: c.var.gameId!, exp }, c.env.SESSION_SECRET);

    return c.json({ token, expiresAt: new Date(exp * 1000).toISOString() });
});

mcpRoutes.get('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }));

mcpRoutes.post('/mcp', requireMcpPlayer, async (c) => {
    const raw = await c.req.text();
    const { status, body } = await handleRpc(raw, {
        db: c.env.DB,
        playerId: c.var.playerId!,
        gameId: c.var.gameId!,
        nowMs: c.var.clock(),
    });
    if (body === null) return c.body(null, status);

    return c.json(body, status);
});
