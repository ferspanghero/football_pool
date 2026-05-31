import { describe, test, expect } from 'vitest';
import {
    scoreMatch,
    scoreMatchWeighted,
    scoreFirstScorer,
    scorePrediction,
    FIRST_SCORER_BONUS,
    computeLeaderboard,
    determineChampion,
    CHAMPION_BONUS,
} from '@shared/scoring';
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

describe('scoreFirstScorer', () => {
    test('awards the base bonus for a correct pick in the group stage (×1)', () => {
        // Arrange, Act, Assert
        expect(scoreFirstScorer('HOME', 'HOME', 'GROUP_R1')).toBe(FIRST_SCORER_BONUS);
    });

    test('weights the bonus by the phase multiplier', () => {
        // Arrange, Act, Assert — final ×6
        expect(scoreFirstScorer('AWAY', 'AWAY', 'FINAL')).toBe(FIRST_SCORER_BONUS * 6);
    });

    test('awards the bonus for a correctly predicted goalless match', () => {
        // Arrange, Act, Assert — NONE matches a 0-0
        expect(scoreFirstScorer('NONE', 'NONE', 'GROUP_R1')).toBe(FIRST_SCORER_BONUS);
    });

    test.each(PHASES)('scales a correct pick by the $id multiplier', (phase) => {
        // Arrange, Act, Assert
        expect(scoreFirstScorer('HOME', 'HOME', phase.id)).toBe(FIRST_SCORER_BONUS * phase.multiplier);
    });

    test('penalizes a wrong pick by the phase-weighted base', () => {
        // Arrange, Act, Assert — final ×6
        expect(scoreFirstScorer('HOME', 'AWAY', 'FINAL')).toBe(-FIRST_SCORER_BONUS * 6);
    });

    test('penalizes a wrong pick in the group stage by the flat base', () => {
        // Arrange, Act, Assert — group ×1
        expect(scoreFirstScorer('HOME', 'AWAY', 'GROUP_R1')).toBe(-FIRST_SCORER_BONUS);
    });

    test('penalizes a side pick when the match is goalless (no-goal actual)', () => {
        // Arrange, Act, Assert — a picked side never matches a 0-0, so it costs the base
        expect(scoreFirstScorer('HOME', 'NONE', 'GROUP_R1')).toBe(-FIRST_SCORER_BONUS);
    });

    test('awards nothing when the player made no pick', () => {
        // Arrange, Act, Assert
        expect(scoreFirstScorer(undefined, 'HOME', 'GROUP_R1')).toBe(0);
    });

    test('awards nothing when no actual first scorer was recorded', () => {
        // Arrange, Act, Assert
        expect(scoreFirstScorer('HOME', undefined, 'GROUP_R1')).toBe(0);
    });

    test('FIRST_SCORER_BONUS is 2', () => {
        // Arrange, Act, Assert
        expect(FIRST_SCORER_BONUS).toBe(2);
    });
});

describe('scorePrediction', () => {
    const exact: Score = { home: 2, away: 1 };

    test('returns weighted score with no first-scorer or boost', () => {
        // Arrange, Act
        const r = scorePrediction(exact, undefined, { home: 2, away: 1 }, undefined, 'GROUP_R1', false);

        // Assert
        expect(r).toEqual({ points: 7, firstScorerPoints: 0, base: 7 });
    });

    test('adds a correct first-scorer bonus', () => {
        // Arrange, Act — exact (7) + first scorer correct (+2), group ×1
        const r = scorePrediction(exact, 'HOME', { home: 2, away: 1 }, 'HOME', 'GROUP_R1', false);

        // Assert
        expect(r).toEqual({ points: 9, firstScorerPoints: 2, base: 7 });
    });

    test('subtracts a wrong first-scorer bonus', () => {
        // Arrange, Act — wrong score (0) + wrong first scorer (−2), group ×1
        const r = scorePrediction({ home: 0, away: 3 }, 'HOME', { home: 2, away: 1 }, 'AWAY', 'GROUP_R1', false);

        // Assert
        expect(r).toEqual({ points: -2, firstScorerPoints: -2, base: 0 });
    });

    test('doubles the whole contribution when boosted (first-scorer points included)', () => {
        // Arrange, Act — (exact 7×6 final + first scorer 2×6) × 2 boost; the first-scorer component
        // is reported doubled too, so it reconciles with the total.
        const r = scorePrediction(exact, 'HOME', { home: 2, away: 1 }, 'HOME', 'FINAL', true);

        // Assert
        expect(r).toEqual({ points: (42 + 12) * 2, firstScorerPoints: 24, base: 7 });
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

    test('adds the first-to-score bonus when the pick matches the recorded actual', () => {
        // Arrange — wrong score (0 base) but correct first scorer in the group stage (×1 → +2)
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'G_A_1', score: { home: 0, away: 3 }, firstScorer: 'HOME' as const }];
        const results = new Map([['G_A_1', { home: 2, away: 1 }]]);
        const firstScorers = new Map([['G_A_1', 'HOME' as const]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined, firstScorers);

        // Assert
        expect(board[0]!.totalPoints).toBe(2);
        expect(board[0]!.firstScorerPoints).toBe(2);
    });

    test('phase-weights the first-to-score bonus and stacks it on score points', () => {
        // Arrange — exact final score (7×6=42) + correct first scorer (2×6=12)
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'M104', score: { home: 2, away: 1 }, firstScorer: 'AWAY' as const }];
        const results = new Map([['M104', { home: 2, away: 1 }]]);
        const firstScorers = new Map([['M104', 'AWAY' as const]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined, firstScorers);

        // Assert
        expect(board[0]!.totalPoints).toBe(42 + 12);
    });

    test('penalizes a wrong first-scorer pick (−2 × phase) and reports it in firstScorerPoints', () => {
        // Arrange — exact score (7) but wrong first scorer in the group stage (−2)
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 }, firstScorer: 'AWAY' as const }];
        const results = new Map([['G_A_1', { home: 2, away: 1 }]]);
        const firstScorers = new Map([['G_A_1', 'HOME' as const]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined, firstScorers);

        // Assert — 7 − 2
        expect(board[0]!.totalPoints).toBe(5);
        expect(board[0]!.firstScorerPoints).toBe(-2);
    });

    test('ignores first-scorer picks when no actuals are provided (default)', () => {
        // Arrange — pick present, but the admin recorded no first scorer
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 }, firstScorer: 'HOME' as const }];
        const results = new Map([['G_A_1', { home: 2, away: 1 }]]);

        // Act — no first-scorer-actuals argument
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined);

        // Assert — only the exact-score points
        expect(board[0]!.totalPoints).toBe(7);
    });

    test('doubles a boosted match (both score and first-scorer points)', () => {
        // Arrange — group exact (7×1) + correct first scorer (2×1) = 9, boosted ×2 = 18
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [{ playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 }, firstScorer: 'HOME' as const }];
        const results = new Map([['G_A_1', { home: 2, away: 1 }]]);
        const firstScorers = new Map([['G_A_1', 'HOME' as const]]);
        const boosts = new Map([[1, new Map<PhaseId, string>([['GROUP_R1', 'G_A_1']])]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined, firstScorers, boosts);

        // Assert — total and the first-scorer column both reflect the boost
        expect(board[0]!.totalPoints).toBe((7 + 2) * 2);
        expect(board[0]!.firstScorerPoints).toBe(4);
    });

    test('boosts only the chosen match within a phase', () => {
        // Arrange — two group exacts (7 each); only G_A_1 is boosted
        const players = [{ id: 1, displayName: 'Alice', championTeamId: undefined }];
        const predictions = [
            { playerId: 1, matchId: 'G_A_1', score: { home: 2, away: 1 } },
            { playerId: 1, matchId: 'G_B_1', score: { home: 2, away: 1 } },
        ];
        const results = new Map([
            ['G_A_1', { home: 2, away: 1 }],
            ['G_B_1', { home: 2, away: 1 }],
        ]);
        const boosts = new Map([[1, new Map<PhaseId, string>([['GROUP_R1', 'G_A_1']])]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, undefined, new Map(), boosts);

        // Assert — 14 (boosted) + 7
        expect(board[0]!.totalPoints).toBe(21);
    });

    test('does not double the champion bonus', () => {
        // Arrange — boosted exact final (42 → 84) plus a correct champion pick (+100, flat)
        const players = [{ id: 1, displayName: 'Alice', championTeamId: 'BRA' }];
        const predictions = [{ playerId: 1, matchId: 'M104', score: { home: 2, away: 1 } }];
        const results = new Map([['M104', { home: 2, away: 1 }]]);
        const boosts = new Map([[1, new Map<PhaseId, string>([['FINAL', 'M104']])]]);

        // Act
        const board = computeLeaderboard(players, predictions, results, matchesById, 'BRA', new Map(), boosts);

        // Assert
        expect(board[0]!.totalPoints).toBe(84 + 100);
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
