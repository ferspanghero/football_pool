/**
 * E15 — the admin Results tab shows a provenance badge per recorded result (BL4). Recording a
 * result by hand marks it MANUAL (the badge the admin sees), which the scheduled sync never
 * overwrites. The AUTO badge shares the same rendering and is exercised by the unit tests, since
 * only the cron produces AUTO results (no user-facing path).
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, setServerClock, uniqueGameName } from './helpers';

// A group match no other spec records, so this stays self-contained against the persisted local D1.
const MATCH_ID = 'G_C_1';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E15 — recording a result shows a MANUAL provenance badge on its row', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await setServerClock(page, { mode: 'REALTIME' });
    // createGame also mints the admin session this spec needs.
    const gameId = await createGame(page, uniqueGameName('E15'), 'adminpw');
    createdGameIds.push(gameId);

    // Open the Results tab (GROUP_R1 is selected by default, which contains G_C_1).
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Results' }).click();
    const row = page.locator('li', { hasText: MATCH_ID });
    await expect(row).toBeVisible();

    // Record a one-sided result, then save the row.
    const inputs = row.locator(`input[data-match="${MATCH_ID}"]`);
    await inputs.nth(0).fill('2');
    await inputs.nth(1).fill('0');
    await row.getByRole('button').click();

    // The save is confirmed and the row now carries a MANUAL badge.
    await expect(page.locator('.toast')).toContainText(/saved/i);
    await expect(row.locator('[data-source="MANUAL"]')).toHaveText('MANUAL');

    await ctx.close();
});

test('E16 — "Sync results now" runs the live sync and reports a summary', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await setServerClock(page, { mode: 'REALTIME' });
    const gameId = await createGame(page, uniqueGameName('E16'), 'adminpw');
    createdGameIds.push(gameId);

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Results' }).click();

    // The button drives a real server-side pull from the live results feed (unmockable from the
    // browser); assert it completes and surfaces a sync toast — success ("Synced …") or a clean error.
    await page.getByRole('button', { name: /sync results now/i }).click();
    await expect(page.locator('.toast')).toContainText(/sync/i, { timeout: 20000 });

    await ctx.close();
});
