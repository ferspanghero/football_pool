/**
 * E17 — theme toggle. Switching to Elifoot 98 sets `data-theme` on <html>, actually applies the
 * skin (green desktop), and persists across a reload; switching back to Classic clears it.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, enterGameUi, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'themepw';
const CLASSIC_BG = 'rgb(250, 250, 250)'; // --bg #fafafa
const ELIFOOT_BG = 'rgb(0, 128, 0)'; // --bg #008000

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E17 — theme toggle switches skin, persists across reload, and reverts', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    // Arrange — a player in a game, on the default (classic) theme.
    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E5');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Themer');

    const html = playerPage.locator('html');
    const body = playerPage.locator('body');
    await expect(html).not.toHaveAttribute('data-theme');
    await expect(body).toHaveCSS('background-color', CLASSIC_BG);

    // Act — switch to Elifoot 98.
    await playerPage.getByLabel('Theme').selectOption('elifoot');

    // Assert — attribute set and the green skin actually applied.
    await expect(html).toHaveAttribute('data-theme', 'elifoot');
    await expect(body).toHaveCSS('background-color', ELIFOOT_BG);

    // Act, Assert — the choice survives a full reload (pre-paint script re-applies it).
    await playerPage.reload();
    await expect(html).toHaveAttribute('data-theme', 'elifoot');
    await expect(body).toHaveCSS('background-color', ELIFOOT_BG);

    // Act, Assert — switching back to Classic clears the attribute and the skin.
    await playerPage.getByLabel('Theme').selectOption('classic');
    await expect(html).not.toHaveAttribute('data-theme');
    await expect(body).toHaveCSS('background-color', CLASSIC_BG);

    await adminCtx.close();
    await playerCtx.close();
});

test('E18 — theme toggle is available on the landing page', async ({ page }) => {
    // Arrange — the entry screen needs no game or login to expose the toggle.
    await page.goto('/');
    const html = page.locator('html');

    // Act
    await page.getByLabel('Theme').selectOption('elifoot');

    // Assert
    await expect(html).toHaveAttribute('data-theme', 'elifoot');

    // Cleanup — leave the shared dev origin on the default theme.
    await page.getByLabel('Theme').selectOption('classic');
});
