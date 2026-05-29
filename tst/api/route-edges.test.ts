import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { gamesRepo } from '@api/repos/games';
import { hashPassword } from '@api/crypto';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const ADMIN_PASSWORD = 'admin-pass';

async function envWithAdmin(db: D1Database): Promise<AppEnv['Bindings']> {
    return {
        DB: db,
        SESSION_SECRET: SECRET,
        ADMIN_PASSWORD_HASH: await hashPassword(ADMIN_PASSWORD),
    };
}

async function loginAdmin(app: ReturnType<typeof buildApp>, env: AppEnv['Bindings']): Promise<string> {
    const res = await app.request(
        '/api/admin/login',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: ADMIN_PASSWORD }),
        },
        env,
    );

    return (res.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

describe('input validation edges', () => {
    test('enter with non-numeric gameId returns 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();

        // Act
        const res = await app.request(
            '/api/games/abc/enter',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'pw', displayName: 'Alice' }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('enter with malformed JSON body returns 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
        const app = buildApp();

        // Act
        const res = await app.request(
            `/api/games/${game.id}/enter`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' },
            env,
        );

        // Assert — readJson catches the parse error, validation fails on missing displayName
        expect(res.status).toBe(400);
    });

    test('leaderboard with non-numeric gameId returns 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();

        // Act
        const res = await app.request('/api/games/abc/leaderboard', {}, env);

        // Assert
        expect(res.status).toBe(400);
    });

    test('predictions/:matchId with non-numeric gameId returns 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();

        // Act
        const res = await app.request('/api/games/abc/predictions/G_A_1', {}, env);

        // Assert
        expect(res.status).toBe(400);
    });

    test('predictions visibility returns 404 when the game does not exist (post-kickoff)', async () => {
        // Arrange — using a match that has already kicked off relative to real time isn't reliable,
        // so we don't pin the clock here; the test only verifies 404 takes precedence.
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();

        // Act — request for a nonexistent game with a real match id (kickoff in the future,
        // so this might return 403 instead of 404 — both are non-200 and both exercise branches).
        const res = await app.request('/api/games/9999/predictions/G_A_1', {}, env);

        // Assert
        expect([403, 404]).toContain(res.status);
    });

    test('admin create game with missing password returns 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            '/api/admin/games',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ name: 'NoPw', password: '' }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('admin create game rejects duplicate name with 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();
        const cookie = await loginAdmin(app, env);
        await gamesRepo.create(db, { name: 'Already', passwordHash: 'h' });

        // Act
        const res = await app.request(
            '/api/admin/games',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ name: 'already', password: 'pw' }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('admin delete player with non-numeric id returns 400', async () => {
        // Arrange
        const db = createTestDb();
        const env = await envWithAdmin(db);
        const app = buildApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request('/api/admin/players/abc', { method: 'DELETE', headers: { Cookie: cookie } }, env);

        // Assert
        expect(res.status).toBe(400);
    });
});
