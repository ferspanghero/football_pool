import { describe, test, expect } from 'vitest';
import { signedPoints } from '@/lib/points';

describe('signedPoints', () => {
    test('prefixes a positive value with + and marks it positive', () => {
        // Arrange, Act
        const result = signedPoints(3);

        // Assert
        expect(result).toEqual({ text: '+3', tone: 'pos' });
    });

    test('prefixes a negative value with a minus sign and marks it negative', () => {
        // Arrange, Act
        const result = signedPoints(-2);

        // Assert
        expect(result).toEqual({ text: '−2', tone: 'neg' });
    });

    test('renders zero without a sign and marks it neutral', () => {
        // Arrange, Act
        const result = signedPoints(0);

        // Assert
        expect(result).toEqual({ text: '0', tone: 'zero' });
    });
});
