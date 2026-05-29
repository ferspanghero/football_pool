/** Playwright config. Spawns wrangler dev (:8787) + vite dev (:5173) automatically. */

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tst/e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    // All specs share one wrangler dev whose clock is mutable global state (see helpers.ts
    // `setServerClock`), so they must run serially rather than in parallel workers.
    workers: 1,
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: [
        {
            command: 'npm run dev:worker',
            url: 'http://localhost:8787/api/tournament',
            reuseExistingServer: true,
            timeout: 60_000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            command: 'npm run dev',
            url: 'http://localhost:5173',
            reuseExistingServer: true,
            timeout: 30_000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
    ],
    projects: [
        {
            name: 'firefox',
            use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } },
        },
    ],
});
