/**
 * Formatting helpers for points contributions shown on the leaderboard.
 */

/** Sign/colour tone for a points value: positive (green), negative (red), or neutral zero. */
export type PointsTone = 'pos' | 'neg' | 'zero';

/**
 * Format a points contribution with an explicit sign and a tone for colouring: a positive value
 * becomes `+N` (`pos`), a negative value `−N` (`neg`, with a real minus sign), and zero a plain
 * `0` (`zero`). The caller maps the tone to a CSS class.
 */
export function signedPoints(value: number): { text: string; tone: PointsTone } {
    if (value > 0) return { text: `+${value}`, tone: 'pos' };
    if (value < 0) return { text: `−${Math.abs(value)}`, tone: 'neg' };

    return { text: '0', tone: 'zero' };
}
