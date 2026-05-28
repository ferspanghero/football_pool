import { describe, test, expect } from 'vitest';
import { Hono } from 'hono';
import { requirePlayer, requireAdmin, requireOrigin } from '@api/middleware';
import { signCookie } from '@api/crypto';
import { WallClockProvider } from '@api/clock';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const ORIGIN = 'https://pool.example';

function buildApp(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    // Production wires the clock in `buildApp`; this test fixture mounts its own minimal
    // routes around the middleware under test, so we mirror that wiring here.
    app.use('*', async (c, next) => {
        c.set('clock', WallClockProvider);
        await next();
    });
    app.use('/player/*', requirePlayer);
    app.get('/player/me', (c) => c.json({ gameId: c.var.gameId, playerId: c.var.playerId }));
    app.use('/admin/*', requireAdmin);
    app.get('/admin/ping', (c) => c.json({ admin: c.var.admin }));
    app.use('/origin/*', requireOrigin);
    app.post('/origin/x', (c) => c.json({ ok: true }));

    return app;
}

function env(): AppEnv['Bindings'] {
    return {
        DB: {} as D1Database,
        SESSION_SECRET: SECRET,
        ADMIN_PASSWORD_HASH: 'ignored',
        DEPLOY_ORIGIN: ORIGIN,
    };
}

function nowSec(): number {
    return Math.floor(Date.now() / 1000);
}

describe('requirePlayer', () => {
    test('passes when a valid player_session cookie is present', async () => {
        // Arrange
        const app = buildApp();
        const token = await signCookie({ sub: 42, gid: 7, exp: nowSec() + 60 }, SECRET);

        // Act
        const res = await app.request('/player/me', { headers: { Cookie: `player_session=${token}` } }, env());

        // Assert
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ gameId: 7, playerId: 42 });
    });

    test('rejects with 401 when the cookie is missing', async () => {
        // Arrange
        const app = buildApp();

        // Act
        const res = await app.request('/player/me', {}, env());

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 401 when the cookie signature is tampered', async () => {
        // Arrange
        const app = buildApp();
        const token = await signCookie({ sub: 1, gid: 1, exp: nowSec() + 60 }, SECRET);
        const tampered = token.slice(0, -2) + 'XX';

        // Act
        const res = await app.request(
            '/player/me',
            { headers: { Cookie: `player_session=${tampered}` } },
            env(),
        );

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 401 when the cookie is expired', async () => {
        // Arrange
        const app = buildApp();
        const token = await signCookie({ sub: 1, gid: 1, exp: nowSec() - 1 }, SECRET);

        // Act
        const res = await app.request(
            '/player/me',
            { headers: { Cookie: `player_session=${token}` } },
            env(),
        );

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 401 when the payload is shaped like an admin session', async () => {
        // Arrange — wrong-shape payload (missing sub/gid)
        const app = buildApp();
        const token = await signCookie({ admin: true, exp: nowSec() + 60 }, SECRET);

        // Act
        const res = await app.request(
            '/player/me',
            { headers: { Cookie: `player_session=${token}` } },
            env(),
        );

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('requireAdmin', () => {
    test('passes when a valid admin_session cookie is present', async () => {
        // Arrange
        const app = buildApp();
        const token = await signCookie({ admin: true, exp: nowSec() + 60 }, SECRET);

        // Act
        const res = await app.request('/admin/ping', { headers: { Cookie: `admin_session=${token}` } }, env());

        // Assert
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ admin: true });
    });

    test('rejects with 401 when the cookie is missing', async () => {
        // Arrange
        const app = buildApp();

        // Act
        const res = await app.request('/admin/ping', {}, env());

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 401 when a player_session cookie is used', async () => {
        // Arrange
        const app = buildApp();
        const token = await signCookie({ sub: 1, gid: 1, exp: nowSec() + 60 }, SECRET);

        // Act
        const res = await app.request(
            '/admin/ping',
            { headers: { Cookie: `admin_session=${token}` } },
            env(),
        );

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('requireOrigin', () => {
    test('passes when Origin matches DEPLOY_ORIGIN', async () => {
        // Arrange
        const app = buildApp();

        // Act
        const res = await app.request(
            '/origin/x',
            { method: 'POST', headers: { Origin: ORIGIN } },
            env(),
        );

        // Assert
        expect(res.status).toBe(200);
    });

    test('rejects with 403 when Origin is missing', async () => {
        // Arrange
        const app = buildApp();

        // Act
        const res = await app.request('/origin/x', { method: 'POST' }, env());

        // Assert
        expect(res.status).toBe(403);
    });

    test('rejects with 403 when Origin does not match', async () => {
        // Arrange
        const app = buildApp();

        // Act
        const res = await app.request(
            '/origin/x',
            { method: 'POST', headers: { Origin: 'https://evil.example' } },
            env(),
        );

        // Assert
        expect(res.status).toBe(403);
    });
});
