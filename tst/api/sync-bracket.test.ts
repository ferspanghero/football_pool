import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from './testdb';
import { syncBracket } from '@api/sync-bracket';
import { knockoutTeamsRepo } from '@api/repos/knockoutTeams';
import { log } from '@api/log';
import { MATCHES } from '@data/tournament';
import { isKnockoutMatch } from '@shared/phases';
import type { EspnFixture } from '@api/providers/espn';

// A clock inside the tournament window (R32 days). M73 kicks off 2026-06-28T19:00Z (our schedule);
// ESPN lists it the same instant in its short form '…T19:00Z'.
const WITHIN = Date.parse('2026-06-28T00:00:00Z');
const M73_KICKOFF = '2026-06-28T19:00Z';

const fetcher = (fixtures: EspnFixture[]) => vi.fn(async () => fixtures);

describe('syncBracket', () => {
    let db: D1Database;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        db = createTestDb();
        // Several pending knockout fixtures get no matching ESPN event in these small fixture sets,
        // which the sync surfaces as a drift warning — silence it here and assert it where it matters.
        warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    test('K1: resolves a fixture whose two ESPN codes are both real teams (maps by kickoff)', async () => {
        // Arrange — both sides decided
        const fixtures = [{ kickoffUtc: M73_KICKOFF, homeTeamCode: 'MEX', awayTeamCode: 'CAN' }];

        // Act
        const summary = await syncBracket({ fixtures: fetcher(fixtures), db, now: WITHIN });

        // Assert — M73 resolved in ESPN's orientation, AUTO source
        expect(summary.written).toBe(1);
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toMatchObject({ homeTeamId: 'MEX', awayTeamId: 'CAN', source: 'AUTO' });
    });

    test('K2: leaves a fixture with a placeholder side unresolved', async () => {
        // Arrange — away side still a real code but home is a placeholder pseudo-code
        const fixtures = [{ kickoffUtc: M73_KICKOFF, homeTeamCode: '2A', awayTeamCode: 'CAN' }];

        // Act
        const summary = await syncBracket({ fixtures: fetcher(fixtures), db, now: WITHIN });

        // Assert
        expect(summary.written).toBe(0);
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toBeUndefined();
    });

    test('K4: skips an ESPN event whose kickoff maps to no fixture', async () => {
        // Arrange — a real pair, but at an instant no fixture occupies
        const fixtures = [{ kickoffUtc: '2026-06-28T18:37Z', homeTeamCode: 'MEX', awayTeamCode: 'CAN' }];

        // Act
        const summary = await syncBracket({ fixtures: fetcher(fixtures), db, now: WITHIN });

        // Assert
        expect(summary.written).toBe(0);
        expect(await knockoutTeamsRepo.findAll(db)).toEqual([]);
    });

    test('warns on a pending fixture with no mapped ESPN event (possible schedule drift)', async () => {
        // Arrange — ESPN returned data, but nothing at any pending knockout fixture's instant
        const fixtures = [{ kickoffUtc: '2026-06-28T18:37Z', homeTeamCode: 'MEX', awayTeamCode: 'CAN' }];

        // Act
        await syncBracket({ fixtures: fetcher(fixtures), db, now: WITHIN });

        // Assert — the drift is surfaced rather than an invisible permanent skip
        expect(warnSpy).toHaveBeenCalledWith(
            'bracket sync: no ESPN event maps to fixture kickoff',
            expect.objectContaining({ matchId: 'M73', kickoffUtc: expect.any(String) }),
        );
    });

    test('skips and warns when two ESPN events share a fixture’s kickoff instant (ambiguous)', async () => {
        // Arrange — two events at M73's exact instant: we can't tell which is ours
        const fixtures = [
            { kickoffUtc: M73_KICKOFF, homeTeamCode: 'MEX', awayTeamCode: 'CAN' },
            { kickoffUtc: M73_KICKOFF, homeTeamCode: 'BRA', awayTeamCode: 'GER' },
        ];

        // Act
        const summary = await syncBracket({ fixtures: fetcher(fixtures), db, now: WITHIN });

        // Assert — M73 is left unresolved (no last-write-wins guess), and the collision is surfaced
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toBeUndefined();
        expect(summary.written).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(
            'bracket sync: ambiguous ESPN events at fixture kickoff',
            expect.objectContaining({ matchId: 'M73' }),
        );
    });

    test('K6: no-ops (and skips fetching) outside the tournament window unless ignoreWindow', async () => {
        // Arrange — a clock before the tournament
        const before = Date.parse('2026-05-01T00:00:00Z');
        const fixtures = [{ kickoffUtc: M73_KICKOFF, homeTeamCode: 'MEX', awayTeamCode: 'CAN' }];
        const guarded = fetcher(fixtures);

        // Act, Assert — window guard returns before any fetch
        expect(await syncBracket({ fixtures: guarded, db, now: before })).toEqual({ processed: 0, written: 0, skipped: 0 });
        expect(guarded).not.toHaveBeenCalled();

        // …but the manual trigger (ignoreWindow) runs regardless of the clock
        const summary = await syncBracket({ fixtures: fetcher(fixtures), db, now: before, ignoreWindow: true });
        expect(summary.written).toBe(1);
    });

    test('K5: idempotent — a second run does not re-touch an already-resolved fixture', async () => {
        // Arrange — first run resolves M73
        await syncBracket({ fixtures: fetcher([{ kickoffUtc: M73_KICKOFF, homeTeamCode: 'MEX', awayTeamCode: 'CAN' }]), db, now: WITHIN });

        // Act — a later run reports different teams at M73's slot; M73 is already resolved
        const summary = await syncBracket({ fixtures: fetcher([{ kickoffUtc: M73_KICKOFF, homeTeamCode: 'BRA', awayTeamCode: 'GER' }]), db, now: WITHIN });

        // Assert — M73 untouched; nothing re-written
        expect(summary.written).toBe(0);
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toMatchObject({ homeTeamId: 'MEX', awayTeamId: 'CAN' });
    });

    test('does not clobber an admin MANUAL override', async () => {
        // Arrange — admin set M73 by hand
        await knockoutTeamsRepo.upsert(db, { matchId: 'M73', homeTeamId: 'BRA', awayTeamId: 'GER', source: 'MANUAL' });

        // Act — the sync reports different teams
        await syncBracket({ fixtures: fetcher([{ kickoffUtc: M73_KICKOFF, homeTeamCode: 'MEX', awayTeamCode: 'CAN' }]), db, now: WITHIN });

        // Assert — the MANUAL row stands
        expect(await knockoutTeamsRepo.findById(db, 'M73')).toMatchObject({ homeTeamId: 'BRA', awayTeamId: 'GER', source: 'MANUAL' });
    });

    test('skips the ESPN fetch entirely once every knockout fixture is resolved', async () => {
        // Arrange — resolve every knockout fixture
        for (const m of MATCHES.filter(isKnockoutMatch)) {
            await knockoutTeamsRepo.upsert(db, { matchId: m.id, homeTeamId: 'BRA', awayTeamId: 'GER', source: 'MANUAL' });
        }
        const guarded = fetcher([]);

        // Act
        const summary = await syncBracket({ fixtures: guarded, db, now: WITHIN });

        // Assert — nothing pending, so no ESPN call is made
        expect(summary).toEqual({ processed: 0, written: 0, skipped: 0 });
        expect(guarded).not.toHaveBeenCalled();
    });
});
