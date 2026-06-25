/**
 * Player prediction routes — all require an active player session. Thin HTTP adapters over the
 * write services in `api/services/predictions.ts`, which own the locks and validation (shared with
 * the MCP tools).
 *
 * - `PUT /me/predictions/:matchId` — body `{ homeGoals, awayGoals, firstScorer? }`. Rejected once the
 *   match's kickoff has passed (server clock authoritative).
 * - `PUT /me/boosts/:phaseId` — body `{ matchId }` (null clears). The boost may target any match in
 *   the phase that has not yet kicked off; it locks once the boosted match itself kicks off.
 * - `PUT /me/champion` — body `{ teamId }`. Rejected once the tournament's first kickoff has passed.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { requirePlayer } from '@api/middleware';
import { readJson } from '@api/http';
import { setBoost, setChampion, submitPrediction, type ServiceErrorCode, type ServiceResult } from '@api/services/predictions';
import type { AppEnv } from '@api/types';

/** HTTP status for each service error category. */
const STATUS: Record<ServiceErrorCode, 400 | 403 | 404> = { VALIDATION: 400, FORBIDDEN: 403, NOT_FOUND: 404 };

/** Map a service result onto the standard `{ ok }` / `{ error }` HTTP envelope. */
function respond(c: Context<AppEnv>, result: ServiceResult): Response {
    if (result.ok) return c.json({ ok: true });

    return c.json({ error: result.error }, STATUS[result.error.code]);
}

export const predictionRoutes = new Hono<AppEnv>();

predictionRoutes.put('/me/predictions/:matchId', requirePlayer, async (c) => {
    const body = await readJson<{ homeGoals?: unknown; awayGoals?: unknown; firstScorer?: unknown }>(c.req.raw);
    const result = await submitPrediction(c.env.DB, c.var.clock(), {
        playerId: c.var.playerId!,
        matchId: c.req.param('matchId'),
        homeGoals: body?.homeGoals,
        awayGoals: body?.awayGoals,
        firstScorer: body?.firstScorer,
    });

    return respond(c, result);
});

predictionRoutes.put('/me/boosts/:phaseId', requirePlayer, async (c) => {
    const body = await readJson<{ matchId?: unknown }>(c.req.raw);
    const result = await setBoost(c.env.DB, c.var.clock(), {
        playerId: c.var.playerId!,
        phaseId: c.req.param('phaseId'),
        matchId: body?.matchId,
    });

    return respond(c, result);
});

predictionRoutes.put('/me/champion', requirePlayer, async (c) => {
    const body = await readJson<{ teamId?: unknown }>(c.req.raw);
    const result = await setChampion(c.env.DB, c.var.clock(), {
        playerId: c.var.playerId!,
        teamId: body?.teamId,
    });

    return respond(c, result);
});
