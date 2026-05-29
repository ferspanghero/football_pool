/**
 * Hono app factory. Builds and wires routes. The Worker entry point (`api/index.ts`)
 * exports the result of `buildApp()` as its default fetch handler.
 *
 * Accepts an optional `ClockProvider`. When provided, every request uses it (the unit-test
 * path); otherwise the app boots on the wall clock. In a test deployment
 * (`DEPLOYMENT_STAGE === 'TEST'`) the clock can be swapped at runtime via
 * `POST /api/admin/test/clock` — the seam E2E specs use to exercise kickoff locks.
 */

import { Hono } from 'hono';
import { FixedClockProvider, WallClockProvider, type ClockProvider, type ClockMode } from '@api/clock';
import { requireAdmin } from '@api/middleware';
import { readJson } from '@api/http';
import { publicRoutes } from '@api/routes/public';
import { authRoutes } from '@api/routes/auth';
import { predictionRoutes } from '@api/routes/predictions';
import { leaderboardRoutes } from '@api/routes/leaderboard';
import { adminRoutes } from '@api/routes/admin';
import type { AppEnv } from '@api/types';

export function buildApp(injectedClock?: ClockProvider): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    // Active clock for this app instance. Starts as the injected clock (unit tests) or the
    // wall clock, and may be swapped at runtime by the test-only endpoint below. `activeMode`
    // / `activeIso` mirror the runtime selection so the admin UI can read it back on reload.
    let activeClock: ClockProvider = injectedClock ?? WallClockProvider;
    let activeMode: ClockMode = 'REALTIME';
    let activeIso: string | undefined;

    app.use('*', async (c, next) => {
        c.set('clock', activeClock);
        await next();
    });

    // Test-only clock control. Double-gated: requires an admin session AND
    // `DEPLOYMENT_STAGE === 'TEST'`, so it is permanently 403 in production.
    app.get('/api/admin/test/clock', requireAdmin, (c) => {
        if (c.env.DEPLOYMENT_STAGE !== 'TEST') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'clock control is disabled' } }, 403);
        }

        return c.json({ mode: activeMode, iso: activeIso ?? null, nowMs: activeClock() });
    });

    app.post('/api/admin/test/clock', requireAdmin, async (c) => {
        if (c.env.DEPLOYMENT_STAGE !== 'TEST') {
            return c.json({ error: { code: 'FORBIDDEN', message: 'clock control is disabled' } }, 403);
        }
        const body = await readJson<{ mode?: unknown; iso?: unknown }>(c.req.raw);
        if (body?.mode !== 'REALTIME' && body?.mode !== 'FIXED') {
            return c.json({ error: { code: 'VALIDATION', message: "mode must be 'REALTIME' or 'FIXED'" } }, 400);
        }
        const mode: ClockMode = body.mode;
        if (mode === 'FIXED') {
            const iso = typeof body.iso === 'string' ? body.iso : '';
            try {
                activeClock = FixedClockProvider(iso);
            } catch {
                return c.json(
                    { error: { code: 'VALIDATION', message: 'FIXED clock requires a valid ISO 8601 timestamp' } },
                    400,
                );
            }
            activeMode = 'FIXED';
            activeIso = iso;

            return c.json({ mode, iso });
        }
        activeClock = WallClockProvider;
        activeMode = 'REALTIME';
        activeIso = undefined;

        return c.json({ mode });
    });

    app.route('/api', publicRoutes);
    app.route('/api', authRoutes);
    app.route('/api', predictionRoutes);
    app.route('/api', leaderboardRoutes);
    app.route('/api', adminRoutes);

    return app;
}
