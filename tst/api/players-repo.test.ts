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

    test('create inserts a new player with a password hash', async () => {
        // Arrange, Act
        const player = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Assert
        expect(player.id).toBeGreaterThan(0);
        expect(player.gameId).toBe(gameId);
        expect(player.displayName).toBe('Alice');
        expect(player.championTeamId).toBeUndefined();
    });

    test('create rejects a duplicate display name within the same game (case-insensitive)', async () => {
        // Arrange
        await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Act, Assert — the UNIQUE(game_id, display_name) COLLATE NOCASE constraint blocks the dupe
        await expect(playersRepo.create(db, { gameId, displayName: 'alice', passwordHash: 'ph2' })).rejects.toThrow();
    });

    test('create isolates players per game', async () => {
        // Arrange
        const g2 = await gamesRepo.create(db, { name: 'G2', passwordHash: 'h' });
        const aliceG1 = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });
        const aliceG2 = await playersRepo.create(db, { gameId: g2.id, displayName: 'Alice', passwordHash: 'ph' });

        // Act, Assert
        expect(aliceG1.id).not.toBe(aliceG2.id);
    });

    test('findByName returns the player and its stored password hash, case-insensitively', async () => {
        // Arrange
        const created = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Act
        const found = await playersRepo.findByName(db, gameId, 'alice');

        // Assert
        expect(found?.id).toBe(created.id);
        expect(found?.displayName).toBe('Alice');
        expect(found?.passwordHash).toBe('ph');
    });

    test('findByName returns undefined for an unknown name', async () => {
        // Arrange, Act, Assert
        expect(await playersRepo.findByName(db, gameId, 'Nobody')).toBeUndefined();
    });

    test('findByName is scoped to the game', async () => {
        // Arrange — same name in another game must not match
        const g2 = await gamesRepo.create(db, { name: 'G2', passwordHash: 'h' });
        await playersRepo.create(db, { gameId: g2.id, displayName: 'Alice', passwordHash: 'ph' });

        // Act, Assert
        expect(await playersRepo.findByName(db, gameId, 'Alice')).toBeUndefined();
    });

    test('findById returns the player', async () => {
        // Arrange
        const created = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Act
        const found = await playersRepo.findById(db, created.id);

        // Assert
        expect(found).toEqual(created);
    });

    test('findById returns undefined for unknown id', async () => {
        // Arrange, Act, Assert
        expect(await playersRepo.findById(db, 999)).toBeUndefined();
    });

    test('findById does not expose the password hash', async () => {
        // Arrange
        const created = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Act
        const found = await playersRepo.findById(db, created.id);

        // Assert — the general Player shape must never carry the secret
        expect(found).not.toHaveProperty('passwordHash');
    });

    test('listByGame returns all players in the game sorted by name', async () => {
        // Arrange
        await playersRepo.create(db, { gameId, displayName: 'Bob', passwordHash: 'ph' });
        await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });
        await playersRepo.create(db, { gameId, displayName: 'Carol', passwordHash: 'ph' });

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
        const player = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Act
        await playersRepo.setChampionTeamId(db, player.id, 'BRA');
        const reloaded = await playersRepo.findById(db, player.id);

        // Assert
        expect(reloaded?.championTeamId).toBe('BRA');
    });

    test('setChampionTeamId can clear the pick with undefined', async () => {
        // Arrange
        const player = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });
        await playersRepo.setChampionTeamId(db, player.id, 'BRA');

        // Act
        await playersRepo.setChampionTeamId(db, player.id, undefined);
        const reloaded = await playersRepo.findById(db, player.id);

        // Assert
        expect(reloaded?.championTeamId).toBeUndefined();
    });

    test('delete removes the player', async () => {
        // Arrange
        const player = await playersRepo.create(db, { gameId, displayName: 'Alice', passwordHash: 'ph' });

        // Act
        await playersRepo.delete(db, player.id);
        const reloaded = await playersRepo.findById(db, player.id);

        // Assert
        expect(reloaded).toBeUndefined();
    });
});
