/**
 * E12 — score rows auto-save when focus leaves the row, and the Save button is skipped in the
 * tab order (so you can tab straight across the number pickers). Covers My picks (player) and
 * the Admin Results tab.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, enterGameUi, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'autopw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E12 — My picks: a completed row auto-saves on leaving it, and Tab skips the Save button', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E12');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    const home = playerPage.locator('input[data-match="G_A_1"]').nth(0);
    const away = playerPage.locator('input[data-match="G_A_1"]').nth(1);
    const save = playerPage.locator('button[data-match="G_A_1"]');

    // Fill both, then leave the row without clicking Save → it auto-saves.
    await home.fill('3');
    await away.fill('0');
    await away.blur();
    await expect(save).toContainText('Saved');

    // Persisted: reload and the value is still there.
    await playerPage.reload();
    await expect(playerPage.locator('input[data-match="G_A_1"]').nth(0)).toHaveValue('3');

    // Tab order: home → away (the dash/teams aren't focusable), then away → NOT the Save button.
    await playerPage.locator('input[data-match="G_A_1"]').nth(0).focus();
    await playerPage.keyboard.press('Tab');
    await expect(playerPage.locator('input[data-match="G_A_1"]').nth(1)).toBeFocused();
    await playerPage.keyboard.press('Tab');
    await expect(playerPage.locator('button[data-match="G_A_1"]')).not.toBeFocused();

    await adminCtx.close();
    await playerCtx.close();
});

test('E12 — Admin Results: a completed row auto-saves on leaving it, and Tab skips the Save button', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E12admin');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    await adminPage.goto('/admin');
    await adminPage.getByRole('link', { name: 'Results' }).click();
    const row = adminPage.locator('li', { hasText: 'G_B_1' });
    const inputs = row.locator('input[type="number"]');

    // Fill both, then leave the row without clicking Save → it auto-saves.
    await inputs.nth(0).fill('2');
    await inputs.nth(1).fill('2');
    await inputs.nth(1).blur();
    await expect(row.getByRole('button')).toContainText('Saved');

    // Tab order: first input → second input, then second → NOT the Save button.
    await inputs.nth(0).focus();
    await adminPage.keyboard.press('Tab');
    await expect(inputs.nth(1)).toBeFocused();
    await adminPage.keyboard.press('Tab');
    await expect(row.getByRole('button')).not.toBeFocused();

    await adminCtx.close();
});
