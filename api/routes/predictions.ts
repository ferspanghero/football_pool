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
import { boostsRepo } from '@api/repos/boosts';
import { requirePlayer } from '@api/middleware';
import { isValidGoal, MAX_GOALS, parseFirstScorer, readJson } from '@api/http';
import { hasResolvedTeams, phaseFirstKickoffUtc, PHASES } from '@shared/phases';
import { MATCHES, FIRST_KICKOFF_UTC, TEAMS } from '@data/tournament';
import type { AppEnv } from '@api/types';
import type { PhaseId } from '@shared/types';

const MATCH_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));
const VALID_PHASE_IDS = new Set<string>(PHASES.map((p) => p.id));

export const predictionRoutes = new Hono<AppEnv>();

predictionRoutes.put('/me/predictions/:matchId', requirePlayer, async (c) => {
    const matchId = c.req.param('matchId');
    const match = MATCH_BY_ID.get(matchId);
    if (!match) return c.json({ error: { code: 'NOT_FOUND', message: 'match not found' } }, 404);
    if (!hasResolvedTeams(match, TEAMS)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'match teams not assigned yet' } }, 403);
    }
    if (c.var.clock() >= Date.parse(match.kickoffUtc)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'prediction locked at kickoff' } }, 403);
    }
    const body = await readJson<{ homeGoals?: unknown; awayGoals?: unknown; firstScorer?: unknown }>(c.req.raw);
    if (!isValidGoal(body?.homeGoals) || !isValidGoal(body?.awayGoals)) {
        return c.json(
            { error: { code: 'VALIDATION', message: `homeGoals/awayGoals must be integers in [0, ${MAX_GOALS}]` } },
            400,
        );
    }
    // Players pick a side or nothing — they can't bet on a goalless draw (NONE is admin-only,
    // recorded as the actual to penalize a side pick on a 0-0).
    const firstScorer = parseFirstScorer(body?.firstScorer);
    if (firstScorer === 'INVALID' || firstScorer === 'NONE') {
        return c.json({ error: { code: 'VALIDATION', message: 'firstScorer must be HOME or AWAY' } }, 400);
    }
    const playerId = c.var.playerId!;
    await predictionsRepo.upsert(c.env.DB, {
        playerId,
        matchId,
        score: { home: body.homeGoals, away: body.awayGoals },
        firstScorer,
    });

    return c.json({ ok: true });
});

predictionRoutes.put('/me/boosts/:phaseId', requirePlayer, async (c) => {
    const phaseId = c.req.param('phaseId');
    if (!VALID_PHASE_IDS.has(phaseId)) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'unknown phase' } }, 404);
    }
    // The boost for a phase is committed once that phase's first match kicks off.
    const firstKickoff = phaseFirstKickoffUtc(MATCHES, phaseId as PhaseId);
    if (firstKickoff !== undefined && c.var.clock() >= Date.parse(firstKickoff)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'boost locked at phase first kickoff' } }, 403);
    }
    const body = await readJson<{ matchId?: unknown }>(c.req.raw);
    const playerId = c.var.playerId!;
    // A null/absent matchId clears the phase's boost.
    if (body?.matchId === null || body?.matchId === undefined) {
        await boostsRepo.clear(c.env.DB, playerId, phaseId as PhaseId);

        return c.json({ ok: true });
    }
    const match = typeof body.matchId === 'string' ? MATCH_BY_ID.get(body.matchId) : undefined;
    if (!match || match.phase !== phaseId) {
        return c.json({ error: { code: 'VALIDATION', message: 'match does not belong to this phase' } }, 400);
    }
    await boostsRepo.set(c.env.DB, { playerId, phaseId: phaseId as PhaseId, matchId: match.id });

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
