/**
 * E11 — the admin Games tab can delete a game (after confirming), removing it from the list.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'adminpw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E11 — admin deletes a game from the Games tab', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();

    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E11');
    const gameId = await createGame(adminPage, gameName, GAME_PW);
    createdGameIds.push(gameId); // cleanup is idempotent if the test already removed it

    // Admin already holds a session (it created the game); the Games tab is the default view.
    await adminPage.goto('/admin');
    const gameRow = adminPage.locator('li', { hasText: gameName });
    await expect(gameRow).toBeVisible();

    // Delete the game → accept the confirmation, a toast shows, and the row disappears.
    adminPage.on('dialog', (dialog) => dialog.accept());
    await gameRow.getByRole('button', { name: 'Delete' }).click();
    await expect(adminPage.locator('.toast')).toContainText(/deleted/i);
    await expect(gameRow).toHaveCount(0);

    await adminCtx.close();
});
