import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { hashPassword, signCookie, verifyCookie } from '@api/crypto';
import { FIRST_KICKOFF_UTC } from '@data/tournament';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const NOW = Date.parse(FIRST_KICKOFF_UTC) - 5 * 60 * 1000;

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored' };
}

async function setup() {
    const db = createTestDb();
    const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
    const player = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: await hashPassword('pw') });
    const app = buildApp(() => NOW);
    const exp = Math.floor(NOW / 1000) + 60 * 24 * 60 * 60;
    const token = await signCookie({ sub: player.id, gid: game.id, exp }, SECRET);

    return { db, app, game, player, token };
}

async function rpc(
    app: ReturnType<typeof buildApp>,
    db: D1Database,
    token: string | undefined,
    bodyOrRaw: object | string,
): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    return app.request(
        '/api/mcp',
        { method: 'POST', headers, body: typeof bodyOrRaw === 'string' ? bodyOrRaw : JSON.stringify(bodyOrRaw) },
        env(db),
    );
}

describe('MCP protocol', () => {
    test('initialize echoes the requested protocol version and advertises tool capability', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
        const body = (await res.json()) as { result: { protocolVersion: string; capabilities: { tools: object }; serverInfo: { name: string } } };

        // Assert
        expect(res.status).toBe(200);
        expect(body.result.protocolVersion).toBe('2025-03-26');
        expect(body.result.capabilities.tools).toBeDefined();
        expect(body.result.serverInfo.name).toBe('football-pool');
    });

    test('initialize ships server instructions telling the model to identify via get_my_entry', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        const body = (await res.json()) as { result: { instructions?: string } };

        // Assert
        expect(typeof body.result.instructions).toBe('string');
        expect(body.result.instructions).toMatch(/get_my_entry/);
    });

    test('initialize falls back to the default protocol version when none is requested', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        const body = (await res.json()) as { result: { protocolVersion: string } };

        // Assert
        expect(body.result.protocolVersion).toBe('2025-06-18');
    });

    test('tools/list returns all six tools, each with an input schema', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const body = (await res.json()) as { result: { tools: Array<{ name: string; inputSchema: object }> } };

        // Assert
        const names = body.result.tools.map((t) => t.name).sort();
        expect(names).toEqual(['get_leaderboard', 'get_my_entry', 'list_matches', 'set_boost', 'set_champion', 'submit_prediction']);
        expect(body.result.tools.every((t) => typeof t.inputSchema === 'object')).toBe(true);
    });

    test('ping returns an empty result', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 3, method: 'ping' });
        const body = (await res.json()) as { result: object };

        // Assert
        expect(body.result).toEqual({});
    });

    test('an unknown method returns method-not-found (-32601)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 4, method: 'no/such' });
        const body = (await res.json()) as { error: { code: number } };

        // Assert
        expect(body.error.code).toBe(-32601);
    });

    test('a malformed JSON body returns a parse error (-32700)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, '{not json');
        const body = (await res.json()) as { id: null; error: { code: number } };

        // Assert
        expect(body.id).toBeNull();
        expect(body.error.code).toBe(-32700);
    });

    test('a message missing a method returns an invalid request (-32600)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 5 });
        const body = (await res.json()) as { error: { code: number } };

        // Assert
        expect(body.error.code).toBe(-32600);
    });

    test('a non-object JSON body returns an invalid request (-32600)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, '[1,2,3]');
        const body = (await res.json()) as { error: { code: number } };

        // Assert
        expect(body.error.code).toBe(-32600);
    });

    test('a notification (no id) is acknowledged with a bodyless 202', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', method: 'notifications/initialized' });

        // Assert
        expect(res.status).toBe(202);
        expect(await res.text()).toBe('');
    });

    test('tools/call with an unknown tool name returns invalid params (-32602)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope', arguments: {} } });
        const body = (await res.json()) as { error: { code: number } };

        // Assert
        expect(body.error.code).toBe(-32602);
    });

    test('tools/call without a tool name returns invalid params (-32602)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: {} });
        const body = (await res.json()) as { error: { code: number } };

        // Assert
        expect(body.error.code).toBe(-32602);
    });

    test('tools/call with non-object params returns invalid params (-32602)', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await rpc(app, db, token, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: 'oops' });
        const body = (await res.json()) as { error: { code: number } };

        // Assert
        expect(body.error.code).toBe(-32602);
    });
});

describe('MCP auth', () => {
    test('rejects a request with no Authorization header (401)', async () => {
        // Arrange
        const { app, db } = await setup();

        // Act
        const res = await rpc(app, db, undefined, { jsonrpc: '2.0', id: 1, method: 'ping' });

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects a non-Bearer Authorization header (401)', async () => {
        // Arrange
        const { app, db } = await setup();

        // Act
        const res = await app.request(
            '/api/mcp',
            { method: 'POST', headers: { Authorization: 'Basic abc' }, body: '{}' },
            env(db),
        );

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects an expired token (401)', async () => {
        // Arrange
        const { app, db, game, player } = await setup();
        const expired = await signCookie({ sub: player.id, gid: game.id, exp: Math.floor(NOW / 1000) - 10 }, SECRET);

        // Act
        const res = await rpc(app, db, expired, { jsonrpc: '2.0', id: 1, method: 'ping' });

        // Assert
        expect(res.status).toBe(401);
    });

    test('rejects a token that is not a player session (401)', async () => {
        // Arrange — an admin-shaped token has no sub/gid
        const { app, db } = await setup();
        const adminToken = await signCookie({ admin: true, exp: Math.floor(NOW / 1000) + 1000 }, SECRET);

        // Act
        const res = await rpc(app, db, adminToken, { jsonrpc: '2.0', id: 1, method: 'ping' });

        // Assert
        expect(res.status).toBe(401);
    });

    test('GET /api/mcp returns 405 — no server-initiated stream', async () => {
        // Arrange
        const { app, db, token } = await setup();

        // Act
        const res = await app.request('/api/mcp', { headers: { Authorization: `Bearer ${token}` } }, env(db));

        // Assert
        expect(res.status).toBe(405);
    });
});

describe('POST /api/mcp/token', () => {
    test('requires a cookie session (401 without one)', async () => {
        // Arrange
        const { app, db } = await setup();

        // Act
        const res = await app.request('/api/mcp/token', { method: 'POST' }, env(db));

        // Assert
        expect(res.status).toBe(401);
    });

    test('mints a bearer that verifies to the logged-in player and game', async () => {
        // Arrange — log in to obtain the cookie
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
        const app = buildApp(() => NOW);
        const login = await app.request(
            `/api/games/${game.id}/enter`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: 'Bob', playerPassword: 'pw', gamePassword: 'pw' }),
            },
            env(db),
        );
        const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
        const { playerId } = (await login.json()) as { playerId: number };

        // Act
        const res = await app.request('/api/mcp/token', { method: 'POST', headers: { Cookie: cookie } }, env(db));
        const body = (await res.json()) as { token: string; expiresAt: string };
        const payload = (await verifyCookie(body.token, SECRET, NOW)) as { sub: number; gid: number } | undefined;

        // Assert
        expect(res.status).toBe(200);
        expect(payload).toMatchObject({ sub: playerId, gid: game.id });
        expect(Date.parse(body.expiresAt)).toBeGreaterThan(NOW);
    });
});
