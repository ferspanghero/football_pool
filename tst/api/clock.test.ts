/**
 * Tests for the clock abstraction. The injected-clock path is exercised throughout the
 * routes test suites; this file specifically pins down the `WallClockProvider` default,
 * the `FixedClockProvider` factory, and the `POST /api/admin/test/clock` endpoint that
 * Playwright drives to control server time for lock/visibility E2E scenarios.
 */

import { describe, test, expect } from 'vitest';
import { WallClockProvider, FixedClockProvider } from '@api/clock';
import { buildApp } from '@api/app';
import { signCookie, hashPassword } from '@api/crypto';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { MATCHES } from '@data/tournament';
import { createTestDb } from './testdb';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
// 2100-01-01 in epoch seconds — minted cookies never expire regardless of the test clock.
const FAR_FUTURE_EXP = 4102444800;
const firstMatch = MATCHES.find((m) => m.id === 'G_A_1')!;

function baseEnv(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored', DEPLOY_ORIGIN: 'https://x' };
}

function testEnv(db: D1Database): AppEnv['Bindings'] {
    return { ...baseEnv(db), DEPLOYMENT_STAGE: 'TEST' };
}

async function adminCookie(): Promise<string> {
    return `admin_session=${await signCookie({ admin: true, exp: FAR_FUTURE_EXP }, SECRET)}`;
}

describe('WallClockProvider', () => {
    test('returns the wall-clock current time (within a few ms of Date.now)', () => {
        // Arrange, Act
        const before = Date.now();
        const value = WallClockProvider();
        const after = Date.now();

        // Assert
        expect(value).toBeGreaterThanOrEqual(before);
        expect(value).toBeLessThanOrEqual(after);
    });
});

describe('FixedClockProvider', () => {
    test('returns the parsed ISO timestamp on every call', () => {
        // Arrange
        const clock = FixedClockProvider('2026-06-11T19:00:00Z');
        const expected = Date.parse('2026-06-11T19:00:00Z');

        // Act, Assert
        expect(clock()).toBe(expected);
        expect(clock()).toBe(expected);
    });

    test('throws on an invalid ISO string', () => {
        // Arrange, Act, Assert
        expect(() => FixedClockProvider('not a timestamp')).toThrow();
    });
});

describe('POST /api/admin/test/clock', () => {
    function postClock(
        app: ReturnType<typeof buildApp>,
        body: unknown,
        opts: { cookie?: string; env: AppEnv['Bindings'] },
    ) {
        return app.request(
            '/api/admin/test/clock',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
                body: JSON.stringify(body),
            },
            opts.env,
        );
    }

    test('rejects requests without an admin cookie (401)', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await postClock(app, { mode: 'REALTIME' }, { env: testEnv(db) });

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects when DEPLOYMENT_STAGE is not TEST (403)', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act — admin is authenticated, but the deployment is not a test stage
        const res = await postClock(app, { mode: 'REALTIME' }, { cookie: await adminCookie(), env: baseEnv(db) });

        // Assert
        expect(res.status).toBe(403);
    });

    test('rejects an unknown clock mode (400)', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await postClock(app, { mode: 'WIBBLE' }, { cookie: await adminCookie(), env: testEnv(db) });

        // Assert
        expect(res.status).toBe(400);
    });

    test('rejects FIXED with an invalid ISO timestamp (400)', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await postClock(
            app,
            { mode: 'FIXED', iso: 'not-a-date' },
            { cookie: await adminCookie(), env: testEnv(db) },
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('a FIXED clock past kickoff locks predictions; REALTIME restores the wall clock', async () => {
        // Arrange — game + player, with a player cookie that never expires
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
        const player = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        const app = buildApp();
        const env = testEnv(db);
        const cookie = await adminCookie();
        const playerCookie = `player_session=${await signCookie({ sub: player.id, gid: game.id, exp: FAR_FUTURE_EXP }, SECRET)}`;
        const savePrediction = () =>
            app.request(
                `/api/me/predictions/${firstMatch.id}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', Cookie: playerCookie },
                    body: JSON.stringify({ homeGoals: 2, awayGoals: 1 }),
                },
                env,
            );

        // Act + Assert — default boot clock is wall-clock (today, before any 2026 kickoff): save allowed
        expect((await savePrediction()).status).toBe(200);

        // Flip to a FIXED clock just past kickoff → the same save now locks
        const fixed = await postClock(
            app,
            { mode: 'FIXED', iso: new Date(Date.parse(firstMatch.kickoffUtc) + 1).toISOString() },
            { cookie, env },
        );
        expect(fixed.status).toBe(200);
        expect((await savePrediction()).status).toBe(403);

        // Flip back to REALTIME → save allowed again
        const real = await postClock(app, { mode: 'REALTIME' }, { cookie, env });
        expect(real.status).toBe(200);
        expect((await savePrediction()).status).toBe(200);
    });
});

describe('GET /api/admin/test/clock', () => {
    function getClock(app: ReturnType<typeof buildApp>, opts: { cookie?: string; env: AppEnv['Bindings'] }) {
        return app.request(
            '/api/admin/test/clock',
            { headers: { ...(opts.cookie ? { Cookie: opts.cookie } : {}) } },
            opts.env,
        );
    }

    test('rejects requests without an admin cookie (401)', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await getClock(app, { env: testEnv(db) });

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects when DEPLOYMENT_STAGE is not TEST (403)', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await getClock(app, { cookie: await adminCookie(), env: baseEnv(db) });

        // Assert
        expect(res.status).toBe(403);
    });

    test('reports REALTIME with no timestamp by default', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await getClock(app, { cookie: await adminCookie(), env: testEnv(db) });
        const body = (await res.json()) as { mode: string; iso: string | null };

        // Assert
        expect(res.status).toBe(200);
        expect(body.mode).toBe('REALTIME');
        expect(body.iso).toBeNull();
    });

    test('reflects a FIXED clock previously set via POST', async () => {
        // Arrange — set a FIXED clock, then read it back on the same app instance
        const db = createTestDb();
        const app = buildApp();
        const env = testEnv(db);
        const cookie = await adminCookie();
        const iso = '2026-06-11T19:00:00Z';
        await app.request(
            '/api/admin/test/clock',
            { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ mode: 'FIXED', iso }) },
            env,
        );

        // Act
        const res = await getClock(app, { cookie, env });
        const body = (await res.json()) as { mode: string; iso: string | null };

        // Assert
        expect(body.mode).toBe('FIXED');
        expect(body.iso).toBe(iso);
    });
});
