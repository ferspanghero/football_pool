/**
 * E7 — kickoff times render in the *viewer's* own browser time zone (BL3).
 *
 * Playwright overrides each context's `timezoneId` + `locale`, so the same stored UTC instant
 * renders differently per viewer. This is the browser-level proof that the time formatters
 * resolve the browser's zone rather than a hardcoded one. The earliest group match (G_A_1,
 * 2026-06-11T19:00Z) lands at 12:00 PM PDT on Jun 11 in Los Angeles but 4:00 AM JST on Jun 12
 * in Tokyo — so both the clock label and the calendar day differ. Before BL3 both would show PDT.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, enterGameUi, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'tzpw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E7 — the same kickoff renders in each viewer\'s browser time zone', async ({ browser }) => {
    // Arrange — one game on the real-time clock; My picks defaults to the first group round.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E7');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    // Act + Assert — a viewer in Los Angeles sees Pacific time on Jun 11.
    const laCtx = await browser.newContext({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });
    const laPage = await laCtx.newPage();
    await enterGameUi(laPage, gameName, GAME_PW, 'Pacific');
    await expect(laPage.locator('.day-card h3').first()).toHaveText(/Jun 11/);
    await expect(laPage.locator('.pick-time').first()).toHaveText(/PDT/);

    // Act + Assert — a viewer in Tokyo sees the same instant +9h: next calendar day, no PDT label.
    const tokyoCtx = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo' });
    const tokyoPage = await tokyoCtx.newPage();
    await enterGameUi(tokyoPage, gameName, GAME_PW, 'Tokyo');
    await expect(tokyoPage.locator('.day-card h3').first()).toHaveText(/Jun 12/);
    await expect(tokyoPage.locator('.pick-time').first()).toHaveText(/GMT\+9/);
    await expect(tokyoPage.getByText('PDT')).toHaveCount(0);

    await adminCtx.close();
    await laCtx.close();
    await tokyoCtx.close();
});
