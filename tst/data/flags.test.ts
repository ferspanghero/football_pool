import { describe, test, expect } from 'vitest';
import { TEAMS } from '@data/tournament';
import { flagEmoji, toFlagEmoji } from '@data/flags';

describe('toFlagEmoji', () => {
    test('converts an ISO 3166-1 alpha-2 code into a regional-indicator flag', () => {
        expect(toFlagEmoji('ZA')).toBe('🇿🇦');
        expect(toFlagEmoji('US')).toBe('🇺🇸');
    });

    test('is case-insensitive', () => {
        expect(toFlagEmoji('br')).toBe('🇧🇷');
    });
});

describe('flagEmoji', () => {
    test('maps a FIFA team code to its country flag', () => {
        expect(flagEmoji('RSA')).toBe('🇿🇦'); // South Africa
        expect(flagEmoji('BRA')).toBe('🇧🇷');
        expect(flagEmoji('GER')).toBe('🇩🇪'); // Germany (FIFA code differs from ISO)
    });

    test('uses subdivision flags for England and Scotland (not ISO countries)', () => {
        // 🏴 + tag chars for "gbeng"/"gbsct" + cancel tag
        expect(flagEmoji('ENG')).toBe('🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}');
        expect(flagEmoji('SCO')).toBe('🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}');
    });

    test('every tournament team resolves to a non-empty flag', () => {
        for (const team of TEAMS) {
            expect(flagEmoji(team.id), `missing flag for ${team.id}`).not.toBe('');
        }
    });

    test('returns an empty string for an unknown team id', () => {
        expect(flagEmoji('ZZZ')).toBe('');
    });
});
