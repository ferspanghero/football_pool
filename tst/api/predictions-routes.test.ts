import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { gamesRepo } from '@api/repos/games';
import { hashPassword } from '@api/crypto';
import { MATCHES, FIRST_KICKOFF_UTC } from '@data/tournament';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const futureMatch = MATCHES.find((m) => m.id === 'G_A_1')!; // first kickoff in tournament

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored' };
}

/**
 * Each test owns a mutable `nowMs` so it can advance the clock mid-test (e.g., to step
 * past a kickoff). The closure passed to `buildApp` reads it on every request.
 */
function buildContext() {
    let nowMs = Date.parse(FIRST_KICKOFF_UTC) - 5 * 60 * 1000;
    const setNow = (ms: number) => {
        nowMs = ms;
    };

    return { app: buildApp(() => nowMs), setNow };
}

async function loginAlice(): Promise<{
    db: D1Database;
    app: ReturnType<typeof buildApp>;
    cookie: string;
    setNow: (ms: number) => void;
}> {
    const db = createTestDb();
    const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
    const { app, setNow } = buildContext();
    const login = await app.request(
        `/api/games/${game.id}/enter`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'Alice', playerPassword: 'pw', gamePassword: 'pw' }),
        },
        env(db),
    );
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';

    return { db, app, cookie, setNow };
}

describe('PUT /api/me/predictions/:matchId', () => {
    test('rejects with 403 for a knockout match whose teams are not yet assigned', async () => {
        // Arrange — M73 (R32) still shows placeholder labels; the pre-tournament clock means it is not kickoff-locked
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            '/api/me/predictions/M73',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 1, awayGoals: 0 }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(403);
    });

    test('saves a valid prediction for an open match', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 2, awayGoals: 1 }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const me = await app.request('/api/me', { headers: { Cookie: cookie } }, env(db));
        const body = (await me.json()) as { predictions: Array<{ matchId: string; score: { home: number; away: number } }> };
        expect(body.predictions).toHaveLength(1);
        expect(body.predictions[0]!.score).toEqual({ home: 2, away: 1 });
    });

    test('rejects with 403 once the match kickoff has passed', async () => {
        // Arrange
        const { db, app, cookie, setNow } = await loginAlice();
        setNow(Date.parse(futureMatch.kickoffUtc) + 1);

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 2, awayGoals: 1 }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(403);
    });

    test('rejects with 404 for an unknown match', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            '/api/me/predictions/UNKNOWN',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 0, awayGoals: 0 }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(404);
    });

    test.each([
        { homeGoals: -1, awayGoals: 0 },
        { homeGoals: 0, awayGoals: -1 },
        { homeGoals: 1.5, awayGoals: 0 },
        { homeGoals: 100, awayGoals: 0 },
    ])('rejects with 400 for invalid score %s', async (score) => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify(score),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('saves a first-scorer pick alongside the score', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 2, awayGoals: 1, firstScorer: 'HOME' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const me = await app.request('/api/me', { headers: { Cookie: cookie } }, env(db));
        const body = (await me.json()) as { predictions: Array<{ firstScorer?: string }> };
        expect(body.predictions[0]!.firstScorer).toBe('HOME');
    });

    test('rejects with 400 for an invalid first-scorer value', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 2, awayGoals: 1, firstScorer: 'BOTH' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('rejects a NONE first-scorer pick — players pick a side or none', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ homeGoals: 0, awayGoals: 0, firstScorer: 'NONE' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(400);
    });

    test('rejects with 401 without a session', async () => {
        // Arrange
        const db = createTestDb();
        const { app } = buildContext();

        // Act
        const res = await app.request(
            `/api/me/predictions/${futureMatch.id}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeGoals: 1, awayGoals: 1 }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(401);
    });
});

describe('PUT /api/me/boosts/:phaseId', () => {
    const ct = { 'Content-Type': 'application/json' };

    test('saves a boost and /me returns it', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            '/api/me/boosts/GROUP_R1',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: 'G_A_1' }) },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const me = await app.request('/api/me', { headers: { Cookie: cookie } }, env(db));
        const body = (await me.json()) as { boosts: Array<{ phaseId: string; matchId: string }> };
        expect(body.boosts).toEqual([{ phaseId: 'GROUP_R1', matchId: 'G_A_1' }]);
    });

    test('clears a boost when matchId is null', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();
        await app.request(
            '/api/me/boosts/GROUP_R1',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: 'G_A_1' }) },
            env(db),
        );

        // Act
        const res = await app.request(
            '/api/me/boosts/GROUP_R1',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: null }) },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const me = await app.request('/api/me', { headers: { Cookie: cookie } }, env(db));
        expect(((await me.json()) as { boosts: unknown[] }).boosts).toEqual([]);
    });

    test('rejects an unknown phase with 404', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act, Assert
        const res = await app.request(
            '/api/me/boosts/NOPE',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: 'G_A_1' }) },
            env(db),
        );
        expect(res.status).toBe(404);
    });

    test('rejects a match that is not in the phase with 400', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act, Assert — M73 is an R32 match, not GROUP_R1
        const res = await app.request(
            '/api/me/boosts/GROUP_R1',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: 'M73' }) },
            env(db),
        );
        expect(res.status).toBe(400);
    });

    test('rejects with 403 once the phase first kickoff has passed', async () => {
        // Arrange
        const { db, app, cookie, setNow } = await loginAlice();
        setNow(Date.parse(FIRST_KICKOFF_UTC) + 1);

        // Act, Assert
        const res = await app.request(
            '/api/me/boosts/GROUP_R1',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: 'G_A_1' }) },
            env(db),
        );
        expect(res.status).toBe(403);
    });

    test('rejects with 401 without a session', async () => {
        // Arrange
        const db = createTestDb();
        const { app } = buildContext();

        // Act, Assert
        const res = await app.request(
            '/api/me/boosts/GROUP_R1',
            { method: 'PUT', headers: ct, body: JSON.stringify({ matchId: 'G_A_1' }) },
            env(db),
        );
        expect(res.status).toBe(401);
    });

    test('rejects boosting a non-boostable phase (final) with 403', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act, Assert — M104 is the FINAL match; the final is not boostable.
        const res = await app.request(
            '/api/me/boosts/FINAL',
            { method: 'PUT', headers: { ...ct, Cookie: cookie }, body: JSON.stringify({ matchId: 'M104' }) },
            env(db),
        );
        expect(res.status).toBe(403);
    });
});

describe('PUT /api/me/champion', () => {
    test('saves a valid champion pick before first kickoff', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            '/api/me/champion',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ teamId: 'BRA' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(200);
        const me = await app.request('/api/me', { headers: { Cookie: cookie } }, env(db));
        const body = (await me.json()) as { championTeamId: string };
        expect(body.championTeamId).toBe('BRA');
    });

    test('rejects with 403 once the tournament has started', async () => {
        // Arrange
        const { db, app, cookie, setNow } = await loginAlice();
        setNow(Date.parse(FIRST_KICKOFF_UTC) + 1);

        // Act
        const res = await app.request(
            '/api/me/champion',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ teamId: 'BRA' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(403);
    });

    test('rejects with 400 for an unknown team id', async () => {
        // Arrange
        const { db, app, cookie } = await loginAlice();

        // Act
        const res = await app.request(
            '/api/me/champion',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ teamId: 'NOT_A_TEAM' }),
            },
            env(db),
        );

        // Assert
        expect(res.status).toBe(400);
    });
});
