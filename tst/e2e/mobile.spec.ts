/**
 * BL9 — first-class mobile experience.
 *
 * Renders the prediction and leaderboard surfaces at a phone-sized viewport and asserts the
 * responsive reflow holds: no horizontal page overflow, each match shows as a self-contained
 * card (`.pick-row` becomes a grid box rather than the desktop `display: contents`), the
 * leaderboard table collapses to stacked cards (its header row is hidden), and a prediction
 * still saves at narrow width. CSS has no unit-test path and `src/` is excluded from the
 * coverage gate, so this E2E is the only automated guard against responsive regressions.
 */

import { test, expect, type Page } from '@playwright/test';
import { cleanup, createGame, enterGameUi, setServerClock, uniqueGameName } from './helpers';

const GAME_PW = 'mobilepw';

// A typical phone viewport (overrides the project's 1280×800 desktop default for this file).
test.use({ viewport: { width: 375, height: 812 } });

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

/** True when the document is not wider than the viewport (i.e. nothing overflows horizontally). */
async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test('E11 — My picks and the leaderboard reflow on a phone viewport', async ({ browser }) => {
    // Arrange — a game on the real-time clock so Round 1 opens with G_A_1 still predictable.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E11');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    // Assert — My picks fits the viewport and each match is a stacked card, not a flat grid row.
    expect(await hasNoHorizontalOverflow(playerPage)).toBe(true);
    const firstRow = playerPage.locator('.pick-row').first();
    await expect(firstRow).toBeVisible();
    const rowDisplay = await firstRow.evaluate((el) => getComputedStyle(el).display);
    expect(rowDisplay).toBe('grid'); // desktop would be 'contents'

    // A prediction still saves at narrow width (tap targets reachable).
    await playerPage.locator('input[data-match="G_A_1"]').nth(0).fill('2');
    await playerPage.locator('input[data-match="G_A_1"]').nth(1).fill('1');
    await playerPage.locator('button[data-match="G_A_1"]').click();
    await expect(playerPage.locator('button[data-match="G_A_1"]')).toContainText('Saved');

    // Leaderboard collapses to stacked cards: the table header row is hidden on mobile.
    await playerPage.getByRole('link', { name: 'Leaderboard' }).click();
    await expect(playerPage.locator('.leaderboard-table')).toBeVisible();
    const theadDisplay = await playerPage
        .locator('.leaderboard-table thead')
        .evaluate((el) => getComputedStyle(el).display);
    expect(theadDisplay).toBe('none');
    expect(await hasNoHorizontalOverflow(playerPage)).toBe(true);

    await adminCtx.close();
    await playerCtx.close();
});
