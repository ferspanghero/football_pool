/**
 * Static FIFA 2026 tournament data: 48 teams in 12 groups, all 104 fixtures (72 group +
 * 32 knockout), and the bracket template that resolves at runtime once results come in.
 *
 * Kickoff times converted from Sky Sports' UK BST listing to UTC by subtracting one hour.
 * Bracket template (BEST_THIRD_OF eligibility per R32 slot) matches FIFA's published
 * mapping for the 48-team format.
 */

import type { GroupMatch, Match, PhaseId, Team } from '@shared/types';

/** Group matches play 2 fixtures per round (ids `_1`..`_6`), so round = ceil(suffix / 2). */
function groupRoundPhase(id: string): PhaseId {
    const suffix = Number(id.split('_')[2]);

    return `GROUP_R${Math.ceil(suffix / 2)}` as PhaseId;
}

/** All 48 qualified teams, grouped A-L. Each group has exactly 4 teams. */
export const TEAMS: Team[] = [
    { id: 'MEX', name: 'Mexico', group: 'A' },
    { id: 'RSA', name: 'South Africa', group: 'A' },
    { id: 'KOR', name: 'South Korea', group: 'A' },
    { id: 'CZE', name: 'Czech Republic', group: 'A' },

    { id: 'CAN', name: 'Canada', group: 'B' },
    { id: 'BIH', name: 'Bosnia & Herzegovina', group: 'B' },
    { id: 'QAT', name: 'Qatar', group: 'B' },
    { id: 'SUI', name: 'Switzerland', group: 'B' },

    { id: 'BRA', name: 'Brazil', group: 'C' },
    { id: 'MAR', name: 'Morocco', group: 'C' },
    { id: 'HAI', name: 'Haiti', group: 'C' },
    { id: 'SCO', name: 'Scotland', group: 'C' },

    { id: 'USA', name: 'United States', group: 'D' },
    { id: 'PAR', name: 'Paraguay', group: 'D' },
    { id: 'AUS', name: 'Australia', group: 'D' },
    { id: 'TUR', name: 'Turkey', group: 'D' },

    { id: 'GER', name: 'Germany', group: 'E' },
    { id: 'CUW', name: 'Curacao', group: 'E' },
    { id: 'CIV', name: 'Ivory Coast', group: 'E' },
    { id: 'ECU', name: 'Ecuador', group: 'E' },

    { id: 'NED', name: 'Netherlands', group: 'F' },
    { id: 'JPN', name: 'Japan', group: 'F' },
    { id: 'SWE', name: 'Sweden', group: 'F' },
    { id: 'TUN', name: 'Tunisia', group: 'F' },

    { id: 'BEL', name: 'Belgium', group: 'G' },
    { id: 'EGY', name: 'Egypt', group: 'G' },
    { id: 'IRN', name: 'Iran', group: 'G' },
    { id: 'NZL', name: 'New Zealand', group: 'G' },

    { id: 'ESP', name: 'Spain', group: 'H' },
    { id: 'CPV', name: 'Cape Verde', group: 'H' },
    { id: 'KSA', name: 'Saudi Arabia', group: 'H' },
    { id: 'URU', name: 'Uruguay', group: 'H' },

    { id: 'FRA', name: 'France', group: 'I' },
    { id: 'SEN', name: 'Senegal', group: 'I' },
    { id: 'IRQ', name: 'Iraq', group: 'I' },
    { id: 'NOR', name: 'Norway', group: 'I' },

    { id: 'ARG', name: 'Argentina', group: 'J' },
    { id: 'ALG', name: 'Algeria', group: 'J' },
    { id: 'AUT', name: 'Austria', group: 'J' },
    { id: 'JOR', name: 'Jordan', group: 'J' },

    { id: 'POR', name: 'Portugal', group: 'K' },
    { id: 'COD', name: 'DR Congo', group: 'K' },
    { id: 'UZB', name: 'Uzbekistan', group: 'K' },
    { id: 'COL', name: 'Colombia', group: 'K' },

    { id: 'ENG', name: 'England', group: 'L' },
    { id: 'CRO', name: 'Croatia', group: 'L' },
    { id: 'GHA', name: 'Ghana', group: 'L' },
    { id: 'PAN', name: 'Panama', group: 'L' },
];

const rawGroupMatches = [
    { id: 'G_A_1', group: 'A', kickoffUtc: '2026-06-11T19:00:00Z', homeTeamId: 'MEX', awayTeamId: 'RSA' },
    { id: 'G_A_2', group: 'A', kickoffUtc: '2026-06-12T02:00:00Z', homeTeamId: 'KOR', awayTeamId: 'CZE' },
    { id: 'G_A_3', group: 'A', kickoffUtc: '2026-06-18T16:00:00Z', homeTeamId: 'CZE', awayTeamId: 'RSA' },
    { id: 'G_A_4', group: 'A', kickoffUtc: '2026-06-19T01:00:00Z', homeTeamId: 'MEX', awayTeamId: 'KOR' },
    { id: 'G_A_5', group: 'A', kickoffUtc: '2026-06-25T01:00:00Z', homeTeamId: 'RSA', awayTeamId: 'KOR' },
    { id: 'G_A_6', group: 'A', kickoffUtc: '2026-06-25T01:00:00Z', homeTeamId: 'CZE', awayTeamId: 'MEX' },

    { id: 'G_B_1', group: 'B', kickoffUtc: '2026-06-12T19:00:00Z', homeTeamId: 'CAN', awayTeamId: 'BIH' },
    { id: 'G_B_2', group: 'B', kickoffUtc: '2026-06-13T19:00:00Z', homeTeamId: 'QAT', awayTeamId: 'SUI' },
    { id: 'G_B_3', group: 'B', kickoffUtc: '2026-06-18T19:00:00Z', homeTeamId: 'SUI', awayTeamId: 'BIH' },
    { id: 'G_B_4', group: 'B', kickoffUtc: '2026-06-18T22:00:00Z', homeTeamId: 'CAN', awayTeamId: 'QAT' },
    { id: 'G_B_5', group: 'B', kickoffUtc: '2026-06-24T19:00:00Z', homeTeamId: 'SUI', awayTeamId: 'CAN' },
    { id: 'G_B_6', group: 'B', kickoffUtc: '2026-06-24T19:00:00Z', homeTeamId: 'BIH', awayTeamId: 'QAT' },

    { id: 'G_C_1', group: 'C', kickoffUtc: '2026-06-13T22:00:00Z', homeTeamId: 'BRA', awayTeamId: 'MAR' },
    { id: 'G_C_2', group: 'C', kickoffUtc: '2026-06-14T01:00:00Z', homeTeamId: 'HAI', awayTeamId: 'SCO' },
    { id: 'G_C_3', group: 'C', kickoffUtc: '2026-06-19T22:00:00Z', homeTeamId: 'SCO', awayTeamId: 'MAR' },
    { id: 'G_C_4', group: 'C', kickoffUtc: '2026-06-20T00:30:00Z', homeTeamId: 'BRA', awayTeamId: 'HAI' },
    { id: 'G_C_5', group: 'C', kickoffUtc: '2026-06-24T22:00:00Z', homeTeamId: 'MAR', awayTeamId: 'HAI' },
    { id: 'G_C_6', group: 'C', kickoffUtc: '2026-06-24T22:00:00Z', homeTeamId: 'SCO', awayTeamId: 'BRA' },

    { id: 'G_D_1', group: 'D', kickoffUtc: '2026-06-13T01:00:00Z', homeTeamId: 'USA', awayTeamId: 'PAR' },
    { id: 'G_D_2', group: 'D', kickoffUtc: '2026-06-14T04:00:00Z', homeTeamId: 'AUS', awayTeamId: 'TUR' },
    { id: 'G_D_3', group: 'D', kickoffUtc: '2026-06-19T19:00:00Z', homeTeamId: 'USA', awayTeamId: 'AUS' },
    { id: 'G_D_4', group: 'D', kickoffUtc: '2026-06-20T03:00:00Z', homeTeamId: 'TUR', awayTeamId: 'PAR' },
    { id: 'G_D_5', group: 'D', kickoffUtc: '2026-06-26T02:00:00Z', homeTeamId: 'TUR', awayTeamId: 'USA' },
    { id: 'G_D_6', group: 'D', kickoffUtc: '2026-06-26T02:00:00Z', homeTeamId: 'PAR', awayTeamId: 'AUS' },

    { id: 'G_E_1', group: 'E', kickoffUtc: '2026-06-14T17:00:00Z', homeTeamId: 'GER', awayTeamId: 'CUW' },
    { id: 'G_E_2', group: 'E', kickoffUtc: '2026-06-14T23:00:00Z', homeTeamId: 'CIV', awayTeamId: 'ECU' },
    { id: 'G_E_3', group: 'E', kickoffUtc: '2026-06-20T20:00:00Z', homeTeamId: 'GER', awayTeamId: 'CIV' },
    { id: 'G_E_4', group: 'E', kickoffUtc: '2026-06-21T00:00:00Z', homeTeamId: 'ECU', awayTeamId: 'CUW' },
    { id: 'G_E_5', group: 'E', kickoffUtc: '2026-06-25T20:00:00Z', homeTeamId: 'CUW', awayTeamId: 'CIV' },
    { id: 'G_E_6', group: 'E', kickoffUtc: '2026-06-25T20:00:00Z', homeTeamId: 'ECU', awayTeamId: 'GER' },

    { id: 'G_F_1', group: 'F', kickoffUtc: '2026-06-14T20:00:00Z', homeTeamId: 'NED', awayTeamId: 'JPN' },
    { id: 'G_F_2', group: 'F', kickoffUtc: '2026-06-15T02:00:00Z', homeTeamId: 'SWE', awayTeamId: 'TUN' },
    { id: 'G_F_3', group: 'F', kickoffUtc: '2026-06-20T17:00:00Z', homeTeamId: 'NED', awayTeamId: 'SWE' },
    { id: 'G_F_4', group: 'F', kickoffUtc: '2026-06-21T04:00:00Z', homeTeamId: 'TUN', awayTeamId: 'JPN' },
    { id: 'G_F_5', group: 'F', kickoffUtc: '2026-06-25T23:00:00Z', homeTeamId: 'TUN', awayTeamId: 'NED' },
    { id: 'G_F_6', group: 'F', kickoffUtc: '2026-06-25T23:00:00Z', homeTeamId: 'JPN', awayTeamId: 'SWE' },

    { id: 'G_G_1', group: 'G', kickoffUtc: '2026-06-15T19:00:00Z', homeTeamId: 'BEL', awayTeamId: 'EGY' },
    { id: 'G_G_2', group: 'G', kickoffUtc: '2026-06-16T01:00:00Z', homeTeamId: 'IRN', awayTeamId: 'NZL' },
    { id: 'G_G_3', group: 'G', kickoffUtc: '2026-06-21T19:00:00Z', homeTeamId: 'BEL', awayTeamId: 'IRN' },
    { id: 'G_G_4', group: 'G', kickoffUtc: '2026-06-22T01:00:00Z', homeTeamId: 'NZL', awayTeamId: 'EGY' },
    { id: 'G_G_5', group: 'G', kickoffUtc: '2026-06-27T03:00:00Z', homeTeamId: 'NZL', awayTeamId: 'BEL' },
    { id: 'G_G_6', group: 'G', kickoffUtc: '2026-06-27T03:00:00Z', homeTeamId: 'EGY', awayTeamId: 'IRN' },

    { id: 'G_H_1', group: 'H', kickoffUtc: '2026-06-15T16:00:00Z', homeTeamId: 'ESP', awayTeamId: 'CPV' },
    { id: 'G_H_2', group: 'H', kickoffUtc: '2026-06-15T22:00:00Z', homeTeamId: 'KSA', awayTeamId: 'URU' },
    { id: 'G_H_3', group: 'H', kickoffUtc: '2026-06-21T16:00:00Z', homeTeamId: 'ESP', awayTeamId: 'KSA' },
    { id: 'G_H_4', group: 'H', kickoffUtc: '2026-06-21T22:00:00Z', homeTeamId: 'URU', awayTeamId: 'CPV' },
    { id: 'G_H_5', group: 'H', kickoffUtc: '2026-06-27T00:00:00Z', homeTeamId: 'CPV', awayTeamId: 'KSA' },
    { id: 'G_H_6', group: 'H', kickoffUtc: '2026-06-27T00:00:00Z', homeTeamId: 'URU', awayTeamId: 'ESP' },

    { id: 'G_I_1', group: 'I', kickoffUtc: '2026-06-16T19:00:00Z', homeTeamId: 'FRA', awayTeamId: 'SEN' },
    { id: 'G_I_2', group: 'I', kickoffUtc: '2026-06-16T22:00:00Z', homeTeamId: 'IRQ', awayTeamId: 'NOR' },
    { id: 'G_I_3', group: 'I', kickoffUtc: '2026-06-22T21:00:00Z', homeTeamId: 'FRA', awayTeamId: 'IRQ' },
    { id: 'G_I_4', group: 'I', kickoffUtc: '2026-06-23T00:00:00Z', homeTeamId: 'NOR', awayTeamId: 'SEN' },
    { id: 'G_I_5', group: 'I', kickoffUtc: '2026-06-26T19:00:00Z', homeTeamId: 'NOR', awayTeamId: 'FRA' },
    { id: 'G_I_6', group: 'I', kickoffUtc: '2026-06-26T19:00:00Z', homeTeamId: 'SEN', awayTeamId: 'IRQ' },

    { id: 'G_J_1', group: 'J', kickoffUtc: '2026-06-17T01:00:00Z', homeTeamId: 'ARG', awayTeamId: 'ALG' },
    { id: 'G_J_2', group: 'J', kickoffUtc: '2026-06-17T04:00:00Z', homeTeamId: 'AUT', awayTeamId: 'JOR' },
    { id: 'G_J_3', group: 'J', kickoffUtc: '2026-06-22T17:00:00Z', homeTeamId: 'ARG', awayTeamId: 'AUT' },
    { id: 'G_J_4', group: 'J', kickoffUtc: '2026-06-23T03:00:00Z', homeTeamId: 'JOR', awayTeamId: 'ALG' },
    { id: 'G_J_5', group: 'J', kickoffUtc: '2026-06-28T02:00:00Z', homeTeamId: 'ALG', awayTeamId: 'AUT' },
    { id: 'G_J_6', group: 'J', kickoffUtc: '2026-06-28T02:00:00Z', homeTeamId: 'JOR', awayTeamId: 'ARG' },

    { id: 'G_K_1', group: 'K', kickoffUtc: '2026-06-17T17:00:00Z', homeTeamId: 'POR', awayTeamId: 'COD' },
    { id: 'G_K_2', group: 'K', kickoffUtc: '2026-06-18T02:00:00Z', homeTeamId: 'UZB', awayTeamId: 'COL' },
    { id: 'G_K_3', group: 'K', kickoffUtc: '2026-06-23T17:00:00Z', homeTeamId: 'POR', awayTeamId: 'UZB' },
    { id: 'G_K_4', group: 'K', kickoffUtc: '2026-06-24T02:00:00Z', homeTeamId: 'COL', awayTeamId: 'COD' },
    { id: 'G_K_5', group: 'K', kickoffUtc: '2026-06-27T23:30:00Z', homeTeamId: 'COL', awayTeamId: 'POR' },
    { id: 'G_K_6', group: 'K', kickoffUtc: '2026-06-27T23:30:00Z', homeTeamId: 'COD', awayTeamId: 'UZB' },

    { id: 'G_L_1', group: 'L', kickoffUtc: '2026-06-17T20:00:00Z', homeTeamId: 'ENG', awayTeamId: 'CRO' },
    { id: 'G_L_2', group: 'L', kickoffUtc: '2026-06-17T23:00:00Z', homeTeamId: 'GHA', awayTeamId: 'PAN' },
    { id: 'G_L_3', group: 'L', kickoffUtc: '2026-06-23T20:00:00Z', homeTeamId: 'ENG', awayTeamId: 'GHA' },
    { id: 'G_L_4', group: 'L', kickoffUtc: '2026-06-23T23:00:00Z', homeTeamId: 'PAN', awayTeamId: 'CRO' },
    { id: 'G_L_5', group: 'L', kickoffUtc: '2026-06-27T21:00:00Z', homeTeamId: 'PAN', awayTeamId: 'ENG' },
    { id: 'G_L_6', group: 'L', kickoffUtc: '2026-06-27T21:00:00Z', homeTeamId: 'CRO', awayTeamId: 'GHA' },
] as const;

/** Group matches with their round-derived phase assigned at construction. */
const groupMatches: GroupMatch[] = rawGroupMatches.map((m) => ({ ...m, phase: groupRoundPhase(m.id) }));

const knockoutMatches: Match[] = [
    { id: 'M73', phase: 'R32', kickoffUtc: '2026-06-28T19:00:00Z',
        homeSlot: { kind: 'GROUP_RUNNER_UP', group: 'A' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'B' } },
    { id: 'M74', phase: 'R32', kickoffUtc: '2026-06-29T20:30:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'E' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['A', 'B', 'C', 'D', 'F'] } },
    { id: 'M75', phase: 'R32', kickoffUtc: '2026-06-30T01:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'F' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'C' } },
    { id: 'M76', phase: 'R32', kickoffUtc: '2026-06-29T17:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'C' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'F' } },
    { id: 'M77', phase: 'R32', kickoffUtc: '2026-06-30T21:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'I' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['C', 'D', 'F', 'G', 'H'] } },
    { id: 'M78', phase: 'R32', kickoffUtc: '2026-06-30T17:00:00Z',
        homeSlot: { kind: 'GROUP_RUNNER_UP', group: 'E' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'I' } },
    { id: 'M79', phase: 'R32', kickoffUtc: '2026-07-01T01:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'A' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['C', 'E', 'F', 'H', 'I'] } },
    { id: 'M80', phase: 'R32', kickoffUtc: '2026-07-01T16:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'L' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['E', 'H', 'I', 'J', 'K'] } },
    { id: 'M81', phase: 'R32', kickoffUtc: '2026-07-02T00:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'D' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['B', 'E', 'F', 'I', 'J'] } },
    { id: 'M82', phase: 'R32', kickoffUtc: '2026-07-01T20:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'G' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['A', 'E', 'H', 'I', 'J'] } },
    { id: 'M83', phase: 'R32', kickoffUtc: '2026-07-02T23:00:00Z',
        homeSlot: { kind: 'GROUP_RUNNER_UP', group: 'K' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'L' } },
    { id: 'M84', phase: 'R32', kickoffUtc: '2026-07-02T19:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'H' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'J' } },
    { id: 'M85', phase: 'R32', kickoffUtc: '2026-07-03T03:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'B' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['E', 'F', 'G', 'I', 'J'] } },
    { id: 'M86', phase: 'R32', kickoffUtc: '2026-07-03T22:00:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'J' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'H' } },
    { id: 'M87', phase: 'R32', kickoffUtc: '2026-07-04T01:30:00Z',
        homeSlot: { kind: 'GROUP_WINNER', group: 'K' },
        awaySlot: { kind: 'BEST_THIRD_OF', eligibleGroups: ['D', 'E', 'I', 'J', 'L'] } },
    { id: 'M88', phase: 'R32', kickoffUtc: '2026-07-03T18:00:00Z',
        homeSlot: { kind: 'GROUP_RUNNER_UP', group: 'D' },
        awaySlot: { kind: 'GROUP_RUNNER_UP', group: 'G' } },

    { id: 'M89', phase: 'R16', kickoffUtc: '2026-07-04T21:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M74' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M77' } },
    { id: 'M90', phase: 'R16', kickoffUtc: '2026-07-04T17:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M73' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M75' } },
    { id: 'M91', phase: 'R16', kickoffUtc: '2026-07-05T20:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M76' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M78' } },
    { id: 'M92', phase: 'R16', kickoffUtc: '2026-07-06T00:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M79' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M80' } },
    { id: 'M93', phase: 'R16', kickoffUtc: '2026-07-06T19:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M83' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M84' } },
    { id: 'M94', phase: 'R16', kickoffUtc: '2026-07-07T00:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M81' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M82' } },
    { id: 'M95', phase: 'R16', kickoffUtc: '2026-07-07T16:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M86' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M88' } },
    { id: 'M96', phase: 'R16', kickoffUtc: '2026-07-07T20:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M85' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M87' } },

    { id: 'M97', phase: 'QF', kickoffUtc: '2026-07-09T20:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M89' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M90' } },
    { id: 'M98', phase: 'QF', kickoffUtc: '2026-07-10T19:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M93' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M94' } },
    { id: 'M99', phase: 'QF', kickoffUtc: '2026-07-11T21:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M91' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M92' } },
    { id: 'M100', phase: 'QF', kickoffUtc: '2026-07-12T01:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M95' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M96' } },

    { id: 'M101', phase: 'SF', kickoffUtc: '2026-07-14T19:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M97' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M98' } },
    { id: 'M102', phase: 'SF', kickoffUtc: '2026-07-15T19:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M99' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M100' } },

    { id: 'M103', phase: 'THIRD', kickoffUtc: '2026-07-18T21:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_LOSER', matchId: 'M101' },
        awaySlot: { kind: 'KNOCKOUT_LOSER', matchId: 'M102' } },

    { id: 'M104', phase: 'FINAL', kickoffUtc: '2026-07-19T19:00:00Z',
        homeSlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M101' },
        awaySlot: { kind: 'KNOCKOUT_WINNER', matchId: 'M102' } },
];

/** All 104 fixtures: 72 group matches followed by 32 knockout matches in phase order. */
export const MATCHES: Match[] = [...groupMatches, ...knockoutMatches];

const sortedKickoffs = MATCHES.map((m) => m.kickoffUtc).slice().sort();

/** ISO 8601 UTC timestamp of the tournament's earliest kickoff. Champion-pick deadline. */
export const FIRST_KICKOFF_UTC: string = sortedKickoffs[0]!;
