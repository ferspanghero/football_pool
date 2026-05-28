import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDb } from './testdb';
import { resultsRepo } from '@api/repos/results';

describe('resultsRepo', () => {
    let db: D1Database;

    beforeEach(() => {
        db = createTestDb();
    });

    test('upsert inserts a new result', async () => {
        // Arrange, Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 } });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.score).toEqual({ home: 2, away: 1 });
        expect(found?.recordedAt).toBeGreaterThan(0);
    });

    test('upsert overwrites an existing result', async () => {
        // Arrange
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 } });

        // Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 3, away: 0 } });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.score).toEqual({ home: 3, away: 0 });
    });

    test('findById returns undefined when no result exists', async () => {
        // Arrange, Act, Assert
        expect(await resultsRepo.findById(db, 'unknown')).toBeUndefined();
    });

    test('findAll returns every recorded result', async () => {
        // Arrange
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 0 } });
        await resultsRepo.upsert(db, { matchId: 'G_B_1', score: { home: 2, away: 2 } });

        // Act
        const all = await resultsRepo.findAll(db);

        // Assert
        expect(all).toHaveLength(2);
    });

    test('findAll on empty DB returns empty array', async () => {
        // Arrange, Act, Assert
        expect(await resultsRepo.findAll(db)).toEqual([]);
    });

    test('rejects negative scores at the DB level', async () => {
        // Arrange, Act, Assert
        await expect(resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: -1, away: 0 } })).rejects.toThrow();
    });
});
