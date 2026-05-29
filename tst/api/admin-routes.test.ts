import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { FixedClockProvider } from '@api/clock';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { resultsRepo } from '@api/repos/results';
import { hashPassword } from '@api/crypto';
import { MATCHES, FIRST_KICKOFF_UTC } from '@data/tournament';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const ADMIN_PASSWORD = 'admin-pass';

async function adminEnv(db: D1Database): Promise<AppEnv['Bindings']> {
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
    expect(res.status).toBe(200);

    return (res.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

const firstMatch = MATCHES.find((m) => m.id === 'G_A_1')!;

/** Build an app pinned to "5 minutes before the tournament's first kickoff" — every match is open. */
function buildPreKickoffApp(): ReturnType<typeof buildApp> {
    const beforeFirstKickoff = new Date(Date.parse(FIRST_KICKOFF_UTC) - 5 * 60 * 1000).toISOString();

    return buildApp(FixedClockProvider(beforeFirstKickoff));
}

describe('GET /api/admin/whoami', () => {
    test('returns 200 with admin session', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request('/api/admin/whoami', { headers: { Cookie: cookie } }, env);

        // Assert
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ admin: true });
    });

    test('returns 401 without admin session', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request('/api/admin/whoami', {}, env);

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('GET /api/admin/results', () => {
    test('returns recorded results for an authenticated admin', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 } });

        // Act
        const res = await app.request('/api/admin/results', { headers: { Cookie: cookie } }, env);
        const body = (await res.json()) as { results: Array<{ matchId: string; home: number; away: number }> };

        // Assert
        expect(res.status).toBe(200);
        expect(body.results).toContainEqual({ matchId: 'G_A_1', home: 2, away: 1 });
    });

    test('returns 401 without admin session', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request('/api/admin/results', {}, env);

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('POST /api/admin/login', () => {
    test('sets admin_session cookie on correct password', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(
            '/api/admin/login',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: ADMIN_PASSWORD }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(200);
        expect(res.headers.get('Set-Cookie') ?? '').toMatch(/admin_session=/);
    });

    test('rejects with 401 on wrong password', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(
            '/api/admin/login',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'wrong' }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('POST /api/admin/games', () => {
    test('creates a new game with a hashed password', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            '/api/admin/games',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ name: 'New Game', password: 'gamepw' }),
            },
            env,
        );
        const body = (await res.json()) as { game: { id: number; name: string } };

        // Assert
        expect(res.status).toBe(200);
        expect(body.game.name).toBe('New Game');
        const stored = await gamesRepo.findById(db, body.game.id);
        expect(stored?.passwordHash).toContain(':'); // looks like a hash, not plaintext
        expect(stored?.passwordHash).not.toBe('gamepw');
    });

    test('rejects with 401 without admin session', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(
            '/api/admin/games',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Game', password: 'gamepw' }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 400 on missing name or password', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            '/api/admin/games',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ name: '', password: 'pw' }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(400);
    });
});

describe('PUT /api/admin/results/:matchId', () => {
    test('records a result and persists it', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            `/api/admin/results/${firstMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 3, awayGoals: 1 }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(200);
        const stored = await resultsRepo.findById(db, firstMatch.id);
        expect(stored?.score).toEqual({ home: 3, away: 1 });
    });

    test('rejects with 404 for an unknown match', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            '/api/admin/results/UNKNOWN',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 1, awayGoals: 0 }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(404);
    });

    test('rejects with 400 on invalid score', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            `/api/admin/results/${firstMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: -1, awayGoals: 0 }),
            },
            env,
        );

        // Assert
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/admin/players/:id', () => {
    test('deletes the player', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            `/api/admin/players/${alice.id}`,
            { method: 'DELETE', headers: { Cookie: cookie } },
            env,
        );

        // Assert
        expect(res.status).toBe(200);
        expect(await playersRepo.findById(db, alice.id)).toBeUndefined();
    });
});

describe('DELETE /api/admin/games/:id', () => {
    test('deletes the game and its players', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const game = await gamesRepo.create(db, { name: 'Doomed', passwordHash: 'h' });
        await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            `/api/admin/games/${game.id}`,
            { method: 'DELETE', headers: { Cookie: cookie } },
            env,
        );

        // Assert
        expect(res.status).toBe(200);
        expect(await gamesRepo.findById(db, game.id)).toBeUndefined();
        expect(await playersRepo.listByGame(db, game.id)).toEqual([]);
    });

    test('rejects with 401 without admin session', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/admin/games/${game.id}`, { method: 'DELETE' }, env);

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 400 on an invalid game id', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(
            '/api/admin/games/not-a-number',
            { method: 'DELETE', headers: { Cookie: cookie } },
            env,
        );

        // Assert
        expect(res.status).toBe(400);
    });
});

describe('GET /api/admin/games/:id/players', () => {
    test('returns the players in the game', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await playersRepo.create(db, { gameId: game.id, displayName: 'Bob', passwordHash: 'h' });
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request(`/api/admin/games/${game.id}/players`, { headers: { Cookie: cookie } }, env);

        // Assert
        expect(res.status).toBe(200);
        const body = (await res.json()) as { players: Array<{ id: number; displayName: string }> };
        expect(body.players.map((p) => p.displayName).sort()).toEqual(['Alice', 'Bob']);
    });

    test('rejects with 401 without admin session', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/admin/games/${game.id}/players`, {}, env);

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 400 on an invalid game id', async () => {
        // Arrange
        const db = createTestDb();
        const env = await adminEnv(db);
        const app = buildPreKickoffApp();
        const cookie = await loginAdmin(app, env);

        // Act
        const res = await app.request('/api/admin/games/not-a-number/players', { headers: { Cookie: cookie } }, env);

        // Assert
        expect(res.status).toBe(400);
    });
});
