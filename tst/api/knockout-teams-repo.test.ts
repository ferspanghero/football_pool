import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDb } from './testdb';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';

describe('knockoutTeamsRepo', () => {
    let db: D1Database;

    beforeEach(() => {
        db = createTestDb();
    });

    test('upsert inserts a new override and findById returns it', async () => {
        // Arrange, Act
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' });
        const found = await knockoutTeamsRepo.findById(db, 'M73');

        // Assert
        expect(found).toMatchObject({ matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' });
        expect(found?.updatedAt).toBeGreaterThan(0);
    });

    test('upsert defaults source to AUTO (the sync is the common writer)', async () => {
        // Arrange, Act
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' });

        // Assert
        expect((await knockoutTeamsRepo.findById(db, 'M73'))?.source).toBe('AUTO');
    });

    test('upsert records a MANUAL source for an admin override', async () => {
        // Arrange, Act
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'MANUAL' });

        // Assert
        expect((await knockoutTeamsRepo.findById(db, 'M73'))?.source).toBe('MANUAL');
    });

    test('findById returns undefined when no override exists', async () => {
        // Arrange, Act, Assert
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toBeUndefined();
    });

    test('findAll returns every override; empty DB returns []', async () => {
        // Arrange
        expect(await knockoutTeamsRepo.findAll(db)).toEqual([]);
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' });
        await knockoutTeamsRepo.upsert(db, { matchId: 'M74', homeTeamId: 'GER', awayTeamId: 'BRA' });

        // Act, Assert
        expect(await knockoutTeamsRepo.findAll(db)).toHaveLength(2);
    });

    test('rejects an invalid source at the DB level', async () => {
        // Arrange, Act, Assert
        await expect(
            knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'ROBOT' as never }),
        ).rejects.toThrow();
    });

    test('an AUTO write does NOT overwrite an existing MANUAL row (admin correction wins)', async () => {
        // Arrange — admin sets the teams by hand
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'MANUAL' });

        // Act — the sync later tries to write different teams
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'BRA', awayTeamId: 'GER', source: 'AUTO' });

        // Assert — the MANUAL row stands untouched
        const found = await knockoutTeamsRepo.findById(db, 'M73');
        expect(found).toMatchObject({ homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'MANUAL' });
    });

    test('an AUTO write updates an existing AUTO row (self-healing, idempotent)', async () => {
        // Arrange
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'AUTO' });

        // Act
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'BRA', awayTeamId: 'GER', source: 'AUTO' });

        // Assert
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toMatchObject({ homeTeamId: 'BRA', awayTeamId: 'GER', source: 'AUTO' });
    });

    test('clear removes an override (and is a no-op when none exists)', async () => {
        // Arrange
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' });

        // Act
        await knockoutTeamsRepo.clear(db, 'M73');
        await knockoutTeamsRepo.clear(db, 'M74'); // no row — no-op, no throw

        // Assert
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toBeUndefined();
    });

    test('a MANUAL write overwrites an existing AUTO row', async () => {
        // Arrange
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'AUTO' });

        // Act — admin corrects it
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'BRA', awayTeamId: 'GER', source: 'MANUAL' });

        // Assert
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toMatchObject({ homeTeamId: 'BRA', awayTeamId: 'GER', source: 'MANUAL' });
    });
});
