import { describe, test, expect } from 'vitest';
import { formatKickoff } from '@shared/time';

describe('formatKickoff', () => {
    test('renders a UTC kickoff in Pacific time with the PDT zone label in summer', () => {
        // Arrange
        const iso = '2026-06-11T19:00:00Z'; // first FIFA 2026 match kickoff

        // Act
        const result = formatKickoff(iso);

        // Assert — 19:00 UTC on Jun 11 = 12:00 PDT on Jun 11 (UTC-7 during DST)
        expect(result).toContain('Jun 11');
        expect(result).toContain('12:00');
        expect(result).toContain('PDT');
    });

    test('uses PST in winter (outside DST)', () => {
        // Arrange — January is outside DST, so the zone is PST (UTC-8)
        const iso = '2026-01-15T20:00:00Z';

        // Act
        const result = formatKickoff(iso);

        // Assert — 20:00 UTC = 12:00 PST
        expect(result).toContain('Jan 15');
        expect(result).toContain('12:00');
        expect(result).toContain('PST');
    });
});
