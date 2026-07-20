import { describe, test, expect } from 'vitest';
import { TEAMS, MATCHES, FIRST_KICKOFF_UTC, CHAMPION } from '@data/tournament';
import { isGroupMatch } from '@shared/phases';
import type { GroupLetter } from '@shared/types';

const ALL_GROUPS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

describe('TEAMS', () => {
    test('has exactly 48 qualified teams', () => {
        // Arrange, Act, Assert
        expect(TEAMS).toHaveLength(48);
    });

    test('every team id is unique', () => {
        // Arrange
        const ids = TEAMS.map((t) => t.id);

        // Act
        const uniqueIds = new Set(ids);

        // Assert
        expect(uniqueIds.size).toBe(ids.length);
    });

    test('every team name is unique', () => {
        // Arrange
        const names = TEAMS.map((t) => t.name);

        // Act
        const uniqueNames = new Set(names);

        // Assert
        expect(uniqueNames.size).toBe(names.length);
    });

    test('every group has exactly 4 teams', () => {
        // Arrange, Act
        const counts = new Map<GroupLetter, number>();
        for (const team of TEAMS) {
            counts.set(team.group, (counts.get(team.group) ?? 0) + 1);
        }

        // Assert
        for (const group of ALL_GROUPS) {
            expect(counts.get(group), `Group ${group}`).toBe(4);
        }
    });

    test('every group letter A-L is represented', () => {
        // Arrange
        const groups = new Set(TEAMS.map((t) => t.group));

        // Act, Assert
        for (const group of ALL_GROUPS) {
            expect(groups.has(group), `Group ${group}`).toBe(true);
        }
    });
});

describe('MATCHES', () => {
    test('has exactly 104 matches', () => {
        // Arrange, Act, Assert
        expect(MATCHES).toHaveLength(104);
    });

    test('every match id is unique', () => {
        // Arrange
        const ids = MATCHES.map((m) => m.id);

        // Act
        const uniqueIds = new Set(ids);

        // Assert
        expect(uniqueIds.size).toBe(ids.length);
    });

    test('has 72 group matches', () => {
        // Arrange, Act
        const groupMatches = MATCHES.filter(isGroupMatch);

        // Assert
        expect(groupMatches).toHaveLength(72);
    });

    test('splits group matches into three rounds of 24', () => {
        // Arrange, Act
        const byRound = new Map<string, number>();
        for (const m of MATCHES.filter(isGroupMatch)) {
            byRound.set(m.phase, (byRound.get(m.phase) ?? 0) + 1);
        }

        // Assert
        expect(byRound.get('GROUP_R1')).toBe(24);
        expect(byRound.get('GROUP_R2')).toBe(24);
        expect(byRound.get('GROUP_R3')).toBe(24);
    });

    test('has 16 R32 matches', () => {
        // Arrange, Act
        const r32 = MATCHES.filter((m) => m.phase === 'R32');

        // Assert
        expect(r32).toHaveLength(16);
    });

    test('has 8 R16 matches', () => {
        expect(MATCHES.filter((m) => m.phase === 'R16')).toHaveLength(8);
    });

    test('has 4 QF matches', () => {
        expect(MATCHES.filter((m) => m.phase === 'QF')).toHaveLength(4);
    });

    test('has 2 SF matches', () => {
        expect(MATCHES.filter((m) => m.phase === 'SF')).toHaveLength(2);
    });

    test('has 1 third-place match', () => {
        expect(MATCHES.filter((m) => m.phase === 'THIRD')).toHaveLength(1);
    });

    test('has 1 final', () => {
        expect(MATCHES.filter((m) => m.phase === 'FINAL')).toHaveLength(1);
    });

    test('every team plays exactly 3 group matches', () => {
        // Arrange, Act
        const counts = new Map<string, number>();
        for (const m of MATCHES) {
            if (!isGroupMatch(m)) continue;
            counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
            counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
        }

        // Assert
        for (const team of TEAMS) {
            expect(counts.get(team.id), `Team ${team.name}`).toBe(3);
        }
    });

    test('group matches reference teams from their own group', () => {
        // Arrange
        const teamGroup = new Map(TEAMS.map((t) => [t.id, t.group]));

        // Act, Assert
        for (const m of MATCHES) {
            if (!isGroupMatch(m)) continue;
            expect(teamGroup.get(m.homeTeamId), `${m.id} home`).toBe(m.group);
            expect(teamGroup.get(m.awayTeamId), `${m.id} away`).toBe(m.group);
        }
    });

    test('every match kickoff is a valid ISO 8601 UTC timestamp', () => {
        // Arrange, Act, Assert
        for (const m of MATCHES) {
            expect(m.kickoffUtc, m.id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
            expect(Number.isNaN(Date.parse(m.kickoffUtc)), m.id).toBe(false);
        }
    });

    test('every knockout match has two distinct, non-empty team labels', () => {
        // Arrange, Act
        const knockoutMatches = MATCHES.filter((m) => !isGroupMatch(m));

        // Assert
        expect(knockoutMatches).toHaveLength(32);
        for (const m of knockoutMatches) {
            expect(m.homeTeamId.length, `${m.id} home`).toBeGreaterThan(0);
            expect(m.awayTeamId.length, `${m.id} away`).toBeGreaterThan(0);
            expect(m.homeTeamId, `${m.id} sides`).not.toBe(m.awayTeamId);
        }
    });

    test('knockout feeder placeholders reference an existing match', () => {
        // Arrange — "Winner of M74" / "Loser of M101" placeholders must point at a real fixture
        const matchIds = new Set(MATCHES.map((m) => m.id));
        const feeder = /^(?:Winner|Loser) of (M\d+)$/;

        // Act, Assert
        for (const m of MATCHES.filter((m) => !isGroupMatch(m))) {
            for (const label of [m.homeTeamId, m.awayTeamId]) {
                const ref = feeder.exec(label);
                if (ref) expect(matchIds, `${m.id} → ${label}`).toContain(ref[1]);
            }
        }
    });
});

describe('CHAMPION', () => {
    test('is either unset or a real team id', () => {
        // Arrange — `TeamId` is a bare string alias, so a display name ('Spain') would typecheck as
        // readily as an id ('ESP') and then silently award the bonus to nobody
        const teamIds = TEAMS.map((t) => t.id);

        // Act, Assert
        expect(CHAMPION === undefined || teamIds.includes(CHAMPION)).toBe(true);
    });
});

describe('FIRST_KICKOFF_UTC', () => {
    test('equals the earliest kickoff in the schedule', () => {
        // Arrange
        const earliest = MATCHES.map((m) => Date.parse(m.kickoffUtc)).reduce((a, b) => Math.min(a, b));

        // Act, Assert
        expect(Date.parse(FIRST_KICKOFF_UTC)).toBe(earliest);
    });
});
