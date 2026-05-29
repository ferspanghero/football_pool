import { describe, test, expect } from 'vitest';
import { scoreMatch, scoreMatchWeighted, computeLeaderboard, determineChampion, CHAMPION_BONUS } from '@shared/scoring';
import { PHASES, phaseById } from '@shared/phases';
import type { PhaseId, Score } from '@shared/types';

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

    test.each(PHASES)('multiplies score by the $id phase multiplier', (phase) => {
        // Arrange, Act
        const actual = scoreMatchWeighted(exact[0], exact[1], phase.id);

        // Assert
        expect(actual).toBe(7 * phase.multiplier);
    });

    test('uses group ×1, R32 ×2, R16 ×3, QF ×4, SF ×5, 3rd ×5, Final ×6', () => {
        // Arrange, Act, Assert
        expect(phaseById('GROUP_R1').multiplier).toBe(1);
        expect(phaseById('GROUP_R2').multiplier).toBe(1);
        expect(phaseById('GROUP_R3').multiplier).toBe(1);
        expect(phaseById('R32').multiplier).toBe(2);
        expect(phaseById('R16').multiplier).toBe(3);
        expect(phaseById('QF').multiplier).toBe(4);
        expect(phaseById('SF').multiplier).toBe(5);
        expect(phaseById('THIRD').multiplier).toBe(5);
        expect(phaseById('FINAL').multiplier).toBe(6);
    });
});

describe('computeLeaderboard', () => {
    const matchA: { id: string; phase: PhaseId } = { id: 'G_A_1', phase: 'GROUP_R1' };
    const matchB: { id: string; phase: PhaseId } = { id: 'G_B_1', phase: 'GROUP_R1' };
    const matchFinal: { id: string; phase: PhaseId } = { id: 'M104', phase: 'FINAL' };

    const matchesById = new Map<string, { id: string; phase: PhaseId }>([
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

    test('tracks exact, outcome, and goal-diff counts independently', () => {
        // Arrange — Alice: G_A_1 exact (|GD| right), G_B_1 outcome-only (4-1 |GD|=3 vs 2-1 |GD|=1, wrong)
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [
            { playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 } }, // exact → outcome + |GD|
            { playerId: 1, matchId: 'G_B_1', score: { home: 4, away: 1 } }, // outcome only, |GD| wrong
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
        expect(board[0]!.correctGoalDiffCount).toBe(1);
    });

    test('CHAMPION_BONUS is 100', () => {
        // Arrange, Act, Assert
        expect(CHAMPION_BONUS).toBe(100);
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

        // Assert — only |GD| matches → 2 pts, no exact, no outcome, but goal-diff counts
        expect(board[0]!.totalPoints).toBe(2);
        expect(board[0]!.correctOutcomeCount).toBe(0);
        expect(board[0]!.exactScoreCount).toBe(0);
        expect(board[0]!.correctGoalDiffCount).toBe(1);
    });

    test('tiebreaks by correctOutcomeCount when total and exact are tied', () => {
        // Arrange — both players reach 8 points with 0 exact scores, differing only in outcome count:
        //   Alice: 4 |GD|-only predictions (2 pts each), 0 correct outcomes
        //   Bob:   1 outcome+GD (5 pts) + 1 outcome-only (3 pts), 2 correct outcomes
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
        const matches = new Map<string, { id: string; phase: PhaseId }>([
            ['G_A_1', { id: 'G_A_1', phase: 'GROUP_R1' }],
            ['G_B_1', { id: 'G_B_1', phase: 'GROUP_R1' }],
            ['G_C_1', { id: 'G_C_1', phase: 'GROUP_R1' }],
            ['G_D_1', { id: 'G_D_1', phase: 'GROUP_R1' }],
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
