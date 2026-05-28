/**
 * End-to-end happy path: admin creates a game, a player enters and saves a prediction,
 * admin records the actual result, and the leaderboard reflects the scoring.
 *
 * The test uses a fresh-per-run game name so it stays idempotent against the local D1
 * (which persists state between runs in `.wrangler/state/v3/d1/`).
 */

import { test, expect } from '@playwright/test';

const ADMIN_PW = 'admin-pass';
const GAME_PW = 'e2epw';
const DISPLAY_NAME = 'Alice';

test('admin creates game → player predicts → result recorded → leaderboard reflects score', async ({
    browser,
}) => {
    const gameName = `E2E ${Date.now()}`;

    // === Admin: log in and create a game ===
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.goto('/admin');
    await adminPage.getByLabel('Admin password').fill(ADMIN_PW);
    await adminPage.getByRole('button', { name: 'Log in' }).click();
    await expect(adminPage.getByText(/Create new game/)).toBeVisible();
    await adminPage.getByLabel('Name').fill(gameName);
    await adminPage.getByLabel('Password').fill(GAME_PW);
    await adminPage.getByRole('button', { name: 'Create' }).click();
    await expect(adminPage.getByText(gameName)).toBeVisible();

    // === Player: enter the game and save a prediction on G_A_1 (Mexico vs South Africa) ===
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await playerPage.goto('/');
    await playerPage.getByLabel('Game').selectOption({ label: gameName });
    await playerPage.getByLabel('Password').fill(GAME_PW);
    await playerPage.getByLabel('Display name').fill(DISPLAY_NAME);
    await playerPage.getByRole('button', { name: 'Enter game' }).click();

    // Match row: Mexico vs South Africa
    const matchRow = playerPage.locator('.match-row', { hasText: 'Mexico vs South Africa' });
    await expect(matchRow).toBeVisible();
    const numberInputs = matchRow.locator('input[type="number"]');
    await numberInputs.nth(0).fill('2');
    await numberInputs.nth(1).fill('1');
    const saveBtn = matchRow.getByRole('button');
    await saveBtn.click();
    await expect(saveBtn).toContainText('Saved');

    // === Admin: record the actual result 2-1 for G_A_1 ===
    await adminPage.getByRole('link', { name: 'Results' }).click();
    const resultRow = adminPage.locator('li', { hasText: 'G_A_1' });
    await expect(resultRow).toBeVisible();
    const resultInputs = resultRow.locator('input[type="number"]');
    await resultInputs.nth(0).fill('2');
    await resultInputs.nth(1).fill('1');
    await resultRow.getByRole('button', { name: 'Save' }).click();
    // No explicit success indicator on the admin row; allow a brief settle and then re-check.
    await adminPage.waitForTimeout(500);

    // === Player: open leaderboard and verify 7 points (exact prediction) ===
    await playerPage.getByRole('link', { name: 'Leaderboard' }).click();
    const board = playerPage.locator('.leaderboard-table');
    await expect(board).toContainText(DISPLAY_NAME);
    const aliceRow = board.locator('tr', { hasText: DISPLAY_NAME });
    await expect(aliceRow).toContainText('7');

    await adminCtx.close();
    await playerCtx.close();
});
