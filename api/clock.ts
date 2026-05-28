/**
 * Clock abstraction. Production uses `WallClockProvider` (returns `Date.now()`).
 * Tests inject a `FixedClockProvider` to control time deterministically.
 *
 * E2E tests drive an out-of-process `wrangler dev` and switch its clock at runtime via the
 * `POST /api/admin/test/clock` endpoint (see `api/app.ts`), which is gated behind
 * `DEPLOYMENT_STAGE === 'TEST'` and therefore inert in production.
 */

export type ClockProvider = () => number;

/** How the active server clock behaves: real wall-clock time, or pinned to a fixed instant. */
export type ClockMode = 'REALTIME' | 'FIXED';

/** Default production clock — returns `Date.now()` on every call. */
export const WallClockProvider: ClockProvider = () => Date.now();

/** Returns a clock pinned to the given ISO 8601 UTC timestamp. Every call returns the same value. */
export function FixedClockProvider(isoUtc: string): ClockProvider {
    const ms = Date.parse(isoUtc);
    if (Number.isNaN(ms)) {
        throw new Error(`FixedClockProvider: invalid ISO 8601 timestamp "${isoUtc}"`);
    }

    return () => ms;
}
