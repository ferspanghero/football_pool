import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    dateRangeWindows,
    espnDateFromKickoff,
    extractFromSummary,
    fetchFinishedResults,
    fetchScheduledFixtures,
    type FetchLike,
} from '@api/providers/espn';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');
const loadFixture = (name: string): unknown => JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8'));

const completedEvent = (id: string, home: [string, number], away: [string, number], statusName = 'STATUS_FULL_TIME') => ({
    id,
    status: { type: { name: statusName, completed: true } },
    competitions: [
        {
            competitors: [
                { homeAway: 'home', score: String(home[1]), team: { abbreviation: home[0] } },
                { homeAway: 'away', score: String(away[1]), team: { abbreviation: away[0] } },
            ],
        },
    ],
});

/** Route scoreboard requests to `board` and summary requests to `summaries[eventId]`. */
const routingFetch =
    (board: unknown, summaries: Record<string, unknown> = {}): FetchLike =>
    async (url) => ({
        json: async () => {
            if (url.includes('/scoreboard')) return board;
            const id = url.match(/event=(\w+)/)?.[1] ?? '';
            return summaries[id] ?? {};
        },
    });

describe('espnDateFromKickoff', () => {
    test('formats the UTC date as YYYYMMDD', () => {
        expect(espnDateFromKickoff('2026-06-11T19:00Z')).toBe('20260611');
    });
});

describe('dateRangeWindows', () => {
    test('a single day is one window', () => {
        expect(dateRangeWindows('20260611', '20260611')).toEqual([['20260611', '20260611']]);
    });

    test('splits a long span into capped windows', () => {
        expect(dateRangeWindows('20260611', '20260620')).toEqual([
            ['20260611', '20260615'],
            ['20260616', '20260620'],
        ]);
    });

    test('handles a month boundary', () => {
        expect(dateRangeWindows('20260630', '20260702')).toEqual([['20260630', '20260702']]);
    });
});

describe('extractFromSummary (real ESPN summaries)', () => {
    test('regular match: headline score, first scorer forced by the score', () => {
        // MEX 2 - 0 RSA: one-sided, so HOME without needing keyEvents
        expect(extractFromSummary(loadFixture('espn-summary-mexrsa.json'))).toEqual({
            homeTeamCode: 'MEX',
            awayTeamCode: 'RSA',
            score: { home: 2, away: 0 },
            firstScorer: 'HOME',
        });
    });

    test('both-scored regular match: first regulation goal, own goal credited to the benefiting side', () => {
        // CAN 1 - 2 MAR; Morocco scored first; Canada's goal is an own goal
        expect(extractFromSummary(loadFixture('espn-summary-owngoal.json'))).toEqual({
            homeTeamCode: 'CAN',
            awayTeamCode: 'MAR',
            score: { home: 1, away: 2 },
            firstScorer: 'AWAY',
        });
    });

    test('penalty match: reconstructs the 90-minute score (not the headline)', () => {
        // ARG 3 - 3 FRA headline incl. ET; 90-minute is 2-2, ARG scored first
        expect(extractFromSummary(loadFixture('espn-summary-2022final.json'))).toEqual({
            homeTeamCode: 'ARG',
            awayTeamCode: 'FRA',
            score: { home: 2, away: 2 },
            firstScorer: 'HOME',
        });
    });

    test('returns null when competitors are missing', () => {
        expect(extractFromSummary({ keyEvents: [] })).toBeNull();
    });

    test('both-scored but keyEvents disagree with the score → first scorer undetermined', () => {
        // Headline 2-1, but only one regulation goal is in keyEvents → guard fails
        const summary = {
            header: {
                competitions: [
                    {
                        status: { type: { name: 'STATUS_FULL_TIME', completed: true } },
                        competitors: [
                            { homeAway: 'home', score: '2', team: { id: '1', abbreviation: 'GER' } },
                            { homeAway: 'away', score: '1', team: { id: '2', abbreviation: 'BRA' } },
                        ],
                    },
                ],
            },
            keyEvents: [{ scoringPlay: true, period: { number: 1 }, team: { id: '1' }, type: { text: 'Goal' } }],
        };
        const result = extractFromSummary(summary);
        expect(result?.score).toEqual({ home: 2, away: 1 });
        expect(result?.firstScorer).toBeUndefined();
    });
});

describe('fetchFinishedResults', () => {
    test('returns a finished regular match from the scoreboard without fetching a summary', async () => {
        // Arrange — today's board: MEX-RSA FULL_TIME 2-0 (one-sided) + KOR-CZE scheduled
        const fetchFn = vi.fn<FetchLike>(routingFetch(loadFixture('espn-scoreboard-today.json')));

        // Act
        const results = await fetchFinishedResults(fetchFn, '20260611', '20260611');

        // Assert — one result; no /summary call was needed
        expect(results).toEqual([{ homeTeamCode: 'MEX', awayTeamCode: 'RSA', score: { home: 2, away: 0 }, firstScorer: 'HOME' }]);
        expect(fetchFn.mock.calls.every(([url]) => !url.includes('/summary'))).toBe(true);
    });

    test('fetches a summary for a both-scored match and resolves the first scorer', async () => {
        // Arrange — a both-scored finished event whose summary is the own-goal match
        const board = { events: [completedEvent('og', ['CAN', 1], ['MAR', 2])] };
        const fetchFn = routingFetch(board, { og: loadFixture('espn-summary-owngoal.json') });

        // Act
        const results = await fetchFinishedResults(fetchFn, '20260611', '20260611');

        // Assert
        expect(results).toEqual([{ homeTeamCode: 'CAN', awayTeamCode: 'MAR', score: { home: 1, away: 2 }, firstScorer: 'AWAY' }]);
    });

    test('reconstructs the 90-minute score for an extra-time match', async () => {
        // Arrange — headline 3-3, PEN status → summary reconstructs 2-2
        const board = { events: [completedEvent('f', ['ARG', 3], ['FRA', 3], 'STATUS_FINAL_PEN')] };
        const fetchFn = routingFetch(board, { f: loadFixture('espn-summary-2022final.json') });

        // Act
        const results = await fetchFinishedResults(fetchFn, '20221218', '20221218');

        // Assert
        expect(results).toEqual([{ homeTeamCode: 'ARG', awayTeamCode: 'FRA', score: { home: 2, away: 2 }, firstScorer: 'HOME' }]);
    });

    test('skips events that are not completed', async () => {
        const board = { events: [completedEvent('a', ['MEX', 2], ['RSA', 0]), { id: 'b', status: { type: { name: 'STATUS_SCHEDULED', completed: false } } }] };
        const results = await fetchFinishedResults(routingFetch(board), '20260611', '20260611');
        expect(results).toHaveLength(1);
    });

    test('skips an extra-time match whose summary cannot be fetched (no wrong score)', async () => {
        const board = { events: [completedEvent('f', ['ARG', 3], ['FRA', 3], 'STATUS_FINAL_AET')] };
        const fetchFn: FetchLike = async (url) => {
            if (url.includes('/summary')) throw new Error('down');
            return { json: async () => board };
        };
        expect(await fetchFinishedResults(fetchFn, '20260611', '20260611')).toEqual([]);
    });

    test('returns nothing when the scoreboard fetch fails', async () => {
        const fetchFn: FetchLike = async () => {
            throw new Error('scoreboard down');
        };
        expect(await fetchFinishedResults(fetchFn, '20260611', '20260611')).toEqual([]);
    });

    test('a regular both-scored match with no summary falls back to the headline score', async () => {
        const board = { events: [completedEvent('m', ['MEX', 2], ['RSA', 1])] };
        const fetchFn: FetchLike = async (url) => {
            if (url.includes('/summary')) throw new Error('down');
            return { json: async () => board };
        };
        const results = await fetchFinishedResults(fetchFn, '20260611', '20260611');
        expect(results).toEqual([{ homeTeamCode: 'MEX', awayTeamCode: 'RSA', score: { home: 2, away: 1 }, firstScorer: undefined }]);
    });
});

describe('fetchScheduledFixtures (real captured knockout scoreboard)', () => {
    test('extracts each fixture’s kickoff + team codes, passing placeholder pseudo-codes through', async () => {
        // Arrange — a real R32 scoreboard window: some sides resolved (CAN, BRA, GER, MAR), others
        // still placeholders (2A, 2F, 3RD, 1F, 2E, 2I)
        const fetchFn = routingFetch(loadFixture('espn-scoreboard-knockout.json'));

        // Act
        const fixtures = await fetchScheduledFixtures(fetchFn, '20260628', '20260702');

        // Assert — the codes come through as-is in ESPN's home/away order; placeholders included
        expect(fixtures).toHaveLength(5);
        expect(fixtures).toContainEqual({ kickoffUtc: '2026-06-28T19:00Z', homeTeamCode: '2A', awayTeamCode: 'CAN' });
        expect(fixtures).toContainEqual({ kickoffUtc: '2026-06-29T17:00Z', homeTeamCode: 'BRA', awayTeamCode: '2F' });
        expect(fixtures).toContainEqual({ kickoffUtc: '2026-06-29T20:30Z', homeTeamCode: 'GER', awayTeamCode: '3RD' });
    });

    test('skips events missing a date or a readable team pair, and dedupes by event id', async () => {
        // Arrange
        const board = {
            events: [
                { id: 'ok', date: '2026-06-28T19:00Z', competitions: [{ competitors: [
                    { homeAway: 'home', team: { abbreviation: 'GER' } },
                    { homeAway: 'away', team: { abbreviation: 'BRA' } }] }] },
                { id: 'ok', date: '2026-06-28T19:00Z', competitions: [{ competitors: [
                    { homeAway: 'home', team: { abbreviation: 'GER' } },
                    { homeAway: 'away', team: { abbreviation: 'BRA' } }] }] }, // duplicate id
                { id: 'no-date', competitions: [{ competitors: [
                    { homeAway: 'home', team: { abbreviation: 'X' } },
                    { homeAway: 'away', team: { abbreviation: 'Y' } }] }] },
                { id: 'no-pair', date: '2026-06-29T17:00Z', competitions: [{ competitors: [] }] },
                { id: 'no-comp', date: '2026-06-30T01:00Z' }, // event with no competitions at all
            ],
        };

        // Act
        const fixtures = await fetchScheduledFixtures(routingFetch(board), '20260628', '20260628');

        // Assert — only the one well-formed, de-duplicated event survives
        expect(fixtures).toEqual([{ kickoffUtc: '2026-06-28T19:00Z', homeTeamCode: 'GER', awayTeamCode: 'BRA' }]);
    });

    test('returns nothing for an empty board, or when the scoreboard fetch fails', async () => {
        // Arrange — a board with no events key, and a fetch that throws
        const empty: FetchLike = async () => ({ json: async () => ({}) });
        const broken: FetchLike = async () => {
            throw new Error('scoreboard down');
        };

        // Act, Assert
        expect(await fetchScheduledFixtures(empty, '20260628', '20260628')).toEqual([]);
        expect(await fetchScheduledFixtures(broken, '20260628', '20260628')).toEqual([]);
    });
});
