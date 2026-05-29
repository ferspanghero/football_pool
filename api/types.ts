/**
 * Hono app environment types — bindings (env vars + DB) and per-request variables
 * (set by middleware). Imported by `api/index.ts` and every middleware/route module.
 */

import type { ClockProvider } from '@api/clock';

export type AppEnv = {
    /** Cloudflare Worker bindings + secrets (set via `wrangler.toml` and `wrangler secret put`). */
    Bindings: {
        DB: D1Database;
        SESSION_SECRET: string;
        ADMIN_PASSWORD_HASH: string;
        /**
         * Deployment stage. When `'TEST'`, the test-only clock-control endpoint
         * (`POST /api/admin/test/clock`) is enabled. Unset (or any other value) in production.
         */
        DEPLOYMENT_STAGE?: string;
    };
    /** Per-request variables populated by middleware. */
    Variables: {
        gameId?: number;
        playerId?: number;
        admin?: true;
        /** Clock provider for this request — set by the app-level middleware in `buildApp`. */
        clock: ClockProvider;
    };
};
