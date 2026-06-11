import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './testdb';
import { resultsRepo } from '@api/repos/results';
import { isWithinTournamentWindow, syncResults, type ResultsFetcher } from '@api/sync-results';
import type { EspnResult } from '@api/providers/espn';
import { FIRST_KICKOFF_UTC } from '@data/tournament';

// `now` just after the opener (G_A_1 MEX-RSA) → it is the only kicked-off candidate. Plus a moment
// before the tournament, and one after it (when every match has kicked off).
const OPENER = Date.parse(FIRST_KICKOFF_UTC) + 1;
const BEFORE = Date.parse('2025-06-01T00:00:00Z');
const AFTER = Date.parse('2026-08-01T00:00:00Z');

const resultsOf = (...records: EspnResult[]): ResultsFetcher => async () => records;

describe('isWithinTournamentWindow', () => {
    test('true during the tournament, false before and after', () => {
        expect(isWithinTournamentWindow(OPENER)).toBe(true);
        expect(isWithinTournamentWindow(BEFORE)).toBe(false);
        expect(isWithinTournamentWindow(AFTER)).toBe(false);
    });
});

describe('syncResults', () => {
    let db: D1Database;
    beforeEach(() => {
        db = createTestDb();
    });

    test('writes an AUTO result for a matched fixture, querying ESPN over the buffered date span', async () => {
        // Arrange
        const results = vi.fn<ResultsFetcher>(async () => [
            { homeTeamCode: 'MEX', awayTeamCode: 'RSA', score: { home: 2, away: 0 }, firstScorer: 'HOME' },
        ]);

        // Act
        const summary = await syncResults({ results, db, now: OPENER });

        // Assert
        expect(summary).toEqual({ processed: 1, written: 1, skipped: 0 });
        expect(results).toHaveBeenCalledWith('20260610', '20260612'); // ±1 day around the opener
        const stored = await resultsRepo.findById(db, 'G_A_1');
        expect(stored?.score).toEqual({ home: 2, away: 0 });
        expect(stored?.firstScorer).toBe('HOME');
        expect(stored?.source).toBe('AUTO');
    });

    test('aligns score and first-scorer to our orientation when ESPN lists the teams reversed', async () => {
        // Arrange — ESPN reports RSA (home) 2-0 MEX, RSA first; our fixture has MEX at home
        await syncResults({
            results: resultsOf({ homeTeamCode: 'RSA', awayTeamCode: 'MEX', score: { home: 2, away: 0 }, firstScorer: 'HOME' }),
            db,
            now: OPENER,
        });

        // Assert — stored as MEX (home) 0-2 RSA, first scorer AWAY
        const stored = await resultsRepo.findById(db, 'G_A_1');
        expect(stored?.score).toEqual({ home: 0, away: 2 });
        expect(stored?.firstScorer).toBe('AWAY');
    });

    test('reversed orientation flips an AWAY first-scorer to HOME', async () => {
        // ESPN: RSA (home) beat MEX, RSA scored first; our fixture has MEX at home → first scorer HOME
        await syncResults({
            results: resultsOf({ homeTeamCode: 'RSA', awayTeamCode: 'MEX', score: { home: 0, away: 1 }, firstScorer: 'AWAY' }),
            db,
            now: OPENER,
        });
        const stored = await resultsRepo.findById(db, 'G_A_1');
        expect(stored?.score).toEqual({ home: 1, away: 0 });
        expect(stored?.firstScorer).toBe('HOME');
    });

    test('reversed orientation leaves an undetermined first-scorer undefined', async () => {
        await syncResults({
            results: resultsOf({ homeTeamCode: 'RSA', awayTeamCode: 'MEX', score: { home: 1, away: 1 }, firstScorer: undefined }),
            db,
            now: OPENER,
        });
        expect((await resultsRepo.findById(db, 'G_A_1'))?.firstScorer).toBeUndefined();
    });

    test('skips a candidate ESPN has no finished result for', async () => {
        // Act — ESPN returns nothing for the span
        const summary = await syncResults({ results: resultsOf(), db, now: OPENER });

        // Assert
        expect(summary).toEqual({ processed: 1, written: 0, skipped: 1 });
        expect(await resultsRepo.findById(db, 'G_A_1')).toBeUndefined();
    });

    test('does not write a result whose teams match no candidate fixture', async () => {
        const summary = await syncResults({
            results: resultsOf({ homeTeamCode: 'BRA', awayTeamCode: 'GER', score: { home: 1, away: 1 }, firstScorer: undefined }),
            db,
            now: OPENER,
        });
        expect(summary).toEqual({ processed: 1, written: 0, skipped: 1 });
        expect(await resultsRepo.findAll(db)).toEqual([]);
    });

    test('skips an already-recorded match (MANUAL is protected, AUTO is not re-fetched)', async () => {
        // Arrange — admin recorded the opener by hand
        await resultsRepo.upsert(db, { matchId: 'G_A_1', score: { home: 5, away: 5 }, firstScorer: 'HOME' });
        const results = vi.fn<ResultsFetcher>(async () => [
            { homeTeamCode: 'MEX', awayTeamCode: 'RSA', score: { home: 2, away: 0 }, firstScorer: 'HOME' },
        ]);

        // Act
        const summary = await syncResults({ results, db, now: OPENER });

        // Assert — not a candidate, so ESPN is never queried and the manual row is untouched
        expect(results).not.toHaveBeenCalled();
        expect(summary).toEqual({ processed: 0, written: 0, skipped: 0 });
        const stored = await resultsRepo.findById(db, 'G_A_1');
        expect(stored?.score).toEqual({ home: 5, away: 5 });
        expect(stored?.source).toBe('MANUAL');
    });

    test('no-ops (no fetch) outside the tournament window', async () => {
        const results = vi.fn<ResultsFetcher>(async () => []);
        const summary = await syncResults({ results, db, now: BEFORE });
        expect(results).not.toHaveBeenCalled();
        expect(summary).toEqual({ processed: 0, written: 0, skipped: 0 });
    });

    test('ignoreWindow runs the sync even outside the window (manual trigger)', async () => {
        // Arrange — after the tournament; without the flag it would no-op
        const without = vi.fn<ResultsFetcher>(async () => []);
        expect((await syncResults({ results: without, db, now: AFTER })).written).toBe(0);
        expect(without).not.toHaveBeenCalled();

        // Act — with ignoreWindow, the opener (long since kicked off) is processed
        await syncResults({
            results: resultsOf({ homeTeamCode: 'MEX', awayTeamCode: 'RSA', score: { home: 2, away: 0 }, firstScorer: 'HOME' }),
            db,
            now: AFTER,
            ignoreWindow: true,
        });

        // Assert
        expect((await resultsRepo.findById(db, 'G_A_1'))?.source).toBe('AUTO');
    });
});
