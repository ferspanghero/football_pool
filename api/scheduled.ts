/**
 * Live sync wiring (BL4 + v4). Composes the live `fetch` and the ESPN provider into `syncBracket`
 * (resolve knockout teams) and `syncResults` (record finished results), shared by the hourly cron
 * (`runScheduledSync`, invoked from the Worker's `scheduled` handler in `api/index.ts`) and the
 * manual admin trigger (`POST /api/admin/sync-results`). Thin by design — all logic lives in the
 * injected, unit-tested pieces. The ESPN feed needs no key.
 */

import { WallClockProvider } from '@api/clock';
import { fetchFinishedResults, fetchScheduledFixtures } from '@api/providers/espn';
import { log } from '@api/log';
import { syncResults, type SyncSummary } from '@api/sync-results';
import { syncBracket, type BracketSyncSummary } from '@api/sync-bracket';
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
 * Run one knockout-bracket sync against the live ESPN feed, returning its summary. `ignoreWindow`
 * lets the manual trigger run regardless of the tournament window.
 */
export async function runBracketSync(
    env: AppEnv['Bindings'],
    opts: { now: number; ignoreWindow?: boolean | undefined },
): Promise<BracketSyncSummary> {
    return syncBracket({
        fixtures: (startDate, endDate) => fetchScheduledFixtures(fetch, startDate, endDate),
        db: env.DB,
        now: opts.now,
        ignoreWindow: opts.ignoreWindow,
    });
}

/**
 * Run the hourly scheduled sync: resolve knockout brackets **first**, then record finished results,
 * so a freshly-resolved knockout fixture's result can be picked up in the same tick. Each pass emits
 * an `info` summary on success (the cron's liveness signal — it confirms the job ran and what it
 * did, including a no-op `processed: 0`); a transient provider/network failure in one pass is logged
 * as `error` and isolated, so it neither aborts the other pass nor surfaces as an uncaught scheduled
 * rejection. The next hourly run retries.
 */
export async function runScheduledSync(env: AppEnv['Bindings']): Promise<void> {
    const now = WallClockProvider();
    try {
        const summary = await runBracketSync(env, { now });
        log.info('scheduled bracket sync', { ...summary });
    } catch (err) {
        log.error('scheduled bracket sync failed', { err: String(err) });
    }
    try {
        const summary = await runResultsSync(env, { now });
        log.info('scheduled results sync', { ...summary });
    } catch (err) {
        log.error('scheduled results sync failed', { err: String(err) });
    }
}
