/**
 * Shared request-handling helpers for the Worker routes — JSON body parsing and the
 * goal-count validator reused by the prediction and admin-result routes.
 */

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
