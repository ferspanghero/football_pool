/**
 * Live results-sync wiring (BL4). Composes the live `fetch` and the ESPN provider into
 * `syncResults`, shared by the hourly cron (`runScheduledSync`, invoked from the Worker's
 * `scheduled` handler in `api/index.ts`) and the manual admin trigger (`POST /api/admin/sync-results`).
 * Thin by design — all logic lives in the injected, unit-tested pieces. The ESPN feed needs no key.
 */

import { WallClockProvider } from '@api/clock';
import { fetchFinishedResults } from '@api/providers/espn';
import { syncResults, type SyncSummary } from '@api/sync-results';
import type { AppEnv } from '@api/types';

/**
 * Run one results sync against the live ESPN feed, returning its summary. `ignoreWindow` lets the
 * manual trigger run regardless of the tournament window.
 */
export async function runResultsSync(
    env: AppEnv['Bindings'],
    opts: { now: number; ignoreWindow?: boolean | undefined },
): Promise<SyncSummary> {
    return syncResults({
        results: (startDate, endDate) => fetchFinishedResults(fetch, startDate, endDate),
        db: env.DB,
        now: opts.now,
        ignoreWindow: opts.ignoreWindow,
    });
}

/**
 * Run the hourly scheduled sync. A transient provider/network failure is logged rather than left to
 * surface as an uncaught scheduled rejection; the next hourly run retries. The run's effect is
 * observable via Workers invocation logs and the recorded results themselves.
 */
export async function runScheduledSync(env: AppEnv['Bindings']): Promise<void> {
    try {
        await runResultsSync(env, { now: WallClockProvider() });
    } catch (err) {
        console.error('results sync failed:', err instanceof Error ? err.message : err);
    }
}
