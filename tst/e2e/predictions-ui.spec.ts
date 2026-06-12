/**
 * E9 — prediction inputs on My picks.
 *
 * An unsaved match shows empty inputs (0-0 is itself a valid prediction, so a blank must not
 * read as 0), and a save is blocked client-side until both scores are filled.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, enterGameUi, setClockBeforeTournament, uniqueGameName } from './helpers';

const GAME_PW = 'predpw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E9 — unsaved picks show empty inputs and a half-filled score cannot be saved', async ({ browser }) => {
    // Arrange — clock pinned before kickoff; My picks opens on Round 1 with G_A_1 still open.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setClockBeforeTournament(adminPage);
    const gameName = uniqueGameName('E9');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    const home = playerPage.locator('input[data-match="G_A_1"]').nth(0);
    const away = playerPage.locator('input[data-match="G_A_1"]').nth(1);
    const save = playerPage.locator('button[data-match="G_A_1"]');

    // Empty by default — not "0".
    await expect(home).toHaveValue('');
    await expect(away).toHaveValue('');

    // A half-filled score is rejected client-side, before any request.
    await home.fill('2');
    await save.click();
    await expect(playerPage.locator('.pick-error').first()).toContainText(/enter both/i);

    // Both filled → saves.
    await away.fill('1');
    await save.click();
    await expect(save).toContainText('Saved');

    await adminCtx.close();
    await playerCtx.close();
});

test('E10 — an unresolved knockout shows TBD and cannot be predicted', async ({ browser }) => {
    // Arrange — clock pinned before kickoff; navigate My picks forward to the Round of 32 (placeholders).
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setClockBeforeTournament(adminPage);
    const gameName = uniqueGameName('E10');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');
    for (let i = 0; i < 3; i++) await playerPage.getByRole('button', { name: 'Next phase' }).click();
    await expect(playerPage.getByRole('heading', { name: 'Round of 32' })).toBeVisible();

    // Assert — rows are read-only TBD: a TBD badge shows and there are no score inputs.
    await expect(playerPage.getByText('TBD').first()).toBeVisible();
    await expect(playerPage.locator('input[data-match]')).toHaveCount(0);

    // And the server rejects a direct save on a placeholder knockout.
    const res = await playerPage.request.put('/api/me/predictions/M73', { data: { homeGoals: 1, awayGoals: 0 } });
    expect(res.status()).toBe(403);

    await adminCtx.close();
    await playerCtx.close();
});
