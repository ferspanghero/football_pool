import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { FixedClockProvider } from '@api/clock';
import { gamesRepo } from '@api/repos/games';
import { hashPassword } from '@api/crypto';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const GAME_PW = 'game-pw';

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored', DEPLOY_ORIGIN: 'https://x' };
}

async function seedGame(db: D1Database, name: string, password: string) {
    return gamesRepo.create(db, { name, passwordHash: await hashPassword(password) });
}

type EnterBody = { displayName?: string; playerPassword?: string; gamePassword?: string };

function enter(app: ReturnType<typeof buildApp>, db: D1Database, gameId: number | string, body: EnterBody) {
    return app.request(
        `/api/games/${gameId}/enter`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        env(db),
    );
}

describe('POST /api/games/:id/enter — signup (new player)', () => {
    test('creates a player with the game password + a chosen player password, sets the cookie', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();

        // Act
        const res = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'alice-secret', gamePassword: GAME_PW });

        // Assert
        expect(res.status).toBe(200);
        const setCookie = res.headers.get('Set-Cookie') ?? '';
        expect(setCookie).toMatch(/player_session=/);
        expect(setCookie).toMatch(/HttpOnly/);
        expect(setCookie).toMatch(/SameSite=Strict/);
    });

    test('rejects with 401 when the game password is wrong', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();

        // Act
        const res = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'x', gamePassword: 'wrong' });

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects with 400 when the player password is empty', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();

        // Act
        const res = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: '', gamePassword: GAME_PW });

        // Assert
        expect(res.status).toBe(400);
    });
});

describe('POST /api/games/:id/enter — login (existing player)', () => {
    test('returns the same player on a correct player password, without the game password', async () => {
        // Arrange — Alice signs up first
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();
        const signup = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'alice-secret', gamePassword: GAME_PW });
        const signupId = ((await signup.json()) as { playerId: number }).playerId;

        // Act — log back in with just name + player password (game password omitted)
        const login = await enter(app, db, game.id, { displayName: 'alice', playerPassword: 'alice-secret' });

        // Assert
        expect(login.status).toBe(200);
        expect(((await login.json()) as { playerId: number }).playerId).toBe(signupId);
    });

    test('rejects with 401 when the player password is wrong (impersonation blocked)', async () => {
        // Arrange — Alice exists
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();
        await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'alice-secret', gamePassword: GAME_PW });

        // Act — attacker knows the game password but not Alice's password
        const res = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'guess', gamePassword: GAME_PW });

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('POST /api/games/:id/enter — validation', () => {
    test('rejects with 404 when the game does not exist', async () => {
        const db = createTestDb();
        const app = buildApp();
        const res = await enter(app, db, 999, { displayName: 'Alice', playerPassword: 'x', gamePassword: GAME_PW });
        expect(res.status).toBe(404);
    });

    test('rejects with 400 when displayName is empty or too long', async () => {
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();
        const empty = await enter(app, db, game.id, { displayName: '', playerPassword: 'x', gamePassword: GAME_PW });
        const tooLong = await enter(app, db, game.id, { displayName: 'x'.repeat(41), playerPassword: 'x', gamePassword: GAME_PW });
        expect(empty.status).toBe(400);
        expect(tooLong.status).toBe(400);
    });
});

describe('GET /api/me', () => {
    test('returns the player + empty predictions/champion when logged in', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();
        const login = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'alice-secret', gamePassword: GAME_PW });
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

    test('reports the server clock as nowMs (so the UI can lock against server time)', async () => {
        // Arrange — pin the clock so nowMs is deterministic
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const fixedIso = '2026-09-15T12:00:00Z';
        const app = buildApp(FixedClockProvider(fixedIso));
        const login = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'alice-secret', gamePassword: GAME_PW });
        const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0];

        // Act
        const res = await app.request('/api/me', { headers: { Cookie: cookie! } }, env(db));
        const body = (await res.json()) as { nowMs: number };

        // Assert
        expect(body.nowMs).toBe(Date.parse(fixedIso));
    });

    test('rejects with 401 without a cookie', async () => {
        const db = createTestDb();
        const app = buildApp();
        const res = await app.request('/api/me', {}, env(db));
        expect(res.status).toBe(401);
    });
});

describe('POST /api/auth/logout', () => {
    test('clears the player_session cookie', async () => {
        // Arrange
        const db = createTestDb();
        const game = await seedGame(db, 'G', GAME_PW);
        const app = buildApp();
        const login = await enter(app, db, game.id, { displayName: 'Alice', playerPassword: 'alice-secret', gamePassword: GAME_PW });
        const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0];

        // Act
        const res = await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie! } }, env(db));

        // Assert
        expect(res.status).toBe(200);
        const cleared = res.headers.get('Set-Cookie') ?? '';
        expect(cleared).toMatch(/player_session=;/);
        expect(cleared.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
    });
});
