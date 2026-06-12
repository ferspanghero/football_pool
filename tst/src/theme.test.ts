/**
 * Unit tests for the theme persistence/apply helper (src/lib/theme.ts).
 * Runs in the jsdom project, so `localStorage` and `document` are available.
 */

import { afterEach, describe, test, expect } from 'vitest';
import { applyTheme, getStoredTheme, setTheme, THEMES } from '@/lib/theme';

const KEY = 'fp-theme';

afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
});

describe('getStoredTheme', () => {
    test('returns classic when nothing is stored', () => {
        // Arrange, Act
        const theme = getStoredTheme();

        // Assert
        expect(theme).toBe('classic');
    });

    test('returns elifoot when elifoot is stored', () => {
        // Arrange
        localStorage.setItem(KEY, 'elifoot');

        // Act
        const theme = getStoredTheme();

        // Assert
        expect(theme).toBe('elifoot');
    });

    test('returns snes when snes is stored', () => {
        // Arrange
        localStorage.setItem(KEY, 'snes');

        // Act
        const theme = getStoredTheme();

        // Assert
        expect(theme).toBe('snes');
    });

    test('falls back to classic for an unknown stored value', () => {
        // Arrange
        localStorage.setItem(KEY, 'bogus');

        // Act
        const theme = getStoredTheme();

        // Assert
        expect(theme).toBe('classic');
    });

    test('falls back to classic when storage access throws', () => {
        // Arrange
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = () => {
            throw new Error('storage blocked');
        };

        try {
            // Act
            const theme = getStoredTheme();

            // Assert
            expect(theme).toBe('classic');
        } finally {
            Storage.prototype.getItem = original;
        }
    });
});

describe('applyTheme', () => {
    test('sets the data-theme attribute for a non-default theme', () => {
        // Act
        applyTheme('elifoot');

        // Assert
        expect(document.documentElement.dataset.theme).toBe('elifoot');
    });

    test('sets the data-theme attribute for the snes theme', () => {
        // Act
        applyTheme('snes');

        // Assert
        expect(document.documentElement.dataset.theme).toBe('snes');
    });

    test('removes the data-theme attribute for the classic default', () => {
        // Arrange
        document.documentElement.dataset.theme = 'elifoot';

        // Act
        applyTheme('classic');

        // Assert
        expect(document.documentElement.dataset.theme).toBeUndefined();
    });
});

describe('setTheme', () => {
    test('persists and applies the theme', () => {
        // Act
        setTheme('elifoot');

        // Assert
        expect(localStorage.getItem(KEY)).toBe('elifoot');
        expect(document.documentElement.dataset.theme).toBe('elifoot');
    });

    test('round-trips through getStoredTheme', () => {
        // Arrange, Act
        setTheme('elifoot');

        // Assert
        expect(getStoredTheme()).toBe('elifoot');
    });

    test('round-trips the snes theme through getStoredTheme', () => {
        // Arrange, Act
        setTheme('snes');

        // Assert
        expect(localStorage.getItem(KEY)).toBe('snes');
        expect(document.documentElement.dataset.theme).toBe('snes');
        expect(getStoredTheme()).toBe('snes');
    });

    test('still applies the theme when persistence fails', () => {
        // Arrange
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
            throw new Error('storage blocked');
        };

        try {
            // Act
            setTheme('elifoot');

            // Assert
            expect(document.documentElement.dataset.theme).toBe('elifoot');
        } finally {
            Storage.prototype.setItem = original;
        }
    });
});

describe('THEMES', () => {
    test('lists classic, elifoot, then snes', () => {
        // Arrange, Act, Assert
        expect(THEMES.map((t) => t.value)).toEqual(['classic', 'elifoot', 'snes']);
    });
});
