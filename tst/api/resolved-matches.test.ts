import { describe, test, expect } from 'vitest';
import { resolveMatches, getResolvedMatches } from '@api/resolved-matches';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import { createTestDb } from './testdb';
import { MATCHES } from '@data/tournament';
import type { Match } from '@shared/types';

const m = (id: string, homeTeamId: string, awayTeamId: string): Match => ({
    id,
    phase: 'R32',
    kickoffUtc: '2026-06-28T19:00:00Z',
    homeTeamId,
    awayTeamId,
});

describe('resolveMatches (pure merge)', () => {
    test('swaps in an override’s team ids for the matching fixture', () => {
        // Arrange
        const base = [m('M73', 'Runner-up of Group A', 'Runner-up of Group B')];

        // Act
        const [resolved] = resolveMatches(base, [{ matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' }]);

        // Assert — team ids resolved, everything else (id, phase, kickoff) preserved
        expect(resolved).toMatchObject({ id: 'M73', phase: 'R32', homeTeamId: 'MEX', awayTeamId: 'CAN' });
    });

    test('leaves a fixture with no override untouched', () => {
        // Arrange
        const base = [m('M73', 'Runner-up of Group A', 'Runner-up of Group B')];

        // Act
        const [resolved] = resolveMatches(base, [{ matchId: 'M99', homeTeamId: 'BRA', awayTeamId: 'ARG' }]);

        // Assert
        expect(resolved).toEqual(base[0]);
    });

    test('returns one entry per base fixture in the same order', () => {
        // Arrange
        const base = [m('M73', 'a', 'b'), m('M74', 'c', 'd')];

        // Act
        const out = resolveMatches(base, [{ matchId: 'M74', homeTeamId: 'GER', awayTeamId: 'BRA' }]);

        // Assert
        expect(out.map((x) => x.id)).toEqual(['M73', 'M74']);
        expect(out[1]).toMatchObject({ homeTeamId: 'GER', awayTeamId: 'BRA' });
    });

    test('does not mutate the input fixtures', () => {
        // Arrange
        const base = [m('M73', 'placeholder-home', 'placeholder-away')];

        // Act
        resolveMatches(base, [{ matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' }]);

        // Assert
        expect(base[0]!.homeTeamId).toBe('placeholder-home');
    });
});

describe('getResolvedMatches (db-backed)', () => {
    test('merges the overlay onto the static MATCHES', async () => {
        // Arrange
        const db = createTestDb();
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'MEX', awayTeamId: 'CAN' });

        // Act
        const resolved = await getResolvedMatches(db);

        // Assert — same count as the static base, with M73 resolved and a group match untouched
        expect(resolved).toHaveLength(MATCHES.length);
        expect(resolved.find((x) => x.id === 'M73')).toMatchObject({ homeTeamId: 'MEX', awayTeamId: 'CAN' });
        expect(resolved.find((x) => x.id === 'G_A_1')).toMatchObject({ homeTeamId: 'MEX', awayTeamId: 'RSA' });
    });

    test('returns the static MATCHES unchanged when the overlay is empty', async () => {
        // Arrange
        const db = createTestDb();

        // Act
        const resolved = await getResolvedMatches(db);

        // Assert
        expect(resolved.find((x) => x.id === 'M73')).toMatchObject({ homeTeamId: 'Runner-up of Group A' });
    });
});
