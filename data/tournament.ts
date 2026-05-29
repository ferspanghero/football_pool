/**
 * Static FIFA 2026 tournament data: 48 teams in 12 groups and all 104 fixtures (72 group +
 * 32 knockout).
 *
 * Kickoff times converted from Sky Sports' UK BST listing to UTC by subtracting one hour.
 *
 * Knockout fixtures start with placeholder team labels (e.g. `"Winner of Group A"`) that
 * describe the bracket structure. There is no automatic standings/tiebreaker resolution:
 * once a round's pairings are known, replace the placeholders with the actual team ids here
 * and redeploy. A knockout match only becomes predictable once both ids are real teams.
 */

import type { Match, PhaseId, Team } from '@shared/types';

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
const groupMatches: Match[] = rawGroupMatches.map((m) => ({ ...m, phase: groupRoundPhase(m.id) }));

// Knockout fixtures. `homeTeamId`/`awayTeamId` are placeholder labels describing the bracket
// (Winner/Runner-up of a group, a best-3rd pool, or the Winner/Loser of an earlier match).
// Replace each with the actual team id once that round's pairing is known, then redeploy.
const knockoutMatches: Match[] = [
    { id: 'M73', phase: 'R32', kickoffUtc: '2026-06-28T19:00:00Z',
        homeTeamId: 'Runner-up of Group A', awayTeamId: 'Runner-up of Group B' },
    { id: 'M74', phase: 'R32', kickoffUtc: '2026-06-29T20:30:00Z',
        homeTeamId: 'Winner of Group E', awayTeamId: 'Best 3rd from A/B/C/D/F' },
    { id: 'M75', phase: 'R32', kickoffUtc: '2026-06-30T01:00:00Z',
        homeTeamId: 'Winner of Group F', awayTeamId: 'Runner-up of Group C' },
    { id: 'M76', phase: 'R32', kickoffUtc: '2026-06-29T17:00:00Z',
        homeTeamId: 'Winner of Group C', awayTeamId: 'Runner-up of Group F' },
    { id: 'M77', phase: 'R32', kickoffUtc: '2026-06-30T21:00:00Z',
        homeTeamId: 'Winner of Group I', awayTeamId: 'Best 3rd from C/D/F/G/H' },
    { id: 'M78', phase: 'R32', kickoffUtc: '2026-06-30T17:00:00Z',
        homeTeamId: 'Runner-up of Group E', awayTeamId: 'Runner-up of Group I' },
    { id: 'M79', phase: 'R32', kickoffUtc: '2026-07-01T01:00:00Z',
        homeTeamId: 'Winner of Group A', awayTeamId: 'Best 3rd from C/E/F/H/I' },
    { id: 'M80', phase: 'R32', kickoffUtc: '2026-07-01T16:00:00Z',
        homeTeamId: 'Winner of Group L', awayTeamId: 'Best 3rd from E/H/I/J/K' },
    { id: 'M81', phase: 'R32', kickoffUtc: '2026-07-02T00:00:00Z',
        homeTeamId: 'Winner of Group D', awayTeamId: 'Best 3rd from B/E/F/I/J' },
    { id: 'M82', phase: 'R32', kickoffUtc: '2026-07-01T20:00:00Z',
        homeTeamId: 'Winner of Group G', awayTeamId: 'Best 3rd from A/E/H/I/J' },
    { id: 'M83', phase: 'R32', kickoffUtc: '2026-07-02T23:00:00Z',
        homeTeamId: 'Runner-up of Group K', awayTeamId: 'Runner-up of Group L' },
    { id: 'M84', phase: 'R32', kickoffUtc: '2026-07-02T19:00:00Z',
        homeTeamId: 'Winner of Group H', awayTeamId: 'Runner-up of Group J' },
    { id: 'M85', phase: 'R32', kickoffUtc: '2026-07-03T03:00:00Z',
        homeTeamId: 'Winner of Group B', awayTeamId: 'Best 3rd from E/F/G/I/J' },
    { id: 'M86', phase: 'R32', kickoffUtc: '2026-07-03T22:00:00Z',
        homeTeamId: 'Winner of Group J', awayTeamId: 'Runner-up of Group H' },
    { id: 'M87', phase: 'R32', kickoffUtc: '2026-07-04T01:30:00Z',
        homeTeamId: 'Winner of Group K', awayTeamId: 'Best 3rd from D/E/I/J/L' },
    { id: 'M88', phase: 'R32', kickoffUtc: '2026-07-03T18:00:00Z',
        homeTeamId: 'Runner-up of Group D', awayTeamId: 'Runner-up of Group G' },

    { id: 'M89', phase: 'R16', kickoffUtc: '2026-07-04T21:00:00Z',
        homeTeamId: 'Winner of M74', awayTeamId: 'Winner of M77' },
    { id: 'M90', phase: 'R16', kickoffUtc: '2026-07-04T17:00:00Z',
        homeTeamId: 'Winner of M73', awayTeamId: 'Winner of M75' },
    { id: 'M91', phase: 'R16', kickoffUtc: '2026-07-05T20:00:00Z',
        homeTeamId: 'Winner of M76', awayTeamId: 'Winner of M78' },
    { id: 'M92', phase: 'R16', kickoffUtc: '2026-07-06T00:00:00Z',
        homeTeamId: 'Winner of M79', awayTeamId: 'Winner of M80' },
    { id: 'M93', phase: 'R16', kickoffUtc: '2026-07-06T19:00:00Z',
        homeTeamId: 'Winner of M83', awayTeamId: 'Winner of M84' },
    { id: 'M94', phase: 'R16', kickoffUtc: '2026-07-07T00:00:00Z',
        homeTeamId: 'Winner of M81', awayTeamId: 'Winner of M82' },
    { id: 'M95', phase: 'R16', kickoffUtc: '2026-07-07T16:00:00Z',
        homeTeamId: 'Winner of M86', awayTeamId: 'Winner of M88' },
    { id: 'M96', phase: 'R16', kickoffUtc: '2026-07-07T20:00:00Z',
        homeTeamId: 'Winner of M85', awayTeamId: 'Winner of M87' },

    { id: 'M97', phase: 'QF', kickoffUtc: '2026-07-09T20:00:00Z',
        homeTeamId: 'Winner of M89', awayTeamId: 'Winner of M90' },
    { id: 'M98', phase: 'QF', kickoffUtc: '2026-07-10T19:00:00Z',
        homeTeamId: 'Winner of M93', awayTeamId: 'Winner of M94' },
    { id: 'M99', phase: 'QF', kickoffUtc: '2026-07-11T21:00:00Z',
        homeTeamId: 'Winner of M91', awayTeamId: 'Winner of M92' },
    { id: 'M100', phase: 'QF', kickoffUtc: '2026-07-12T01:00:00Z',
        homeTeamId: 'Winner of M95', awayTeamId: 'Winner of M96' },

    { id: 'M101', phase: 'SF', kickoffUtc: '2026-07-14T19:00:00Z',
        homeTeamId: 'Winner of M97', awayTeamId: 'Winner of M98' },
    { id: 'M102', phase: 'SF', kickoffUtc: '2026-07-15T19:00:00Z',
        homeTeamId: 'Winner of M99', awayTeamId: 'Winner of M100' },

    { id: 'M103', phase: 'THIRD', kickoffUtc: '2026-07-18T21:00:00Z',
        homeTeamId: 'Loser of M101', awayTeamId: 'Loser of M102' },

    { id: 'M104', phase: 'FINAL', kickoffUtc: '2026-07-19T19:00:00Z',
        homeTeamId: 'Winner of M101', awayTeamId: 'Winner of M102' },
];

/** All 104 fixtures: 72 group matches followed by 32 knockout matches in phase order. */
export const MATCHES: Match[] = [...groupMatches, ...knockoutMatches];

const sortedKickoffs = MATCHES.map((m) => m.kickoffUtc).slice().sort();

/** ISO 8601 UTC timestamp of the tournament's earliest kickoff. Champion-pick deadline. */
export const FIRST_KICKOFF_UTC: string = sortedKickoffs[0]!;
