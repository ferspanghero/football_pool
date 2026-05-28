import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDb } from './testdb';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';

describe('playersRepo', () => {
    let db: D1Database;
    let gameId: number;

    beforeEach(async () => {
        db = createTestDb();
        const g = await gamesRepo.create(db, { name: 'G1', passwordHash: 'h' });
        gameId = g.id;
    });

    test('findOrCreate creates a new player when display name does not exist', async () => {
        // Arrange, Act
        const player = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });

        // Assert
        expect(player.id).toBeGreaterThan(0);
        expect(player.gameId).toBe(gameId);
        expect(player.displayName).toBe('Alice');
        expect(player.championTeamId).toBeUndefined();
    });

    test('findOrCreate returns the existing player on a case-insensitive name match', async () => {
        // Arrange
        const first = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });

        // Act
        const second = await playersRepo.findOrCreate(db, { gameId, displayName: 'alice' });

        // Assert
        expect(second.id).toBe(first.id);
    });

    test('findOrCreate isolates players per game', async () => {
        // Arrange
        const g2 = await gamesRepo.create(db, { name: 'G2', passwordHash: 'h' });
        const aliceG1 = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });
        const aliceG2 = await playersRepo.findOrCreate(db, { gameId: g2.id, displayName: 'Alice' });

        // Act, Assert
        expect(aliceG1.id).not.toBe(aliceG2.id);
    });

    test('findById returns the player', async () => {
        // Arrange
        const created = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });

        // Act
        const found = await playersRepo.findById(db, created.id);

        // Assert
        expect(found).toEqual(created);
    });

    test('findById returns undefined for unknown id', async () => {
        // Arrange, Act, Assert
        expect(await playersRepo.findById(db, 999)).toBeUndefined();
    });

    test('listByGame returns all players in the game sorted by name', async () => {
        // Arrange
        await playersRepo.findOrCreate(db, { gameId, displayName: 'Bob' });
        await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });
        await playersRepo.findOrCreate(db, { gameId, displayName: 'Carol' });

        // Act
        const players = await playersRepo.listByGame(db, gameId);

        // Assert
        expect(players.map((p) => p.displayName)).toEqual(['Alice', 'Bob', 'Carol']);
    });

    test('listByGame returns empty array when no players', async () => {
        // Arrange, Act, Assert
        expect(await playersRepo.listByGame(db, gameId)).toEqual([]);
    });

    test('setChampionTeamId persists the champion pick', async () => {
        // Arrange
        const player = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });

        // Act
        await playersRepo.setChampionTeamId(db, player.id, 'BRA');
        const reloaded = await playersRepo.findById(db, player.id);

        // Assert
        expect(reloaded?.championTeamId).toBe('BRA');
    });

    test('setChampionTeamId can clear the pick with undefined', async () => {
        // Arrange
        const player = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });
        await playersRepo.setChampionTeamId(db, player.id, 'BRA');

        // Act
        await playersRepo.setChampionTeamId(db, player.id, undefined);
        const reloaded = await playersRepo.findById(db, player.id);

        // Assert
        expect(reloaded?.championTeamId).toBeUndefined();
    });

    test('delete removes the player', async () => {
        // Arrange
        const player = await playersRepo.findOrCreate(db, { gameId, displayName: 'Alice' });

        // Act
        await playersRepo.delete(db, player.id);
        const reloaded = await playersRepo.findById(db, player.id);

        // Assert
        expect(reloaded).toBeUndefined();
    });
});
