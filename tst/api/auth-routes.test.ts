import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { gamesRepo } from '@api/repos/games';
import { hashPassword } from '@api/crypto';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored', DEPLOY_ORIGIN: 'https://x' };
}

async function seedGame(db: D1Database, name: string, password: string) {
    return gamesRepo.create(db, { name, passwordHash: await hashPassword(password) });
}

describe('POST /api/games/:id/enter', () => {
    test('logs in a new player and sets a player_session cookie', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', 'pw');
        const app = buildApp();

        // Act
        const res = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'Alice' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const setCookie = res.headers.get('Set-Cookie') ?? '';
        expect(setCookie).toMatch(/player_session=/);
        expect(setCookie).toMatch(/HttpOnly/);
        expect(setCookie).toMatch(/SameSite=Strict/);
    });

    test('returns the same player on a second login with the same display name', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', 'pw');
        const app = buildApp();
        const first = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'Alice' }),
            },
            env(db),
        );
        const firstBody = (await first.json()) as { playerId: number };

        // Act
        const second = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'alice' }), // case-insensitive
            },
            env(db),
        );
        const secondBody = (await second.json()) as { playerId: number };

        // Assert
        expect(secondBody.playerId).toBe(firstBody.playerId);
    });

    test('rejects with 401 on wrong password', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', 'pw');
        const app = buildApp();

        // Act
        const res = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'wrong', displayName: 'Alice' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 404 when the game does not exist', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await app.request(
            '/api/games/999/enter',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'Alice' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(404);
    });

    test('rejects with 400 when displayName is empty or too long', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', 'pw');
        const app = buildApp();

        // Act
        const empty = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: '' }),
            },
            env(db),
        );
        const tooLong = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'x'.repeat(41) }),
            },
            env(db),
        );

        // Assert
        expect(empty.status).toBe(400);
        expect(tooLong.status).toBe(400);
    });
});

describe('GET /api/me', () => {
    test('returns the player + empty predictions/champion when logged in', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', 'pw');
        const app = buildApp();
        const login = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'Alice' }),
            },
            env(db),
        );
        const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0];

        // Act
        const res = await app.request('/api/me', { headers: { Cookie: cookie! } }, env(db));
        const body = (await res.json()) as { displayName: string; predictions: unknown[]; championTeamId: unknown };

        // Assert
        expect(res.status).toBe(200);
        expect(body.displayName).toBe('Alice');
        expect(body.predictions).toEqual([]);
        expect(body.championTeamId).toBeNull();
    });

    test('rejects with 401 without a cookie', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await app.request('/api/me', {}, env(db));

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('POST /api/auth/logout', () => {
    test('clears the player_session cookie', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', 'pw');
        const app = buildApp();
        const login = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'Alice' }),
            },
            env(db),
        );
        const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0];

        // Act
        const res = await app.request(
            '/api/auth/logout',
            { method: 'POST', headers: { Cookie: cookie! } },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const cleared = res.headers.get('Set-Cookie') ?? '';
        expect(cleared).toMatch(/player_session=;/);
        expect(cleared.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
    });
});

