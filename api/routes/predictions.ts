/**
 * Player prediction routes — all require an active player session.
 *
 * - `PUT /me/predictions/:matchId` — body `{ homeGoals, awayGoals }`. Rejected once the
 *   match's kickoff has passed (server clock authoritative).
 * - `PUT /me/champion` — body `{ teamId }`. Rejected once the tournament's first kickoff
 *   has passed.
 */

import { Hono } from 'hono';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { requirePlayer } from '@api/middleware';
import { MATCHES, FIRST_KICKOFF_UTC, TEAMS } from '@data/tournament';
import type { AppEnv } from '@api/types';

const MAX_GOALS = 99;
const MATCH_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));

export const predictionRoutes = new Hono<AppEnv>();

predictionRoutes.put('/me/predictions/:matchId', requirePlayer, async (c) => {
    const matchId = c.req.param('matchId');
    const match = MATCH_BY_ID.get(matchId);
    if (!match) return c.json({ error: { code: 'NOT_FOUND', message: 'match not found' } }, 404);
    if (c.var.clock() >= Date.parse(match.kickoffUtc)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'prediction locked at kickoff' } }, 403);
    }
    const body = await readJson<{ homeGoals?: unknown; awayGoals?: unknown }>(c.req.raw);
    if (!isValidGoal(body?.homeGoals) || !isValidGoal(body?.awayGoals)) {
        return c.json(
            { error: { code: 'VALIDATION', message: `homeGoals/awayGoals must be integers in [0, ${MAX_GOALS}]` } },
            400,
        );
    }
    const playerId = c.var.playerId!;
    await predictionsRepo.upsert(c.env.DB, {
        playerId,
        matchId,
        score: { home: body.homeGoals, away: body.awayGoals },
    });

    return c.json({ ok: true });
});

predictionRoutes.put('/me/champion', requirePlayer, async (c) => {
    if (c.var.clock() >= Date.parse(FIRST_KICKOFF_UTC)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'champion pick locked' } }, 403);
    }
    const body = await readJson<{ teamId?: unknown }>(c.req.raw);
    const teamId = typeof body?.teamId === 'string' ? body.teamId : '';
    if (!VALID_TEAM_IDS.has(teamId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'unknown teamId' } }, 400);
    }
    const playerId = c.var.playerId!;
    await playersRepo.setChampionTeamId(c.env.DB, playerId, teamId);

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
