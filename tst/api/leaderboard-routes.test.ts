import { describe, test, expect } from 'vitest';
import { createTestDb } from './testdb';
import { buildApp } from '@api/app';
import { FixedClockProvider } from '@api/clock';
import { gamesRepo } from '@api/repos/games';
import { hashPassword } from '@api/crypto';
import { resultsRepo } from '@api/repos/results';
import { predictionsRepo } from '@api/repos/predictions';
import { boostsRepo } from '@api/repos/boosts';
import { playersRepo } from '@api/repos/players';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import { CHAMPION, FIRST_KICKOFF_UTC, MATCHES } from '@data/tournament';
import { CHAMPION_BONUS } from '@shared/scoring';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
const firstMatch = MATCHES.find((m) => m.id === 'G_A_1')!;

function env(db: D1Database): AppEnv['Bindings'] {
    return { DB: db, SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: 'ignored' };
}

/** App pinned to 5 minutes before first kickoff — every match is open. */
function buildPreKickoffApp(): ReturnType<typeof buildApp> {
    return buildApp(FixedClockProvider(new Date(Date.parse(FIRST_KICKOFF_UTC) - 5 * 60 * 1000).toISOString()));
}

/** App pinned to 1 ms after a specific match's kickoff. */
function buildPostKickoffApp(matchKickoffUtc: string): ReturnType<typeof buildApp> {
    return buildApp(FixedClockProvider(new Date(Date.parse(matchKickoffUtc) + 1).toISOString()));
}

describe('GET /api/games/:id/leaderboard', () => {
    test('returns 404 for an unknown game', async () => {
        // Arrange
        const db = createTestDb();
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request('/api/games/999/leaderboard', {}, env(db));

        // Assert
        expect(res.status).toBe(404);
    });

    test('returns rows sorted by total points', async () => {
        // Arrange
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: await hashPassword('pw') });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        const bob = await playersRepo.create(db, { gameId: game.id, displayName: 'Bob', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: alice.id, matchId: firstMatch.id, score: { home: 2, away: 1 } });
        await predictionsRepo.upsert(db, { playerId: bob.id, matchId: firstMatch.id, score: { home: 4, away: 1 } });
        await resultsRepo.upsert(db, { matchId: firstMatch.id, score: { home: 2, away: 1 } });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/leaderboard`, {}, env(db));
        const body = (await res.json()) as { rows: Array<{ displayName: string; totalPoints: number }> };

        // Assert
        expect(res.status).toBe(200);
        expect(body.rows.map((r) => r.displayName)).toEqual(['Alice', 'Bob']);
        expect(body.rows[0]!.totalPoints).toBe(7);
        expect(body.rows[1]!.totalPoints).toBe(3);
    });

    test('adds the first-to-score bonus to the leaderboard total', async () => {
        // Arrange — wrong score (0 base) but a correct first-scorer pick; group ×1 → +2
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: alice.id, matchId: firstMatch.id, score: { home: 0, away: 3 }, firstScorer: 'HOME' });
        await resultsRepo.upsert(db, { matchId: firstMatch.id, score: { home: 2, away: 1 }, firstScorer: 'HOME' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/leaderboard`, {}, env(db));
        const body = (await res.json()) as { rows: Array<{ totalPoints: number }> };

        // Assert
        expect(body.rows[0]!.totalPoints).toBe(2);
    });

    test('awards the champion bonus once the Final resolves to the configured champion', async () => {
        // Arrange — CHAMPION is validated against M104's overlay-resolved teams, so the bonus only
        // lands after the bracket puts the champion in the Final
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await playersRepo.setChampionTeamId(db, alice.id, CHAMPION);
        await knockoutTeamsRepo.upsert(db, { matchId: 'M104', homeTeamId: CHAMPION!, awayTeamId: 'ARG' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/leaderboard`, {}, env(db));
        const body = (await res.json()) as { rows: Array<{ totalPoints: number; championPoints: number }> };

        // Assert
        expect(body.rows[0]!.championPoints).toBe(CHAMPION_BONUS);
        expect(body.rows[0]!.totalPoints).toBe(CHAMPION_BONUS);
    });

    test('withholds the champion bonus when the Final resolves without the configured champion', async () => {
        // Arrange — a resolved Final that does not feature CHAMPION is a genuine misconfiguration;
        // the bonus must stay unawarded rather than defaulting to everyone
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await playersRepo.setChampionTeamId(db, alice.id, CHAMPION);
        await knockoutTeamsRepo.upsert(db, { matchId: 'M104', homeTeamId: 'BRA', awayTeamId: 'ARG' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/leaderboard`, {}, env(db));
        const body = (await res.json()) as { rows: Array<{ totalPoints: number; championPoints: number }> };

        // Assert
        expect(body.rows[0]!.championPoints).toBe(0);
        expect(body.rows[0]!.totalPoints).toBe(0);
    });

    test('doubles a boosted match in the leaderboard total', async () => {
        // Arrange — exact group score (7) on a boosted match → 14
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: alice.id, matchId: firstMatch.id, score: { home: 2, away: 1 } });
        await resultsRepo.upsert(db, { matchId: firstMatch.id, score: { home: 2, away: 1 } });
        await boostsRepo.set(db, { playerId: alice.id, phaseId: firstMatch.phase, matchId: firstMatch.id });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/leaderboard`, {}, env(db));
        const body = (await res.json()) as { rows: Array<{ totalPoints: number }> };

        // Assert
        expect(body.rows[0]!.totalPoints).toBe(14);
    });

    test('returns empty rows when no players exist', async () => {
        // Arrange
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/leaderboard`, {}, env(db));
        const body = (await res.json()) as { rows: unknown[] };

        // Assert
        expect(body.rows).toEqual([]);
    });
});

describe('GET /api/games/:id/predictions/:matchId', () => {
    test('returns 403 before the match kickoff', async () => {
        // Arrange
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/predictions/${firstMatch.id}`, {}, env(db));

        // Assert
        expect(res.status).toBe(403);
    });

    test('returns all players predictions and the actual result after kickoff', async () => {
        // Arrange
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const alice = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: alice.id, matchId: firstMatch.id, score: { home: 2, away: 1 } });
        await resultsRepo.upsert(db, { matchId: firstMatch.id, score: { home: 2, away: 1 } });
        const app = buildPostKickoffApp(firstMatch.kickoffUtc);

        // Act
        const res = await app.request(`/api/games/${game.id}/predictions/${firstMatch.id}`, {}, env(db));
        const body = (await res.json()) as {
            predictions: Array<{ displayName: string; score: { home: number; away: number } }>;
            result: { home: number; away: number } | null;
        };

        // Assert
        expect(res.status).toBe(200);
        expect(body.predictions).toHaveLength(1);
        expect(body.predictions[0]!.displayName).toBe('Alice');
        expect(body.result).toEqual({ home: 2, away: 1 });
    });

    test('returns 404 for an unknown match', async () => {
        // Arrange
        const db = createTestDb();
        const game = await gamesRepo.create(db, { name: 'G', passwordHash: 'h' });
        const app = buildPreKickoffApp();

        // Act
        const res = await app.request(`/api/games/${game.id}/predictions/UNKNOWN`, {}, env(db));

        // Assert
        expect(res.status).toBe(404);
    });
});
