/**
 * Shared request-handling helpers for the Worker routes — JSON body parsing and the
 * goal-count / first-scorer validators reused by the prediction and admin-result routes.
 */

import type { FirstScorer } from '@shared/types';

/** Parse a request body as JSON. Returns undefined when the body is absent or malformed. */
export async function readJson<T>(req: Request): Promise<T | undefined> {
    try {
        return (await req.json()) as T;
    } catch {
        return undefined;
    }
}

/** Maximum goals accepted for one side of a recorded score or prediction. */
export const MAX_GOALS = 99;

/** Whether a value is an integer goal count within `[0, MAX_GOALS]`. */
export function isValidGoal(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_GOALS;
}

/** Whether a value is a valid first-to-score marker (BL6). */
export function isFirstScorer(value: unknown): value is FirstScorer {
    return value === 'HOME' || value === 'AWAY' || value === 'NONE';
}

/**
 * Parse an optional first-scorer field from a request body: `undefined`/`null` → `undefined`
 * (no pick / cleared), a valid marker → itself, anything else → `'INVALID'` for the caller to
 * reject with a 400.
 */
export function parseFirstScorer(value: unknown): FirstScorer | undefined | 'INVALID' {
    if (value === undefined || value === null) return undefined;

    return isFirstScorer(value) ? value : 'INVALID';
}
