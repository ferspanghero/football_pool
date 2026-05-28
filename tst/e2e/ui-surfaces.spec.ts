/**
 * E4a-d — read-only UI surfaces render correctly.
 *
 * E4a Groups tab → 12 cards. E4b Knockouts tab → phase sections + slot labels.
 * E4c Match detail → hidden before kickoff, full prediction grid after (it gates on the
 * browser clock, so the post case drives both `page.clock` and the server clock past kickoff).
 * E4d Switch game → clears the session and returns to `/`.
 */

import { test, expect } from '@playwright/test';
import { cleanup, createGame, enterGameUi, fetchTournament, setResult, setServerClock, shiftIso, uniqueGameName } from './helpers';

const GAME_PW = 'uipw';
const FIVE_MIN = 5 * 60 * 1000;

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E4a — Groups tab renders 12 group cards', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E4a');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    await playerPage.getByRole('link', { name: 'Groups' }).click();
    await expect(playerPage.locator('.group-card')).toHaveCount(12);

    await adminCtx.close();
    await playerCtx.close();
});

test('E4b — Knockouts tab renders phases and slot labels', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E4b');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    await playerPage.getByRole('link', { name: 'Knockouts' }).click();
    await expect(playerPage.getByRole('heading', { name: 'Round of 32' })).toBeVisible();
    await expect(playerPage.getByRole('heading', { name: 'Final', exact: true })).toBeVisible();
    await expect(playerPage.getByText(/Winner of Group/).first()).toBeVisible();
    await expect(playerPage.getByText(/Best 3rd from/).first()).toBeVisible();

    await adminCtx.close();
    await playerCtx.close();
});

test('E4c — match detail hides predictions before kickoff and shows them after', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();

    const t = await fetchTournament(adminPage);
    const gA1 = t.matches.find((m) => m.id === 'G_A_1')!;
    const kickoffMs = Date.parse(gA1.kickoffUtc);

    // Open window: both players predict G_A_1, admin records the result.
    await setServerClock(adminPage, { mode: 'FIXED', iso: shiftIso(gA1.kickoffUtc, -FIVE_MIN) });
    const gameName = uniqueGameName('E4c');
    const gameId = await createGame(adminPage, gameName, GAME_PW);
    createdGameIds.push(gameId);
    await enterGameUi(alicePage, gameName, GAME_PW, 'Alice');
    expect((await alicePage.request.put('/api/me/predictions/G_A_1', { data: { homeGoals: 2, awayGoals: 1 } })).ok()).toBeTruthy();
    expect(
        (await bobPage.request.post(`/api/games/${gameId}/enter`, { data: { password: GAME_PW, displayName: 'Bob' } })).ok(),
    ).toBeTruthy();
    expect((await bobPage.request.put('/api/me/predictions/G_A_1', { data: { homeGoals: 1, awayGoals: 0 } })).ok()).toBeTruthy();
    await setResult(adminPage, 'G_A_1', 2, 1);

    // Before kickoff (browser on its real clock, today): the grid is hidden.
    await alicePage.goto(`/game/${gameId}/match/G_A_1`);
    await expect(alicePage.getByText(/visible after kickoff/i)).toBeVisible();

    // After kickoff: advance both the browser clock and the server clock past kickoff.
    await setServerClock(adminPage, { mode: 'FIXED', iso: shiftIso(gA1.kickoffUtc, 1) });
    await alicePage.clock.install({ time: new Date(kickoffMs + 60_000) });
    await alicePage.goto(`/game/${gameId}/match/G_A_1`);
    const table = alicePage.locator('.leaderboard-table');
    await expect(table).toContainText('Alice');
    await expect(table).toContainText('Bob');
    await expect(alicePage.getByText(/Actual result: 2 - 1/)).toBeVisible();

    await adminCtx.close();
    await aliceCtx.close();
    await bobCtx.close();
});

test('E4d — Switch game clears the session and returns to the entry screen', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    await setServerClock(adminPage, { mode: 'REALTIME' });
    const gameName = uniqueGameName('E4d');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    await playerPage.getByRole('button', { name: 'Switch game' }).click();
    await expect(playerPage.getByRole('heading', { name: 'FIFA 2026 Pool' })).toBeVisible();
    const me = await playerPage.request.get('/api/me');
    expect(me.status()).toBe(401);

    await adminCtx.close();
    await playerCtx.close();
});
