import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDb } from './testdb';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { boostsRepo } from '@api/repos/boosts';

describe('boostsRepo', () => {
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

    test('set inserts a boost and findByPlayer returns it', async () => {
        // Arrange, Act
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' });
        const list = await boostsRepo.findByPlayer(db, aliceId);

        // Assert
        expect(list).toEqual([{ playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' }]);
    });

    test('set overwrites the boost for the same phase (one per phase)', async () => {
        // Arrange
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' });

        // Act
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_B_1' });
        const list = await boostsRepo.findByPlayer(db, aliceId);

        // Assert
        expect(list).toHaveLength(1);
        expect(list[0]!.matchId).toBe('G_B_1');
    });

    test('allows one boost per distinct phase', async () => {
        // Arrange, Act
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' });
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R2', matchId: 'G_A_2' });

        // Assert
        expect(await boostsRepo.findByPlayer(db, aliceId)).toHaveLength(2);
    });

    test('clear removes a phase boost', async () => {
        // Arrange
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' });

        // Act
        await boostsRepo.clear(db, aliceId, 'GROUP_R1');

        // Assert
        expect(await boostsRepo.findByPlayer(db, aliceId)).toEqual([]);
    });

    test('findByPlayer returns empty for a player with no boosts', async () => {
        // Arrange, Act, Assert
        expect(await boostsRepo.findByPlayer(db, aliceId)).toEqual([]);
    });

    test('findAllForGame returns only that game\'s boosts', async () => {
        // Arrange
        const g2 = await gamesRepo.create(db, { name: 'G2', passwordHash: 'h' });
        const bob = await playersRepo.create(db, { gameId: g2.id, displayName: 'Bob', passwordHash: 'h' });
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' });
        await boostsRepo.set(db, { playerId: bob.id, phaseId: 'GROUP_R1', matchId: 'G_A_1' });

        // Act
        const g1 = await boostsRepo.findAllForGame(db, gameId);

        // Assert
        expect(g1).toHaveLength(1);
        expect(g1[0]!.playerId).toBe(aliceId);
    });

    test('cascade-deletes boosts when the player is deleted', async () => {
        // Arrange
        await boostsRepo.set(db, { playerId: aliceId, phaseId: 'GROUP_R1', matchId: 'G_A_1' });

        // Act
        await playersRepo.delete(db, aliceId);

        // Assert
        expect(await boostsRepo.findByPlayer(db, aliceId)).toEqual([]);
    });
});
