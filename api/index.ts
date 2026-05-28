/**
 * Cloudflare Worker entry point. Hosts the REST API under `/api/*`. Routes are wired
 * in `api/app.ts`; this module just re-exports the built app.
 */

import { buildApp } from '@api/app';

export default buildApp();
