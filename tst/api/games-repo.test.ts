import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDb } from './testdb';
import { gamesRepo } from '@api/repos/games';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { resultsRepo } from '@api/repos/results';

describe('gamesRepo', () => {
    let db: D1Database;

    beforeEach(() => {
        db = createTestDb();
    });

    test('create returns the new game with id and timestamps', async () => {
        // Arrange, Act
        const game = await gamesRepo.create(db, { name: 'Friends', passwordHash: 'h1' });

        // Assert
        expect(game.id).toBeGreaterThan(0);
        expect(game.name).toBe('Friends');
        expect(game.passwordHash).toBe('h1');
        expect(game.createdAt).toBeGreaterThan(0);
    });

    test('findById returns the created game', async () => {
        // Arrange
        const created = await gamesRepo.create(db, { name: 'Friends', passwordHash: 'h1' });

        // Act
        const found = await gamesRepo.findById(db, created.id);

        // Assert
        expect(found).toEqual(created);
    });

    test('findById returns undefined when no row matches', async () => {
        // Arrange, Act
        const found = await gamesRepo.findById(db, 999);

        // Assert
        expect(found).toBeUndefined();
    });

    test('findByName returns undefined when no match exists', async () => {
        // Arrange, Act, Assert
        expect(await gamesRepo.findByName(db, 'no such game')).toBeUndefined();
    });

    test('findByName is case-insensitive', async () => {
        // Arrange
        await gamesRepo.create(db, { name: 'Friends 2026', passwordHash: 'h1' });

        // Act
        const found = await gamesRepo.findByName(db, 'friends 2026');

        // Assert
        expect(found?.name).toBe('Friends 2026');
    });

    test('rejects duplicate game name regardless of case', async () => {
        // Arrange
        await gamesRepo.create(db, { name: 'Friends', passwordHash: 'h1' });

        // Act, Assert
        await expect(gamesRepo.create(db, { name: 'friends', passwordHash: 'h2' })).rejects.toThrow();
    });

    test('listAll returns games sorted by name (case-insensitive)', async () => {
        // Arrange
        await gamesRepo.create(db, { name: 'Bravo', passwordHash: 'h' });
        await gamesRepo.create(db, { name: 'alpha', passwordHash: 'h' });
        await gamesRepo.create(db, { name: 'Charlie', passwordHash: 'h' });

        // Act
        const list = await gamesRepo.listAll(db);

        // Assert
        expect(list.map((g) => g.name)).toEqual(['alpha', 'Bravo', 'Charlie']);
    });

    test('listAll on an empty DB returns an empty array', async () => {
        // Arrange, Act, Assert
        expect(await gamesRepo.listAll(db)).toEqual([]);
    });

    test('delete removes the game and wipes its players + predictions, leaving global results', async () => {
        // Arrange — a game with a player who has a prediction, plus a global match result
        const game = await gamesRepo.create(db, { name: 'Doomed', passwordHash: 'h' });
        const player = await playersRepo.create(db, { gameId: game.id, displayName: 'Alice', passwordHash: 'h' });
        await predictionsRepo.upsert(db, { playerId: player.id, matchId: 'G_A_1', score: { home: 2, away: 1 } });
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 } });

        // Act
        await gamesRepo.delete(db, game.id);

        // Assert — game, its players, and their predictions are gone
        expect(await gamesRepo.findById(db, game.id)).toBeUndefined();
        expect(await playersRepo.findById(db, player.id)).toBeUndefined();
        expect(await predictionsRepo.findByPlayer(db, player.id)).toEqual([]);
        // ...but the official (global) match result is untouched
        expect(await resultsRepo.findById(db, 'G_A_1')).toBeDefined();
    });

    test('delete is idempotent for a non-existent game', async () => {
        // Arrange, Act, Assert — no throw
        await expect(gamesRepo.delete(db, 999)).resolves.toBeUndefined();
    });
});
