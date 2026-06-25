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
 * - `POST /admin/sync-results` — run the sync now (knockout brackets then finished results).
 * - `GET /admin/knockout` — list knockout fixtures with their resolved teams + provenance (E2E/inspection).
 * - `PUT /admin/knockout/:matchId` — admin override of a knockout fixture's teams (MANUAL), before kickoff.
 * - `DELETE /admin/knockout/:matchId` — clear a knockout override (revert to the placeholder).
 * - `DELETE /admin/players/:id` — remove a player (cascade-deletes their predictions).
 */

import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { hashPassword, signCookie, verifyPassword } from '@api/crypto';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { resultsRepo } from '@api/repos/results';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import { requireAdmin } from '@api/middleware';
import { isValidGoal, MAX_GOALS, parseFirstScorer, readJson } from '@api/http';
import { runBracketSync, runResultsSync } from '@api/scheduled';
import { getResolvedMatches } from '@api/resolved-matches';
import { isKnockoutMatch } from '@shared/phases';
import { log } from '@api/log';
import { MATCHES, TEAMS } from '@data/tournament';
import type { AppEnv } from '@api/types';
import type { FirstScorer } from '@shared/types';

const ADMIN_COOKIE = 'admin_session';
const ADMIN_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_GAME_NAME_LENGTH = 60;
const MATCH_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));

/**
 * Whether an admin-recorded first scorer is consistent with the score: NONE iff 0-0, the lone
 * scorer for a one-sided result, or either side when both teams scored.
 */
function firstScorerMatchesScore(fs: FirstScorer, home: number, away: number): boolean {
    if (home === 0 && away === 0) return fs === 'NONE';
    if (away === 0) return fs === 'HOME';
    if (home === 0) return fs === 'AWAY';

    return fs === 'HOME' || fs === 'AWAY';
}

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

adminRoutes.get('/admin/results', requireAdmin, async (c) => {
    const results = await resultsRepo.findAll(c.env.DB);

    return c.json({
        results: results.map((r) => ({
            matchId: r.matchId,
            home: r.score.home,
            away: r.score.away,
            firstScorer: r.firstScorer ?? null,
            source: r.source,
        })),
        // Authoritative server clock at fetch time — lets the Results panel default to the current
        // phase (the one still in play) against the same clock the rest of the app locks on.
        nowMs: c.var.clock(),
    });
});

// Manually run the sync now (BL4 + v4) — the same job the hourly cron runs, on demand, so an admin
// can resolve knockout brackets and pull finished results immediately. Runs the bracket pass first
// so a freshly-resolved knockout's result lands in the same call. Bypasses the tournament-window
// guard (an explicit action) but otherwise behaves identically: AUTO writes never overwrite a MANUAL
// row. Path kept as `sync-results` for compatibility; the button is labeled "Sync now".
adminRoutes.post('/admin/sync-results', requireAdmin, async (c) => {
    try {
        const now = c.var.clock();
        const bracket = await runBracketSync(c.env, { now, ignoreWindow: true });
        const results = await runResultsSync(c.env, { now, ignoreWindow: true });
        log.info('manual sync', { bracket, results });

        return c.json({ bracket, results });
    } catch (err) {
        log.error('manual sync failed', { err: String(err) });

        return c.json({ error: { code: 'INTERNAL', message: 'sync failed' } }, 502);
    }
});

// List the knockout fixtures with their currently-resolved teams (overlay merged) and the row's
// provenance — `AUTO` (synced from ESPN), `MANUAL` (admin override), or null when still unresolved.
// Not consumed by the SPA (the Results tab edits teams inline via PUT); kept for the E2E cleanup
// helper and as an inspection endpoint.
adminRoutes.get('/admin/knockout', requireAdmin, async (c) => {
    const sourceByMatch = new Map((await knockoutTeamsRepo.findAll(c.env.DB)).map((o) => [o.matchId, o.source]));
    const resolved = await getResolvedMatches(c.env.DB);
    const knockout = resolved
        .filter(isKnockoutMatch)
        .map((m) => ({
            matchId: m.id,
            phase: m.phase,
            kickoffUtc: m.kickoffUtc,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            resolved: VALID_TEAM_IDS.has(m.homeTeamId) && VALID_TEAM_IDS.has(m.awayTeamId),
            source: sourceByMatch.get(m.id) ?? null,
        }));

    return c.json({ knockout });
});

// Admin override of a knockout fixture's teams (the MANUAL safety net) — wins over any AUTO sync.
// Allowed only before the match kicks off (teams are frozen once it has happened). Validates the ids
// are real, distinct teams; it deliberately does NOT enforce bracket-slot feasibility (which
// group/round a team could reach this slot from). This endpoint's whole purpose is to correct a
// wrong resolution, so over-validating would risk blocking a legitimate fix; the admin is trusted.
adminRoutes.put('/admin/knockout/:matchId', requireAdmin, async (c) => {
    const matchId = c.req.param('matchId');
    const match = MATCH_BY_ID.get(matchId);
    if (!match) return c.json({ error: { code: 'NOT_FOUND', message: 'match not found' } }, 404);
    if (!isKnockoutMatch(match)) {
        return c.json({ error: { code: 'VALIDATION', message: 'not a knockout match' } }, 400);
    }
    // Teams can only be edited before the match happens — once it has kicked off they're frozen.
    if (c.var.clock() >= Date.parse(match.kickoffUtc)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'teams locked at kickoff' } }, 403);
    }
    const body = await readJson<{ homeTeamId?: unknown; awayTeamId?: unknown }>(c.req.raw);
    const homeTeamId = typeof body?.homeTeamId === 'string' ? body.homeTeamId : '';
    const awayTeamId = typeof body?.awayTeamId === 'string' ? body.awayTeamId : '';
    if (!VALID_TEAM_IDS.has(homeTeamId) || !VALID_TEAM_IDS.has(awayTeamId)) {
        return c.json({ error: { code: 'VALIDATION', message: 'unknown team id' } }, 400);
    }
    if (homeTeamId === awayTeamId) {
        return c.json({ error: { code: 'VALIDATION', message: 'home and away teams must differ' } }, 400);
    }
    await knockoutTeamsRepo.upsert(c.env.DB, { matchId, homeTeamId, awayTeamId, source: 'MANUAL' });

    return c.json({ ok: true });
});

// Clear a knockout fixture's override, reverting it to the static placeholder (and re-eligible for
// the AUTO sync) — the undo for a mistaken resolution.
adminRoutes.delete('/admin/knockout/:matchId', requireAdmin, async (c) => {
    const matchId = c.req.param('matchId');
    if (!MATCH_BY_ID.has(matchId)) return c.json({ error: { code: 'NOT_FOUND', message: 'match not found' } }, 404);
    await knockoutTeamsRepo.clear(c.env.DB, matchId);

    return c.json({ ok: true });
});

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
    const body = await readJson<{ homeGoals?: unknown; awayGoals?: unknown; firstScorer?: unknown }>(c.req.raw);
    if (!isValidGoal(body?.homeGoals) || !isValidGoal(body?.awayGoals)) {
        return c.json(
            { error: { code: 'VALIDATION', message: `homeGoals/awayGoals must be integers in [0, ${MAX_GOALS}]` } },
            400,
        );
    }
    const firstScorer = parseFirstScorer(body?.firstScorer);
    if (firstScorer === 'INVALID') {
        return c.json({ error: { code: 'VALIDATION', message: 'firstScorer must be HOME, AWAY, or NONE' } }, 400);
    }
    // The recorded first scorer must agree with the score: NONE for a 0-0; the lone scorer for a
    // one-sided result; either side when both scored.
    if (firstScorer !== undefined && !firstScorerMatchesScore(firstScorer, body.homeGoals, body.awayGoals)) {
        return c.json(
            { error: { code: 'VALIDATION', message: 'firstScorer must match the recorded score' } },
            400,
        );
    }
    await resultsRepo.upsert(c.env.DB, {
        matchId,
        score: { home: body.homeGoals, away: body.awayGoals },
        firstScorer,
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
