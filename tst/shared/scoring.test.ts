import { describe, test, expect } from 'vitest';
import {
    scoreMatch,
    scoreMatchWeighted,
    computeLeaderboard,
    determineChampion,
    PHASE_MULTIPLIER,
    CHAMPION_BONUS,
} from '@shared/scoring';
import type { Phase, Score } from '@shared/types';

describe('scoreMatch', () => {
    test('returns 7 for an exact non-draw match', () => {
        // Arrange
        const prediction: Score = { home: 2, away: 1 };
        const actual: Score = { home: 2, away: 1 };

        // Act, Assert
        expect(scoreMatch(prediction, actual)).toBe(7);
    });

    test('returns 7 for an exact draw', () => {
        // Arrange, Act, Assert
        expect(scoreMatch({ home: 1, away: 1 }, { home: 1, away: 1 })).toBe(7);
    });

    test('returns 7 for exact 0-0', () => {
        // Arrange, Act, Assert
        expect(scoreMatch({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(7);
    });

    test('returns 5 for correct outcome and correct goal difference but inexact', () => {
        // Arrange, Act, Assert
        expect(scoreMatch({ home: 3, away: 2 }, { home: 2, away: 1 })).toBe(5);
    });

    test('returns 5 for inexact draw', () => {
        // Draw outcome implies same |GD|=0; an inexact draw still gets 5.
        expect(scoreMatch({ home: 2, away: 2 }, { home: 1, away: 1 })).toBe(5);
    });

    test('returns 3 for correct outcome but wrong goal difference', () => {
        // 4-1 predicted, 2-1 actual: both home wins, different margins.
        expect(scoreMatch({ home: 4, away: 1 }, { home: 2, away: 1 })).toBe(3);
    });

    test('returns 2 for wrong outcome but correct absolute goal difference', () => {
        // 1-2 predicted (away by 1), 2-1 actual (home by 1): same |GD|, different winner.
        expect(scoreMatch({ home: 1, away: 2 }, { home: 2, away: 1 })).toBe(2);
    });

    test('returns 0 for wrong outcome and wrong goal difference', () => {
        expect(scoreMatch({ home: 0, away: 3 }, { home: 2, away: 1 })).toBe(0);
    });

    test('returns 0 for a predicted draw with wrong outcome and wrong |GD|', () => {
        // 1-1 predicted (draw, |GD|=0), 2-0 actual (home win, |GD|=2)
        expect(scoreMatch({ home: 1, away: 1 }, { home: 2, away: 0 })).toBe(0);
    });
});

describe('scoreMatchWeighted', () => {
    const exact: [Score, Score] = [{ home: 2, away: 1 }, { home: 2, away: 1 }];

    test.each<Phase>(['GROUP', 'R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'])(
        'multiplies score by phase factor for %s',
        (phase) => {
            // Arrange
            const expected = 7 * PHASE_MULTIPLIER[phase];

            // Act
            const actual = scoreMatchWeighted(exact[0], exact[1], phase);

            // Assert
            expect(actual).toBe(expected);
        },
    );

    test('uses Group ×1, R32 ×2, R16 ×3, QF ×4, SF ×5, 3RD ×5, FINAL ×6', () => {
        // Arrange, Act, Assert
        expect(PHASE_MULTIPLIER).toEqual({
            GROUP: 1,
            R32: 2,
            R16: 3,
            QF: 4,
            SF: 5,
            '3RD': 5,
            FINAL: 6,
        });
    });
});

describe('computeLeaderboard', () => {
    const matchA: { id: string; phase: Phase } = { id: 'G_A_1', phase: 'GROUP' };
    const matchB: { id: string; phase: Phase } = { id: 'G_B_1', phase: 'GROUP' };
    const matchFinal: { id: string; phase: Phase } = { id: 'M104', phase: 'FINAL' };

    const matchesById = new Map<string, { id: string; phase: Phase }>([
        [matchA.id, matchA],
        [matchB.id, matchB],
        [matchFinal.id, matchFinal],
    ]);

    test('ranks players by total points descending', () => {
        // Arrange
        const players = [
            { id: 1, displayName: 'Alice', championTeamId: undefined },
            { id: 2, displayName: 'Bob', championTeamId: undefined },
        ];
        const predictions = [
            { playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 } }, // exact = 7
            { playerId: 2, matchId: 'G_A_1', score: { home: 4, away: 1 } }, // outcome only = 3
        ];
        const results = new Map([['G_A_1', { home: 2, away: 1 }]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert
        expect(board.map((r) => r.displayName)).toEqual(['Alice', 'Bob']);
        expect(board[0]!.totalPoints).toBe(7);
        expect(board[1]!.totalPoints).toBe(3);
    });

    test('tiebreaks by exact-score count, then correct-outcome count, then name', () => {
        // Arrange — three players tied on 10 points.
        // Alice: 1 exact (=7) + 1 outcome (=3) = 10, exactCount=1, outcomeCount=2
        // Bob: 2 outcome+GD (=5+5) = 10, exactCount=0, outcomeCount=2
        // Carol: same as Alice but name comes later alphabetically.
        const players = [
            { id: 1, displayName: 'Alice', championTeamId: undefined },
            { id: 2, displayName: 'Bob', championTeamId: undefined },
            { id: 3, displayName: 'Carol', championTeamId: undefined },
        ];
        const predictions = [
            // Alice: exact A, outcome-only B
            { playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 } },
            { playerId: 1, matchId: 'G_B_1', score: { home: 4, away: 1 } },
            // Bob: outcome+GD on both
            { playerId: 2, matchId: 'G_A_1', score: { home: 3, away: 2 } },
            { playerId: 2, matchId: 'G_B_1', score: { home: 3, away: 2 } },
            // Carol: same as Alice
            { playerId: 3, matchId: 'G_A_1', score: { home: 2, away: 1 } },
            { playerId: 3, matchId: 'G_B_1', score: { home: 4, away: 1 } },
        ];
        const results = new Map([
            ['G_A_1', { home: 2, away: 1 }],
            ['G_B_1', { home: 2, away: 1 }],
        ]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert — exactCount tiebreak puts Alice and Carol above Bob; name tiebreaks Alice over Carol
        expect(board.map((r) => r.displayName)).toEqual(['Alice', 'Carol', 'Bob']);
    });

    test('awards champion bonus only when player picked the actual winner', () => {
        // Arrange
        const players = [
            { id: 1, displayName: 'Alice', championTeamId: 'BRA' },
            { id: 2, displayName: 'Bob', championTeamId: 'ARG' },
            { id: 3, displayName: 'Carol', championTeamId: undefined },
        ];
        const predictions: never[] = [];
        const results = new Map<string, Score>();

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, 'BRA');

        // Assert
        const alice = board.find((r) => r.displayName === 'Alice')!;
        const bob = board.find((r) => r.displayName === 'Bob')!;
        const carol = board.find((r) => r.displayName === 'Carol')!;
        expect(alice.totalPoints).toBe(CHAMPION_BONUS);
        expect(bob.totalPoints).toBe(0);
        expect(carol.totalPoints).toBe(0);
    });

    test('does not award champion bonus when actual champion is undefined', () => {
        // Arrange
        const players = [{ id: 1, displayName: 'Alice', championTeamId: 'BRA' }];

        // Act
        const board = computeLeaderboard(players, [], new Map(), matchesById, undefined);

        // Assert
        expect(board[0]!.totalPoints).toBe(0);
    });

    test('returns empty array when there are no players', () => {
        // Arrange, Act
        const board = computeLeaderboard([], [], new Map(), matchesById, undefined);

        // Assert
        expect(board).toEqual([]);
    });

    test('skips predictions whose match has no result yet', () => {
        // Arrange
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 } }];
        const results = new Map<string, Score>(); // no results

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert
        expect(board[0]!.totalPoints).toBe(0);
    });

    test('weights points by match phase', () => {
        // Arrange
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'M104', score: { home: 2, away: 1 } }];
        const results = new Map([['M104', { home: 2, away: 1 }]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert — exact final = 7 × 6 = 42
        expect(board[0]!.totalPoints).toBe(42);
    });

    test('tracks exactScoreCount and correctOutcomeCount independently', () => {
        // Arrange — Alice: 1 exact (also counts as correct outcome) + 1 outcome-only
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [
            { playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 } }, // exact
            { playerId: 1, matchId: 'G_B_1', score: { home: 4, away: 1 } }, // outcome only
        ];
        const results = new Map([
            ['G_A_1', { home: 2, away: 1 }],
            ['G_B_1', { home: 2, away: 1 }],
        ]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert
        expect(board[0]!.exactScoreCount).toBe(1);
        expect(board[0]!.correctOutcomeCount).toBe(2);
    });

    test('CHAMPION_BONUS is 20', () => {
        // Arrange, Act, Assert
        expect(CHAMPION_BONUS).toBe(20);
    });

    test('skips a prediction whose match is not in the match lookup', () => {
        // Arrange
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'UNKNOWN', score: { home: 2, away: 1 } }];
        const results = new Map([['UNKNOWN', { home: 2, away: 1 } as Score]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert — unknown match yields no points
        expect(board[0]!.totalPoints).toBe(0);
    });

    test('does not increment correctOutcomeCount when the predicted outcome is wrong', () => {
        // Arrange — predict away win (1-2), actual home win (2-1)
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'G_A_1', score: { home: 1, away: 2 } }];
        const results = new Map([['G_A_1', { home: 2, away: 1 } as Score]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert — only |GD| matches → 2 pts, no exact, no outcome
        expect(board[0]!.totalPoints).toBe(2);
        expect(board[0]!.correctOutcomeCount).toBe(0);
        expect(board[0]!.exactScoreCount).toBe(0);
    });

    test('tiebreaks by correctOutcomeCount when total and exact are tied', () => {
        // Arrange — Alice: 1 outcome+GD (=5) + 1 wrong = 5 pts, 0 exact, 1 outcome
        //          Bob:   1 |GD|-only (=2) + 1 |GD|-only (=2) + 1 (=0) → no... let me redesign
        // Need same total (5) and same exact (0), but different outcome count.
        // Alice: 1 outcome+GD (sign match, |GD| match) = 5 pts, outcomeCount=1
        // Bob:   1 |GD|-only = 2 pts, plus... can't reach 5 with 0 outcome without exact.
        // Try: both have 0 exact and total 7, different outcome counts.
        // Alice: 1 outcome+GD (5) + 1 |GD|-only (2) = 7 pts, outcome=1
        // Bob:   1 outcome+GD (5) + 1 outcome only on a 2nd match (3) — that's 8. Different.
        // Bob:   3 |GD|-only (2*3=6 wait we only have 2 matches). Hmm.
        // Try: Alice 7 (5+2), Bob 7 (3+...): Bob 3+? No 3+x=7 needs x=4 unattainable.
        // Use 3 matches: Alice 5+2+0=7 (outcome=1); Bob 5+2+0=7 (outcome=1). Same.
        // Actually it's surprisingly hard. Let me use champion bonus to equalize.
        // Alice: champion bonus 20 + 1 wrong (0) = 20, outcomeCount=0, exactCount=0
        // Bob: 0 + 2 outcome+GD (5+5)+1 wrong (0) = 10 ... no still uneven.
        // Easier: rely on result equality via direct point arithmetic.
        // Alice: 1 outcome+GD = 5, outcomeCount=1, exactCount=0
        // Bob:   2 |GD|-only + 1 wrong = 4, no — can't tie at 5
        // Use champion bonus: Alice has championTeamId='BRA' matching, +20.
        //                    Bob has 20 from 4 outcome+GD matches = 5*4 = 20. Need 4 matches.
        // 4 matches makes the lookup big. Use a different approach:
        // Alice: 1 outcome+GD (5 pts) → exactCount=0, outcomeCount=1
        // Carol: 1 |GD|-only (2 pts) + 1 outcome-only (3 pts) = 5 pts → exactCount=0, outcomeCount=1
        // Same total (5), same exact (0), same outcome (1). Won't differentiate.
        // Use:
        // Alice: 2 outcome-only (3+3) = 6 pts, exactCount=0, outcomeCount=2
        // Bob:   1 outcome+GD (5) + 1 |GD|-only (2) = 7 → not equal.
        // Let me use 3 matches and align.
        // Alice: 1 outcome+GD + 1 outcome-only + 1 wrong = 5+3+0 = 8, exact=0, outcome=2
        // Bob:   2 outcome+GD + 1 wrong = 5+5+0 = 10. Not 8.
        // Bob:   1 outcome+GD + 1 outcome-only + 1 wrong = same as Alice. Same outcome count.
        // Bob:   1 outcome+GD + 1 |GD|-only + 1 outcome-only = 5+2+3 = 10. Off.
        // Try 3 matches, both score 5 pts:
        // Alice: 1 outcome+GD = 5, exact=0, outcome=1
        // Bob:   1 |GD|-only (2) + 1 outcome-only (3) = 5, exact=0, outcome=1
        // Same again.
        // The structure: outcome+GD => outcomeCount=1, points=5; outcome-only => outcome=1, points=3;
        // |GD|-only => outcome=0, points=2; exact => outcome=1, points=7.
        // To get same totalPoints + same exactCount but different outcomeCount, need:
        //   Alice: K matches yielding total T, with O_a correct outcomes
        //   Bob:   J matches yielding total T, with O_b ≠ O_a correct outcomes
        // Example: Alice 4 |GD|-only = 8 pts, exact=0, outcome=0. Bob 1 outcome+GD + 1 outcome-only = 8, exact=0, outcome=2. Total=8 both!
        // 4 matches needed for Alice though.
        const players = [
            { id: 1, displayName: 'Alice', championTeamId: undefined },
            { id: 2, displayName: 'Bob', championTeamId: undefined },
        ];
        const predictions = [
            // Alice: 4 |GD|-only predictions (away by 1, actual home by 1)
            { playerId: 1, matchId: 'G_A_1', score: { home: 0, away: 1 } },
            { playerId: 1, matchId: 'G_B_1', score: { home: 0, away: 1 } },
            { playerId: 1, matchId: 'G_C_1', score: { home: 0, away: 1 } },
            { playerId: 1, matchId: 'G_D_1', score: { home: 0, away: 1 } },
            // Bob: 1 outcome+GD (5) + 1 outcome-only (3) = 8, outcome=2
            { playerId: 2, matchId: 'G_A_1', score: { home: 3, away: 2 } },
            { playerId: 2, matchId: 'G_B_1', score: { home: 4, away: 1 } },
        ];
        const results = new Map<string, Score>([
            ['G_A_1', { home: 1, away: 0 }],
            ['G_B_1', { home: 1, away: 0 }],
            ['G_C_1', { home: 1, away: 0 }],
            ['G_D_1', { home: 1, away: 0 }],
        ]);
        const matches: typeof matchesById = new Map([
            ['G_A_1', { id: 'G_A_1', phase: 'GROUP' }],
            ['G_B_1', { id: 'G_B_1', phase: 'GROUP' }],
            ['G_C_1', { id: 'G_C_1', phase: 'GROUP' }],
            ['G_D_1', { id: 'G_D_1', phase: 'GROUP' }],
        ]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matches, undefined);

        // Assert — both have 8 pts and 0 exacts; Bob has 2 outcomes vs Alice's 0 → Bob first
        expect(board[0]!.totalPoints).toBe(8);
        expect(board[1]!.totalPoints).toBe(8);
        expect(board.map((r) => r.displayName)).toEqual(['Bob', 'Alice']);
    });
});

describe('determineChampion', () => {
    test('returns home team when home wins', () => {
        expect(determineChampion({ homeTeamId: 'BRA', awayTeamId: 'ARG' }, { home: 2, away: 1 })).toBe('BRA');
    });

    test('returns away team when away wins', () => {
        expect(determineChampion({ homeTeamId: 'BRA', awayTeamId: 'ARG' }, { home: 1, away: 2 })).toBe('ARG');
    });

    test('returns undefined on a draw at 90 minutes', () => {
        expect(determineChampion({ homeTeamId: 'BRA', awayTeamId: 'ARG' }, { home: 1, away: 1 })).toBeUndefined();
    });

    test('returns undefined when bracket is not resolved', () => {
        expect(determineChampion(undefined, { home: 1, away: 0 })).toBeUndefined();
    });

    test('returns undefined when score is missing', () => {
        expect(determineChampion({ homeTeamId: 'BRA', awayTeamId: 'ARG' }, undefined)).toBeUndefined();
    });
});
