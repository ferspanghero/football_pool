/**
 * E8 — per-player passwords + cookie resume (BL2).
 *
 * Signup sets a personal password; a returning login needs only that password (the shared
 * game password is the join gate and is not re-asked). A valid cookie offers a one-tap resume
 * card. Crucially, knowing the shared game password is NOT enough to log in as another player —
 * this is the impersonation hole BL2 closes.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, enterGameUi, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'bl2pw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E8 — returning login needs the player password; the game password cannot impersonate', async ({ browser }) => {
    // Arrange — a game; Alice signs up on her own device with a personal password.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E8');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    await enterGameUi(alicePage, gameName, GAME_PW, 'Alice', 'alice-secret');

    // Same device: the landing page offers a one-tap resume — no retyping.
    await alicePage.goto('/');
    await expect(alicePage.getByText(/Welcome back, Alice/)).toBeVisible();
    await alicePage.getByRole('button', { name: 'Continue' }).click();
    await expect(alicePage).toHaveURL(/\/game\//);

    // New device, correct password: log in with just name + player password (no game password).
    const newDeviceCtx = await browser.newContext();
    const newDevicePage = await newDeviceCtx.newPage();
    await newDevicePage.goto('/');
    await newDevicePage.getByLabel('Game', { exact: true }).selectOption({ label: gameName });
    await newDevicePage.getByLabel('Display name', { exact: true }).fill('Alice');
    await newDevicePage.getByLabel('Your password', { exact: true }).fill('alice-secret');
    await newDevicePage.getByRole('button', { name: 'Enter game' }).click();
    await expect(newDevicePage).toHaveURL(/\/game\//);

    // Attacker knows the shared game password but not Alice's → rejected, stuck on the entry screen.
    const attackerCtx = await browser.newContext();
    const attackerPage = await attackerCtx.newPage();
    await attackerPage.goto('/');
    await attackerPage.getByLabel('Game', { exact: true }).selectOption({ label: gameName });
    await attackerPage.getByLabel('Display name', { exact: true }).fill('Alice');
    await attackerPage.getByLabel('Your password', { exact: true }).fill('not-alices-password');
    await attackerPage.getByLabel('Game password', { exact: true }).fill(GAME_PW);
    await attackerPage.getByRole('button', { name: 'Enter game' }).click();
    await expect(attackerPage.locator('.error')).toBeVisible();
    await expect(attackerPage).toHaveURL(/\/$/);

    await adminCtx.close();
    await aliceCtx.close();
    await newDeviceCtx.close();
    await attackerCtx.close();
});
