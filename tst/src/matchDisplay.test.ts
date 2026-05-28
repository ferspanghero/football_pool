import { describe, test, expect } from 'vitest';
import { matchSides } from '@/lib/matchDisplay';
import { MATCHES, TEAMS } from '@data/tournament';
import type { GroupMatch } from '@shared/types';

const groupMatch = MATCHES.find((m) => m.id === 'G_A_1')!; // Mexico vs South Africa
const knockoutMatch = MATCHES.find((m) => m.id === 'M73')!; // unresolved bracket slots

describe('matchSides', () => {
    test('returns team names with flags for a group match', () => {
        const sides = matchSides(groupMatch, TEAMS);

        expect(sides.home).toEqual({ name: 'Mexico', flag: '🇲🇽' });
        expect(sides.away).toEqual({ name: 'South Africa', flag: '🇿🇦' });
    });

    test('returns slot labels with no flag for a knockout match', () => {
        const sides = matchSides(knockoutMatch, TEAMS);

        expect(sides.home.flag).toBeUndefined();
        expect(sides.away.flag).toBeUndefined();
        expect(sides.home.name).toMatch(/Group|Winner|Best 3rd/);
    });

    test('falls back to the team id with an empty flag when the team is unknown', () => {
        const orphan: GroupMatch = { ...(groupMatch as GroupMatch), homeTeamId: 'ZZZ' };

        expect(matchSides(orphan, TEAMS).home).toEqual({ name: 'ZZZ', flag: '' });
    });
});
