/**
 * Cloudflare Worker entry point. Hosts the REST API under `/api/*` (routes wired in `api/app.ts`)
 * and a `scheduled` handler that runs the hourly results sync (BL4, see `api/scheduled.ts`).
 */

import { buildApp } from '@api/app';
import { runScheduledSync } from '@api/scheduled';
import type { AppEnv } from '@api/types';

const app = buildApp();

export default {
    fetch: (request: Request, env: AppEnv['Bindings'], ctx: ExecutionContext): Response | Promise<Response> =>
        app.fetch(request, env, ctx),
    scheduled: (_controller: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext): void => {
        ctx.waitUntil(runScheduledSync(env));
    },
};
