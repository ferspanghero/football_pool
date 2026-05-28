import { describe, test, expect } from 'vitest';
import { formatKickoff, formatKickoffDate, formatKickoffTime } from '@shared/time';

const LA = { timeZone: 'America/Los_Angeles', locale: 'en-US' };

describe('formatKickoff', () => {
    test('renders a UTC kickoff in the supplied zone with the PDT label in summer', () => {
        // Arrange
        const iso = '2026-06-11T19:00:00Z'; // first FIFA 2026 match kickoff

        // Act
        const result = formatKickoff(iso, LA);

        // Assert — 19:00 UTC on Jun 11 = 12:00 PDT on Jun 11 (UTC-7 during DST)
        expect(result).toContain('Jun 11');
        expect(result).toContain('12:00');
        expect(result).toContain('PDT');
    });

    test('uses PST in winter (outside DST)', () => {
        // Arrange — January is outside DST, so the zone is PST (UTC-8)
        const iso = '2026-01-15T20:00:00Z';

        // Act
        const result = formatKickoff(iso, LA);

        // Assert — 20:00 UTC = 12:00 PST
        expect(result).toContain('Jan 15');
        expect(result).toContain('12:00');
        expect(result).toContain('PST');
    });

    test('renders the same instant in a different viewer time zone', () => {
        // Arrange — 19:00 UTC is 12:00 in Los Angeles (UTC-7) but 16:00 in São Paulo (UTC-3)
        const iso = '2026-06-11T19:00:00Z';

        // Act
        const saoPaulo = formatKickoff(iso, { timeZone: 'America/Sao_Paulo', locale: 'en-US' });

        // Assert
        expect(saoPaulo).toContain('4:00');
        expect(saoPaulo).not.toContain('12:00');
    });

    test('defaults to the runtime-resolved zone and locale when no options are given', () => {
        // Arrange — the no-options path must mirror an explicit pin to the environment defaults
        const iso = '2026-06-11T19:00:00Z';
        const env = new Intl.DateTimeFormat().resolvedOptions();

        // Act, Assert
        expect(formatKickoff(iso)).toBe(formatKickoff(iso, { timeZone: env.timeZone, locale: env.locale }));
    });
});

describe('formatKickoffDate', () => {
    test('renders the date only, in the supplied zone', () => {
        // Arrange, Act — 02:00 UTC Jun 12 = 19:00 PDT Jun 11
        const result = formatKickoffDate('2026-06-12T02:00:00Z', LA);

        // Assert
        expect(result).toContain('Jun 11');
        expect(result).not.toMatch(/\d:\d\d/);
    });

    test('day boundary shifts with the viewer zone', () => {
        // Arrange — the same instant falls on different calendar days in LA vs UTC
        const iso = '2026-06-12T02:00:00Z';

        // Act, Assert
        expect(formatKickoffDate(iso, LA)).toContain('Jun 11');
        expect(formatKickoffDate(iso, { timeZone: 'UTC', locale: 'en-US' })).toContain('Jun 12');
    });
});

describe('formatKickoffTime', () => {
    test('renders the clock with the zone label, in the supplied zone', () => {
        // Arrange, Act
        const result = formatKickoffTime('2026-06-11T19:00:00Z', LA);

        // Assert
        expect(result).toContain('12:00');
        expect(result).toContain('PDT');
    });
});
