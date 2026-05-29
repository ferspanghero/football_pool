import { describe, test, expect } from 'vitest';
import { matchSides } from '@/lib/matchDisplay';
import { MATCHES, TEAMS } from '@data/tournament';
import type { Match } from '@shared/types';

const groupMatch = MATCHES.find((m) => m.id === 'G_A_1')!; // Mexico vs South Africa
const knockoutMatch = MATCHES.find((m) => m.id === 'M73')!; // placeholder labels

describe('matchSides', () => {
    test('returns team names with flags for a group match', () => {
        // Arrange, Act
        const sides = matchSides(groupMatch, TEAMS);

        // Assert
        expect(sides.home).toEqual({ name: 'Mexico', flag: '🇲🇽' });
        expect(sides.away).toEqual({ name: 'South Africa', flag: '🇿🇦' });
    });

    test('renders an unresolved knockout placeholder as its label with no flag', () => {
        // Arrange, Act
        const sides = matchSides(knockoutMatch, TEAMS);

        // Assert
        expect(sides.home).toEqual({ name: 'Runner-up of Group A', flag: '' });
        expect(sides.away).toEqual({ name: 'Runner-up of Group B', flag: '' });
    });

    test('falls back to the id with an empty flag when the team is unknown', () => {
        // Arrange
        const orphan: Match = { ...groupMatch, homeTeamId: 'ZZZ' };

        // Act, Assert
        expect(matchSides(orphan, TEAMS).home).toEqual({ name: 'ZZZ', flag: '' });
    });
});
