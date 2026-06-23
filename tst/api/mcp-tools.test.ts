import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { resultsRepo } from '@api/repos/results';
import { hashPassword, signCookie } from '@api/crypto';
import { toolDefinitions } from '@api/mcp/tools';
import { FIRST_KICKOFF_UTC } from '@data/tournament';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const BEFORE = Date.parse(FIRST_KICKOFF_UTC) - 5 * 60 * 1000;
const RESOLVED_MATCH = 'G_A_1'; // first group match — real teams, kicks off at FIRST_KICKOFF_UTC
const UNRESOLVED_MATCH = 'M73'; // an R32 fixture still on placeholder labels

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored' };
}

async function setup() {
    const db = createTestDb();
    const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
    const player = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: await hashPassword('pw') });
    let nowMs = BEFORE;
    const app = buildApp(() => nowMs);
    const token = await signCookie({ sub: player.id, gid: game.id, exp: Math.floor(nowMs / 1000) + 60 * 24 * 60 * 60 }, SECRET);

    return { db, app, game, player, token, setNow: (ms: number) => { nowMs = ms; } };
}

async function callTool(
    app: ReturnType<typeof buildApp>,
    db: D1Database,
    token: string,
    name: string,
    args: Record<string, unknown> = {},
): Promise<ToolResult> {
    const res = await app.request(
        '/api/mcp',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
        },
        env(db),
    );
    const body = (await res.json()) as { result: ToolResult };

    return body.result;
}

function data<T>(result: ToolResult): T {
    return JSON.parse(result.content[0]!.text) as T;
}

describe('read tools', () => {
    test('list_matches reports resolved teams, lock state, and inlined pick + result', async () => {
        // Arrange — a saved pick and a recorded result for the opener
        const { db, app, token } = await setup();
        await callTool(app, db, token, 'submit_prediction', { matchId: RESOLVED_MATCH, homeGoals: 2, awayGoals: 1, firstScorer: 'HOME' });
        await resultsRepo.upsert(db, { matchId: RESOLVED_MATCH, score: { home: 1, away: 0 }, firstScorer: 'HOME' });

        // Act
        const result = await callTool(app, db, token, 'list_matches');
        const { matches } = data<{ matches: Array<Record<string, unknown>> }>(result);
        const opener = matches.find((m) => m.matchId === RESOLVED_MATCH)!;
        const knockout = matches.find((m) => m.matchId === UNRESOLVED_MATCH)!;

        // Assert
        expect(opener.home).toHaveProperty('name');
        expect(opener.teamsResolved).toBe(true);
        expect(opener.locked).toBe(false);
        expect(opener.myPrediction).toEqual({ homeGoals: 2, awayGoals: 1, firstScorer: 'HOME' });
        expect(opener.result).toEqual({ home: 1, away: 0, firstScorer: 'HOME' });
        expect(knockout.home).toHaveProperty('label');
        expect(knockout.teamsResolved).toBe(false);
    });

    test('list_matches marks a match locked once its kickoff passes', async () => {
        // Arrange
        const { db, app, token, setNow } = await setup();
        setNow(Date.parse(FIRST_KICKOFF_UTC) + 1);

        // Act
        const result = await callTool(app, db, token, 'list_matches');
        const { matches } = data<{ matches: Array<{ matchId: string; locked: boolean }> }>(result);

        // Assert
        expect(matches.find((m) => m.matchId === RESOLVED_MATCH)!.locked).toBe(true);
    });

    test('get_my_entry returns the player predictions, champion, and boosts', async () => {
        // Arrange
        const { db, app, token } = await setup();
        await callTool(app, db, token, 'submit_prediction', { matchId: RESOLVED_MATCH, homeGoals: 3, awayGoals: 0 });
        await callTool(app, db, token, 'set_champion', { teamId: 'BRA' });
        await callTool(app, db, token, 'set_boost', { phaseId: 'GROUP_R1', matchId: RESOLVED_MATCH });

        // Act
        const result = await callTool(app, db, token, 'get_my_entry');
        const entry = data<{ predictions: unknown[]; championTeamId: string; boosts: unknown[] }>(result);

        // Assert
        expect(entry.predictions).toEqual([{ matchId: RESOLVED_MATCH, homeGoals: 3, awayGoals: 0, firstScorer: null }]);
        expect(entry.championTeamId).toBe('BRA');
        expect(entry.boosts).toEqual([{ phaseId: 'GROUP_R1', matchId: RESOLVED_MATCH }]);
    });

    test('get_my_entry identifies which player and game the caller is acting as', async () => {
        // Arrange
        const { db, app, token, game, player } = await setup();

        // Act
        const entry = data<{ playerId: number; displayName: string; gameId: number; gameName: string }>(
            await callTool(app, db, token, 'get_my_entry'),
        );

        // Assert — the model can read its own identity authoritatively (name included so it can map
        // the game/room without guessing from the server name)
        expect(entry).toMatchObject({ playerId: player.id, displayName: 'Alice', gameId: game.id, gameName: 'G' });
    });

    test('get_my_entry tolerates a token whose player no longer exists', async () => {
        // Arrange — a validly-signed token for a player id with no row (e.g. deleted after minting)
        const { db, app, game } = await setup();
        const ghost = await signCookie({ sub: 999999, gid: game.id, exp: Math.floor(BEFORE / 1000) + 1000 }, SECRET);

        // Act
        const entry = data<{ playerId: number; displayName: string | null }>(await callTool(app, db, ghost, 'get_my_entry'));

        // Assert — still reports the token's player id, display name null
        expect(entry).toMatchObject({ playerId: 999999, displayName: null });
    });

    test('get_my_entry reports a null gameName when the token game no longer exists', async () => {
        // Arrange — a validly-signed token whose game id has no row (e.g. deleted after minting)
        const { db, app, player } = await setup();
        const orphan = await signCookie({ sub: player.id, gid: 999999, exp: Math.floor(BEFORE / 1000) + 1000 }, SECRET);

        // Act
        const entry = data<{ gameId: number; gameName: string | null }>(await callTool(app, db, orphan, 'get_my_entry'));

        // Assert — still reports the token's game id, name null
        expect(entry).toMatchObject({ gameId: 999999, gameName: null });
    });

    test('get_leaderboard returns rows scoped to the player game', async () => {
        // Arrange
        const { db, app, token, player } = await setup();

        // Act
        const result = await callTool(app, db, token, 'get_leaderboard');
        const { rows } = data<{ rows: Array<{ playerId: number; displayName: string }> }>(result);

        // Assert
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ playerId: player.id, displayName: 'Alice' });
    });

    test('get_leaderboard marks the caller row and ranks every row', async () => {
        // Arrange — a second player so the caller must be distinguished
        const { db, app, token, game, player } = await setup();
        await playersRepo.create(db, { gameId: game.id, displayName: 'Mallory', passwordHash: await hashPassword('pw') });

        // Act
        const { rows } = data<{ rows: Array<{ playerId: number; rank: number; you: boolean }> }>(
            await callTool(app, db, token, 'get_leaderboard'),
        );

        // Assert — exactly the caller's row is flagged, and every row carries a rank
        expect(rows.filter((r) => r.you)).toHaveLength(1);
        expect(rows.find((r) => r.playerId === player.id)!.you).toBe(true);
        expect(rows.every((r) => typeof r.rank === 'number')).toBe(true);
    });
});

describe('submit_prediction tool', () => {
    test('writes a valid prediction', async () => {
        // Arrange
        const { db, app, token, player } = await setup();

        // Act
        const result = await callTool(app, db, token, 'submit_prediction', { matchId: RESOLVED_MATCH, homeGoals: 2, awayGoals: 1 });

        // Assert
        expect(result.isError).toBeUndefined();
        expect(await predictionsRepo.findByPlayer(db, player.id)).toHaveLength(1);
    });

    test('rejects a match past kickoff with an error result', async () => {
        // Arrange
        const { db, app, token, setNow } = await setup();
        setNow(Date.parse(FIRST_KICKOFF_UTC) + 1);

        // Act
        const result = await callTool(app, db, token, 'submit_prediction', { matchId: RESOLVED_MATCH, homeGoals: 2, awayGoals: 1 });

        // Assert
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toMatch(/locked/i);
    });

    test('rejects an unresolved knockout match and an unknown match', async () => {
        // Arrange
        const { db, app, token } = await setup();

        // Act
        const unresolved = await callTool(app, db, token, 'submit_prediction', { matchId: UNRESOLVED_MATCH, homeGoals: 1, awayGoals: 0 });
        const unknown = await callTool(app, db, token, 'submit_prediction', { matchId: 'NOPE', homeGoals: 1, awayGoals: 0 });

        // Assert
        expect(unresolved.isError).toBe(true);
        expect(unknown.isError).toBe(true);
        expect(unknown.content[0]!.text).toMatch(/not found/i);
    });

    test.each([
        { label: 'negative goals', args: { matchId: RESOLVED_MATCH, homeGoals: -1, awayGoals: 0 } },
        { label: 'a NONE first scorer', args: { matchId: RESOLVED_MATCH, homeGoals: 0, awayGoals: 0, firstScorer: 'NONE' } },
    ])('rejects $label with an error result', async ({ args }) => {
        // Arrange
        const { db, app, token } = await setup();

        // Act
        const result = await callTool(app, db, token, 'submit_prediction', args);

        // Assert
        expect(result.isError).toBe(true);
    });

    test('ignores a stray playerId in arguments — the write targets the token player only', async () => {
        // Arrange — a second player in the same game; injection tries to write as them
        const { db, app, token, game, player } = await setup();
        const mallory = await playersRepo.create(db, { gameId: game.id, displayName: 'Mallory', passwordHash: await hashPassword('pw') });

        // Act
        await callTool(app, db, token, 'submit_prediction', {
            matchId: RESOLVED_MATCH,
            homeGoals: 5,
            awayGoals: 5,
            playerId: mallory.id,
            gameId: 999,
        });

        // Assert — Mallory untouched, the token's player got the write
        expect(await predictionsRepo.findByPlayer(db, mallory.id)).toHaveLength(0);
        expect(await predictionsRepo.findByPlayer(db, player.id)).toHaveLength(1);
    });
});

describe('set_champion tool', () => {
    test('sets a valid champion before first kickoff', async () => {
        // Arrange
        const { db, app, token } = await setup();

        // Act
        const result = await callTool(app, db, token, 'set_champion', { teamId: 'BRA' });

        // Assert
        expect(result.isError).toBeUndefined();
    });

    test('rejects an unknown team and a locked tournament', async () => {
        // Arrange
        const { db, app, token, setNow } = await setup();

        // Act
        const badTeam = await callTool(app, db, token, 'set_champion', { teamId: 'NOPE' });
        setNow(Date.parse(FIRST_KICKOFF_UTC) + 1);
        const locked = await callTool(app, db, token, 'set_champion', { teamId: 'BRA' });

        // Assert
        expect(badTeam.isError).toBe(true);
        expect(locked.isError).toBe(true);
    });
});

describe('set_boost tool', () => {
    test('sets and clears a phase boost', async () => {
        // Arrange
        const { db, app, token } = await setup();

        // Act
        const set = await callTool(app, db, token, 'set_boost', { phaseId: 'GROUP_R1', matchId: RESOLVED_MATCH });
        const cleared = await callTool(app, db, token, 'set_boost', { phaseId: 'GROUP_R1', matchId: null });

        // Assert
        expect(set.isError).toBeUndefined();
        expect(cleared.isError).toBeUndefined();
        expect(data<{ boosts: unknown[] }>(await callTool(app, db, token, 'get_my_entry')).boosts).toEqual([]);
    });

    test('rejects a match outside the phase, an unknown phase, and a locked phase', async () => {
        // Arrange
        const { db, app, token, setNow } = await setup();

        // Act
        const wrongPhase = await callTool(app, db, token, 'set_boost', { phaseId: 'GROUP_R1', matchId: UNRESOLVED_MATCH });
        const unknownPhase = await callTool(app, db, token, 'set_boost', { phaseId: 'NOPE', matchId: RESOLVED_MATCH });
        setNow(Date.parse(FIRST_KICKOFF_UTC) + 1);
        const locked = await callTool(app, db, token, 'set_boost', { phaseId: 'GROUP_R1', matchId: RESOLVED_MATCH });

        // Assert
        expect(wrongPhase.isError).toBe(true);
        expect(unknownPhase.isError).toBe(true);
        expect(locked.isError).toBe(true);
    });

    test('rejects boosting a non-boostable phase (final/3rd-place)', async () => {
        // Arrange
        const { db, app, token } = await setup();

        // Act — M104 is the FINAL match; the final is not boostable.
        const final = await callTool(app, db, token, 'set_boost', { phaseId: 'FINAL', matchId: 'M104' });

        // Assert
        expect(final.isError).toBe(true);
    });

    test('does not offer non-boostable phases in the set_boost schema', () => {
        // Arrange, Act — the tool schema gates input before it reaches the service.
        const def = toolDefinitions().find((t) => t.name === 'set_boost');
        const phaseEnum = (def?.inputSchema as { properties: { phaseId: { enum: string[] } } }).properties.phaseId.enum;

        // Assert
        expect(phaseEnum).toContain('GROUP_R1');
        expect(phaseEnum).not.toContain('THIRD');
        expect(phaseEnum).not.toContain('FINAL');
    });
});
