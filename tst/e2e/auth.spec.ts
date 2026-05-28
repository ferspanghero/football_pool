/**
 * E5 — authentication rejections.
 *
 * A wrong admin password leaves the admin panel hidden; a wrong game password keeps the
 * player on the entry screen. Both surface an error and neither grants access.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'authpw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E5 — wrong admin password and wrong game password are rejected', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E5');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    // Wrong admin password → error, no admin panel.
    const adminUiCtx = await browser.newContext();
    const adminUiPage = await adminUiCtx.newPage();
    await adminUiPage.goto('/admin');
    await adminUiPage.getByLabel('Admin password').fill('definitely-not-the-admin-password');
    await adminUiPage.getByRole('button', { name: 'Log in' }).click();
    await expect(adminUiPage.locator('.error')).toBeVisible();
    await expect(adminUiPage.getByText(/Create new game/)).toHaveCount(0);

    // Wrong game password → error, still on the entry screen (no navigation to /game/:id).
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await playerPage.goto('/');
    await playerPage.getByLabel('Game').selectOption({ label: gameName });
    await playerPage.getByLabel('Password').fill('wrong-game-password');
    await playerPage.getByLabel('Display name').fill('Mallory');
    await playerPage.getByRole('button', { name: 'Enter game' }).click();
    await expect(playerPage.locator('.error')).toBeVisible();
    await expect(playerPage).toHaveURL(/\/$/);

    await adminCtx.close();
    await adminUiCtx.close();
    await playerCtx.close();
});
