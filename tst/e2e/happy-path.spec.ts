/**
 * End-to-end happy path: admin creates a game, a player enters and saves a prediction,
 * admin records the actual result, and the leaderboard reflects the scoring.
 *
 * The test uses a fresh-per-run game name so it stays idempotent against the local D1
 * (which persists state between runs in `.wrangler/state/v3/d1/`).
 */

import { test, expect } from '@playwright/test';
import { setClockBeforeTournament } from './helpers';

const ADMIN_PW = 'admin-pass';
const GAME_PW = 'e2epw';
const DISPLAY_NAME = 'Alice';

test('admin creates game → player predicts → result recorded → leaderboard reflects score', async ({
    browser,
}) => {
    const gameName = `E2E ${Date.now()}`;

    // Pin the clock before the first kickoff so Round 1 (G_A_1) is open and predictable — otherwise
    // once real time passes the opener this happy path locks before the player can save a pick. Use a
    // throwaway context so the admin UI login below still sees a logged-out state (a pre-set admin
    // session would skip the password form).
    const clockCtx = await browser.newContext();
    await setClockBeforeTournament(await clockCtx.newPage());
    await clockCtx.close();

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
    await playerPage.getByRole('combobox').selectOption({ label: gameName });
    await playerPage.getByLabel('Display name', { exact: true }).fill(DISPLAY_NAME);
    await playerPage.getByLabel('Your password', { exact: true }).fill('alice-pw');
    await playerPage.getByLabel('Game password', { exact: true }).fill(GAME_PW);
    await playerPage.getByRole('button', { name: 'Enter game' }).click();

    // My picks opens on the current phase — pre-tournament, that's Group Stage Round 1.
    await expect(playerPage.getByRole('heading', { name: 'Group Stage — Round 1' })).toBeVisible();

    // Predict G_A_1 (Mexico vs South Africa) 2-1.
    const homeInput = playerPage.locator('input[data-match="G_A_1"]').nth(0);
    const awayInput = playerPage.locator('input[data-match="G_A_1"]').nth(1);
    const saveBtn = playerPage.locator('button[data-match="G_A_1"]');
    await expect(homeInput).toBeVisible();
    await homeInput.fill('2');
    await awayInput.fill('1');
    await saveBtn.click();
    await expect(saveBtn).toContainText('Saved');

    // Phase navigation: forward to Round 2 and back.
    await playerPage.getByRole('button', { name: 'Next phase' }).click();
    await expect(playerPage.getByRole('heading', { name: 'Group Stage — Round 2' })).toBeVisible();
    await playerPage.getByRole('button', { name: 'Previous phase' }).click();
    await expect(playerPage.getByRole('heading', { name: 'Group Stage — Round 1' })).toBeVisible();

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
