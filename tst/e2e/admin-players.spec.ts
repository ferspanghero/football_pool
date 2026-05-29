/**
 * E6 — the admin Players tab lists a game's players and can remove one.
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

test('E6 — admin lists a game\'s players and deletes one', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();

    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E6');
    const gameId = await createGame(adminPage, gameName, GAME_PW);
    createdGameIds.push(gameId);

    // Two players join via the API.
    expect(
        (await alicePage.request.post(`/api/games/${gameId}/enter`, { data: { displayName: 'Alice', playerPassword: 'player-pw', gamePassword: GAME_PW } })).ok(),
    ).toBeTruthy();
    expect(
        (await bobPage.request.post(`/api/games/${gameId}/enter`, { data: { displayName: 'Bob', playerPassword: 'player-pw', gamePassword: GAME_PW } })).ok(),
    ).toBeTruthy();

    // Admin already holds a session (it created the game); open the panel and go to Players.
    await adminPage.goto('/admin');
    await adminPage.getByRole('link', { name: 'Players' }).click();
    await adminPage.getByLabel('Game').selectOption({ label: gameName });

    // Both players are listed.
    const playerRow = (name: string) => adminPage.locator('li', { hasText: name });
    await expect(playerRow('Alice')).toBeVisible();
    await expect(playerRow('Bob')).toBeVisible();

    // Delete Bob → a confirmation toast shows, he disappears, Alice stays.
    await playerRow('Bob').getByRole('button', { name: 'Delete' }).click();
    await expect(adminPage.locator('.toast')).toContainText(/removed/i);
    await expect(playerRow('Bob')).toHaveCount(0);
    await expect(playerRow('Alice')).toBeVisible();

    await adminCtx.close();
    await aliceCtx.close();
    await bobCtx.close();
});
