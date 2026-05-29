import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDb } from './testdb';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';

describe('predictionsRepo', () => {
    let db: D1Database;
    let gameId: number;
    let aliceId: number;

    beforeEach(async () => {
        db = createTestDb();
        const g = await gamesRepo.create(db, { name: 'G1', passwordHash: 'h' });
        gameId = g.id;
        const p = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'h' });
        aliceId = p.id;
    });

    test('upsert inserts a new prediction', async () => {
        // Arrange, Act
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: 2, away: 1 } });
        const list = await predictionsRepo.findByPlayer(db, aliceId);

        // Assert
        expect(list).toHaveLength(1);
        expect(list[0]!.matchId).toBe('G_A_1');
        expect(list[0]!.score).toEqual({ home: 2, away: 1 });
    });

    test('upsert overwrites an existing prediction for the same player and match', async () => {
        // Arrange
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: 1, away: 0 } });

        // Act
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: 3, away: 2 } });
        const list = await predictionsRepo.findByPlayer(db, aliceId);

        // Assert
        expect(list).toHaveLength(1);
        expect(list[0]!.score).toEqual({ home: 3, away: 2 });
    });

    test('rejects negative scores at the DB level', async () => {
        // Arrange, Act, Assert
        await expect(
            predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: -1, away: 0 } }),
        ).rejects.toThrow();
    });

    test('findByPlayer returns empty array for a player with no predictions', async () => {
        // Arrange, Act, Assert
        expect(await predictionsRepo.findByPlayer(db, aliceId)).toEqual([]);
    });

    test('findByMatch returns all players predictions for a match', async () => {
        // Arrange
        const bob = await playersRepo.create(db, { gameId, displayName: 'Bob', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: 2, away: 1 } });
        await predictionsRepo.upsert(db, { playerId: bob.id, matchId: 'G_A_1', score: { home: 1, away: 1 } });
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_B_1', score: { home: 0, away: 0 } });

        // Act
        const matchPreds = await predictionsRepo.findByMatch(db, 'G_A_1');

        // Assert
        expect(matchPreds).toHaveLength(2);
        expect(matchPreds.map((p) => p.playerId).sort()).toEqual([aliceId, bob.id].sort());
    });

    test('findAllForGame returns predictions only for that game', async () => {
        // Arrange
        const g2 = await gamesRepo.create(db, { name: 'G2', passwordHash: 'h' });
        const bobG2 = await playersRepo.create(db, { gameId: g2.id, displayName: 'Bob', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: 2, away: 1 } });
        await predictionsRepo.upsert(db, { playerId: bobG2.id, matchId: 'G_A_1', score: { home: 0, away: 0 } });

        // Act
        const g1Preds = await predictionsRepo.findAllForGame(db, gameId);

        // Assert
        expect(g1Preds).toHaveLength(1);
        expect(g1Preds[0]!.playerId).toBe(aliceId);
    });

    test('cascade-deletes predictions when player is deleted', async () => {
        // Arrange
        await predictionsRepo.upsert(db, { playerId: aliceId, matchId: 'G_A_1', score: { home: 2, away: 1 } });

        // Act
        await playersRepo.delete(db, aliceId);
        const remaining = await predictionsRepo.findByMatch(db, 'G_A_1');

        // Assert
        expect(remaining).toEqual([]);
    });
});
