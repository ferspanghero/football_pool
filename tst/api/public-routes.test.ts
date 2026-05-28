import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { gamesRepo } from '@api/repos/games';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored', DEPLOY_ORIGIN: 'https://x' };
}

describe('GET /api/games', () => {
    test('returns an empty list when no games exist', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await app.request('/api/games', {}, env(db));

        // Assert
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ games: [] });
    });

    test('returns games with id and name only (no password)', async () => {
        // Arrange
        const db = createTestDb();
        await gamesRepo.create(db, { name: 'Friends 2026', passwordHash: 'secret-hash' });
        await gamesRepo.create(db, { name: 'Office Pool', passwordHash: 'other-hash' });
        const app = buildApp();

        // Act
        const res = await app.request('/api/games', {}, env(db));
        const body = (await res.json()) as { games: { id: number; name: string }[] };

        // Assert
        expect(body.games).toHaveLength(2);
        for (const g of body.games) {
            expect(g).toHaveProperty('id');
            expect(g).toHaveProperty('name');
            expect(g).not.toHaveProperty('passwordHash');
            expect(g).not.toHaveProperty('password_hash');
        }
    });
});

describe('GET /api/tournament', () => {
    test('returns teams and matches', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildApp();

        // Act
        const res = await app.request('/api/tournament', {}, env(db));
        const body = (await res.json()) as { teams: unknown[]; matches: unknown[]; firstKickoffUtc: string };

        // Assert
        expect(res.status).toBe(200);
        expect(body.teams).toHaveLength(48);
        expect(body.matches).toHaveLength(104);
        expect(body.firstKickoffUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
