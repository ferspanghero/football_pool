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
    // Restore real time so a pinned clock from any spec here never leaks into the next file.
    await setServerClock(page, { mode: 'REALTIME' });
    await ctx.close();
    createdGameIds = [];
});

test('E15 — recording a result shows a MANUAL provenance badge on its row', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Pin to before the tournament so the panel's current-phase default lands on Round 1 (which
    // holds G_C_1). Recording a result is clock-independent — this only steadies the default phase.
    await setServerClock(page, { mode: 'FIXED', iso: '2026-06-01T00:00:00Z' });
    // createGame also mints the admin session this spec needs.
    const gameId = await createGame(page, uniqueGameName('E15'), 'adminpw');
    createdGameIds.push(gameId);

    // Open the Results tab — Round 1 is the current phase under the pinned clock, so it is the
    // default selection and contains G_C_1.
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

    // The button drives a real server-side pull from the live feed — knockout brackets then finished
    // results (unmockable from the browser); assert it completes and surfaces a sync toast — success
    // ("Synced …") or a clean error.
    await page.getByRole('button', { name: /sync now/i }).click();
    await expect(page.locator('.toast')).toContainText(/sync/i, { timeout: 20000 });

    await ctx.close();
});

test('E21 — admin sets a knockout fixture’s teams inline before kickoff, and it persists', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Pre-tournament clock: every knockout fixture is still upcoming, so its teams are editable.
    await setServerClock(page, { mode: 'FIXED', iso: '2026-06-01T00:00:00Z' });
    createdGameIds.push(await createGame(page, uniqueGameName('E21'), 'adminpw'));

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Results' }).click();
    await page.getByLabel('Phase').selectOption('R32');

    // M88's row (same table/style as the group rows) exposes home/away dropdowns; picking both
    // auto-saves the pairing.
    await page.locator('select[data-team-home="M88"]').selectOption('BRA');
    await page.locator('select[data-team-away="M88"]').selectOption('ARG');
    await expect(page.locator('.toast')).toContainText(/teams set/i);

    // The resolution survives a reload (the dropdowns re-open on the saved teams). A reload resets to
    // the Games tab, so re-open Results and the R32 phase first.
    await page.reload();
    await page.getByRole('link', { name: 'Results' }).click();
    await page.getByLabel('Phase').selectOption('R32');
    await expect(page.locator('select[data-team-home="M88"]')).toHaveValue('BRA');
    await expect(page.locator('select[data-team-away="M88"]')).toHaveValue('ARG');

    await ctx.close();
});

test('E22 — a knockout fixture that has kicked off can no longer have its teams edited', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Clock after M73's kickoff (2026-06-28) but before M88's (2026-07-03) — both R32 fixtures.
    await setServerClock(page, { mode: 'FIXED', iso: '2026-07-01T00:00:00Z' });
    createdGameIds.push(await createGame(page, uniqueGameName('E22'), 'adminpw'));

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Results' }).click();
    await page.getByLabel('Phase').selectOption('R32');

    // M73 has kicked off → its teams are frozen (plain labels, no dropdowns); M88 hasn't → editable.
    await expect(page.locator('select[data-team-home="M88"]')).toHaveCount(1);
    await expect(page.locator('select[data-team-home="M73"]')).toHaveCount(0);

    await ctx.close();
});

test('E17 — the Results tab opens on the current phase, not always Round 1', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Pin the clock mid-tournament, to an instant whose current phase is the Round of 16 — decidedly
    // not the old hardcoded GROUP_R1 default, so the assertion proves the new current-phase default.
    await setServerClock(page, { mode: 'FIXED', iso: '2026-07-05T12:00:00Z' });
    const gameId = await createGame(page, uniqueGameName('E17'), 'adminpw');
    createdGameIds.push(gameId);

    await page.goto('/admin');
    await page.getByRole('link', { name: 'Results' }).click();

    // The phase selector defaults to the current phase, derived from the authoritative server clock.
    await expect(page.getByLabel('Phase')).toHaveValue('R16');

    await ctx.close();
});
