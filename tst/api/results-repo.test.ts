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

    test('upsert persists the recorded first scorer', async () => {
        // Arrange, Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 }, firstScorer: 'AWAY' });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.firstScorer).toBe('AWAY');
    });

    test('upsert leaves first scorer undefined when none is given', async () => {
        // Arrange, Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 } });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.firstScorer).toBeUndefined();
    });

    test('upsert overwrites the recorded first scorer', async () => {
        // Arrange
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 0 }, firstScorer: 'HOME' });

        // Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 0, away: 0 }, firstScorer: 'NONE' });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.firstScorer).toBe('NONE');
    });

    test('rejects an invalid first-scorer value at the DB level', async () => {
        // Arrange, Act, Assert
        await expect(
            resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 0 }, firstScorer: 'BOTH' as never }),
        ).rejects.toThrow();
    });

    test('upsert defaults source to MANUAL', async () => {
        // Arrange, Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 0 } });

        // Assert
        expect((await resultsRepo.findById(db, 'G_A_1'))?.source).toBe('MANUAL');
    });

    test('upsert records an AUTO source for the sync', async () => {
        // Arrange, Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 0 }, source: 'AUTO' });

        // Assert
        expect((await resultsRepo.findById(db, 'G_A_1'))?.source).toBe('AUTO');
    });

    test('rejects an invalid source at the DB level', async () => {
        // Arrange, Act, Assert
        await expect(
            resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 0 }, source: 'ROBOT' as never }),
        ).rejects.toThrow();
    });

    test('an AUTO write does NOT overwrite an existing MANUAL row', async () => {
        // Arrange — admin recorded a result by hand
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 }, firstScorer: 'HOME' });

        // Act — the sync tries to write a different score
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 0, away: 0 }, firstScorer: 'NONE', source: 'AUTO' });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert — the manual row is untouched
        expect(found?.score).toEqual({ home: 2, away: 1 });
        expect(found?.firstScorer).toBe('HOME');
        expect(found?.source).toBe('MANUAL');
    });

    test('an AUTO write updates an existing AUTO row', async () => {
        // Arrange
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 1 }, source: 'AUTO' });

        // Act
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 1 }, firstScorer: 'HOME', source: 'AUTO' });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.score).toEqual({ home: 2, away: 1 });
        expect(found?.source).toBe('AUTO');
    });

    test('a MANUAL write overwrites an existing AUTO row (admin correction wins)', async () => {
        // Arrange — sync wrote a result
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 1, away: 1 }, firstScorer: 'HOME', source: 'AUTO' });

        // Act — admin corrects it
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 2, away: 0 }, firstScorer: 'HOME' });
        const found = await resultsRepo.findById(db, 'G_A_1');

        // Assert
        expect(found?.score).toEqual({ home: 2, away: 0 });
        expect(found?.source).toBe('MANUAL');
    });

    test('an AUTO write inserts a brand-new row', async () => {
        // Arrange, Act
        await resultsRepo.upsert(db, { matchId: 'G_C_1', score: { home: 3, away: 0 }, firstScorer: 'HOME', source: 'AUTO' });

        // Assert
        expect((await resultsRepo.findById(db, 'G_C_1'))?.source).toBe('AUTO');
    });
});
