/**
 * Live results-sync wiring (BL4). Composes the live `fetch` and the ESPN provider into
 * `syncResults`, shared by the hourly cron (`runScheduledSync`, invoked from the Worker's
 * `scheduled` handler in `api/index.ts`) and the manual admin trigger (`POST /api/admin/sync-results`).
 * Thin by design — all logic lives in the injected, unit-tested pieces. The ESPN feed needs no key.
 */

import { WallClockProvider } from '@api/clock';
import { fetchFinishedResults } from '@api/providers/espn';
import { log } from '@api/log';
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
 * Run the hourly scheduled sync. Emits an `info` summary on success (the cron's liveness signal —
 * it confirms the job ran and what it did, including a no-op `processed: 0`) and logs a transient
 * provider/network failure as `error` rather than letting it surface as an uncaught scheduled
 * rejection; the next hourly run retries.
 */
export async function runScheduledSync(env: AppEnv['Bindings']): Promise<void> {
    try {
        const summary = await runResultsSync(env, { now: WallClockProvider() });
        log.info('scheduled results sync', { ...summary });
    } catch (err) {
        log.error('scheduled results sync failed', { err: String(err) });
    }
}
