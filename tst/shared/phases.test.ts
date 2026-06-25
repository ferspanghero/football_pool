import { describe, test, expect } from 'vitest';
import {
    PHASES,
    phaseById,
    phaseOrder,
    isGroupMatch,
    isKnockoutMatch,
    hasResolvedTeams,
    buildPhaseGroups,
    currentPhaseIndex,
} from '@shared/phases';
import { MATCHES, TEAMS } from '@data/tournament';
import type { Match } from '@shared/types';

const ORDER = ['GROUP_R1', 'GROUP_R2', 'GROUP_R3', 'R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL'] as const;

describe('PHASES', () => {
    test('lists nine phases in chronological order', () => {
        // Arrange, Act, Assert
        expect(PHASES.map((p) => p.id)).toEqual([...ORDER]);
    });

    test('group rounds are stage GROUP ×1; knockout multipliers escalate', () => {
        // Arrange, Act, Assert
        for (const id of ['GROUP_R1', 'GROUP_R2', 'GROUP_R3'] as const) {
            expect(phaseById(id).stage).toBe('GROUP');
            expect(phaseById(id).multiplier).toBe(1);
        }
        expect(phaseById('R32').stage).toBe('KNOCKOUT');
        expect([phaseById('R32'), phaseById('R16'), phaseById('QF'), phaseById('SF'), phaseById('FINAL')].map((p) => p.multiplier)).toEqual([2, 3, 4, 5, 6]);
    });

    test('every phase is boostable except the single-match 3rd-place and final rounds', () => {
        // Arrange, Act, Assert — boostability is a first-class phase property, not derived.
        for (const id of ['GROUP_R1', 'GROUP_R2', 'GROUP_R3', 'R32', 'R16', 'QF', 'SF'] as const) {
            expect(phaseById(id).boostable).toBe(true);
        }
        expect(phaseById('THIRD').boostable).toBe(false);
        expect(phaseById('FINAL').boostable).toBe(false);
    });
});

describe('phaseOrder', () => {
    test('reflects chronological position', () => {
        // Arrange, Act, Assert
        expect(phaseOrder('GROUP_R1')).toBe(0);
        expect(phaseOrder('FINAL')).toBe(8);
        expect(phaseOrder('R32')).toBeGreaterThan(phaseOrder('GROUP_R3'));
    });
});

describe('isGroupMatch / isKnockoutMatch', () => {
    test('classify the real schedule (72 group, 32 knockout)', () => {
        // Arrange, Act, Assert
        expect(MATCHES.filter(isGroupMatch)).toHaveLength(72);
        expect(MATCHES.filter(isKnockoutMatch)).toHaveLength(32);
    });
});

describe('hasResolvedTeams', () => {
    test('is true for a group match (real teams on both sides)', () => {
        // Arrange
        const groupMatch = MATCHES.find((m) => m.id === 'G_A_1')!;

        // Act, Assert
        expect(hasResolvedTeams(groupMatch, TEAMS)).toBe(true);
    });

    test('is false for a knockout match still using placeholder labels', () => {
        // Arrange
        const knockout = MATCHES.find((m) => m.id === 'M73')!;

        // Act, Assert
        expect(hasResolvedTeams(knockout, TEAMS)).toBe(false);
    });

    test('is true once both knockout sides are real team ids', () => {
        // Arrange
        const resolved: Match = { ...MATCHES.find((m) => m.id === 'M73')!, homeTeamId: 'MEX', awayTeamId: 'BRA' };

        // Act, Assert
        expect(hasResolvedTeams(resolved, TEAMS)).toBe(true);
    });

    test('is false when only one side is a real team', () => {
        // Arrange
        const halfResolved: Match = { ...MATCHES.find((m) => m.id === 'M73')!, homeTeamId: 'MEX' };

        // Act, Assert
        expect(hasResolvedTeams(halfResolved, TEAMS)).toBe(false);
    });
});

describe('buildPhaseGroups', () => {
    test('buckets the full schedule into the nine phases in order', () => {
        // Arrange, Act
        const groups = buildPhaseGroups(MATCHES);

        // Assert
        expect(groups.map((g) => g.phase.id)).toEqual([...ORDER]);
        expect(groups[0]!.matches).toHaveLength(24);
        expect(groups.at(-1)!.matches).toHaveLength(1);
    });

    test('drops empty phases and sorts each phase by kickoff', () => {
        // Arrange
        const only = MATCHES.filter((m) => m.phase === 'R32');

        // Act
        const groups = buildPhaseGroups(only);

        // Assert
        expect(groups).toHaveLength(1);
        expect(groups[0]!.phase.id).toBe('R32');
        const kickoffs = groups[0]!.matches.map((m) => m.kickoffUtc);
        expect(kickoffs).toEqual([...kickoffs].sort());
    });
});

describe('currentPhaseIndex', () => {
    const groups = buildPhaseGroups(MATCHES);

    test('before the tournament → first phase', () => {
        // Arrange, Act, Assert
        expect(currentPhaseIndex(groups, Date.parse('2026-01-01T00:00:00Z'))).toBe(0);
    });

    test('after the final → last phase', () => {
        // Arrange, Act, Assert
        expect(currentPhaseIndex(groups, Date.parse('2027-01-01T00:00:00Z'))).toBe(groups.length - 1);
    });

    test('just after round 1 finishes → round 2', () => {
        // Arrange
        const round1End = Math.max(...groups[0]!.matches.map((m) => Date.parse(m.kickoffUtc)));

        // Act, Assert
        expect(currentPhaseIndex(groups, round1End + 1)).toBe(1);
    });

    test('no phases → 0', () => {
        // Arrange, Act, Assert
        const empty: ReturnType<typeof buildPhaseGroups> = buildPhaseGroups([] as Match[]);
        expect(currentPhaseIndex(empty, Date.now())).toBe(0);
    });
});
