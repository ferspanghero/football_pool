import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
            '@data': fileURLToPath(new URL('./data', import.meta.url)),
            '@api': fileURLToPath(new URL('./api', import.meta.url)),
        },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    include: ['tst/shared/**/*.test.ts', 'tst/api/**/*.test.ts', 'tst/data/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                extends: true,
                test: {
                    name: 'browser',
                    include: ['tst/src/**/*.test.{ts,tsx}'],
                    environment: 'jsdom',
                },
            },
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            // UI rendering (src/) and one-shot scripts excluded per ~/.claude/skills/.conventions/javascript.md.
            // The frontend is E2E-tested by running the app; pure logic lives in shared/ and api/.
            include: ['shared/**/*.ts', 'api/**/*.ts', 'data/**/*.ts'],
            exclude: [
                '**/*.d.ts',
                '**/*.config.*',
                'api/index.ts',
                // Cron entry glue: wires the live fetch/clock/providers into the unit-tested syncResults.
                'api/scheduled.ts',
                'dist/**',
                'node_modules/**',
                '.wrangler/**',
                'tst/**',
                'src/**',
                'scripts/**',
            ],
            thresholds: {
                lines: 90,
                branches: 90,
            },
        },
    },
});
