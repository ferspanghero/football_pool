/**
 * E2 / E2b — kickoff locks are enforced by the server clock.
 *
 * Each test brackets two FIXED clocks five minutes apart (just before / just after the
 * relevant kickoff) and drives the UI through the open→locked transition: a save succeeds
 * while open, then the same save is rejected with a refresh hint once the clock passes the
 * lock point. The browser keeps its real clock, so the inputs stay visible — that is exactly
 * the stale-page race the refresh message exists for.
 */

import { test, expect } from '@playwright/test';
import { createGame, cleanup, enterGameUi, fetchTournament, setServerClock, shiftIso, uniqueGameName } from './helpers';

const GAME_PW = 'lockpw';
const FIVE_MIN = 5 * 60 * 1000;

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E2 — a prediction save is rejected once kickoff passes, with a refresh hint', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    // Arrange — two clocks bracketing G_A_1's kickoff
    const t = await fetchTournament(adminPage);
    const gA1 = t.matches.find((m) => m.id === 'G_A_1')!;
    const justBefore = shiftIso(gA1.kickoffUtc, -FIVE_MIN);
    const justAfter = shiftIso(gA1.kickoffUtc, 1);

    await setServerClock(adminPage, { mode: 'FIXED', iso: justBefore });
    const gameName = uniqueGameName('E2-lock');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    // A save while the match is open succeeds (G_A_1 is in the default Round 1 phase)
    const homeInput = playerPage.locator('input[data-match="G_A_1"]').nth(0);
    const awayInput = playerPage.locator('input[data-match="G_A_1"]').nth(1);
    const saveBtn = playerPage.locator('button[data-match="G_A_1"]');
    await expect(homeInput).toBeVisible();
    await homeInput.fill('2');
    await awayInput.fill('1');
    await saveBtn.click();
    await expect(saveBtn).toContainText('Saved');

    // Act — kickoff passes; the player edits and re-saves on a now-stale page
    await setServerClock(adminPage, { mode: 'FIXED', iso: justAfter });
    await awayInput.fill('2');
    await saveBtn.click();

    // Assert — refresh guidance is shown, and the server rejects a direct retry too
    await expect(playerPage.locator('.pick-error')).toContainText(/refresh/i);
    const retry = await playerPage.request.put(`/api/me/predictions/${gA1.id}`, {
        data: { homeGoals: 3, awayGoals: 0 },
    });
    expect(retry.status()).toBe(403);

    await adminCtx.close();
    await playerCtx.close();
});

test('E2b — the champion pick locks at first kickoff', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    const t = await fetchTournament(adminPage);
    const beforeFirst = shiftIso(t.firstKickoffUtc, -FIVE_MIN);
    const afterFirst = shiftIso(t.firstKickoffUtc, 1);
    const [teamA, teamB] = t.teams;

    await setServerClock(adminPage, { mode: 'FIXED', iso: beforeFirst });
    const gameName = uniqueGameName('E2b-champ');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    // Picking a champion while open succeeds (confirmed via the API)
    const champ = playerPage.locator('section', { hasText: 'Champion pick' });
    await champ.locator('select').selectOption(teamA!.id);
    await champ.getByRole('button', { name: /save/i }).click();
    await expect
        .poll(async () => {
            const me = await playerPage.request.get('/api/me');

            return ((await me.json()) as { championTeamId: string | null }).championTeamId;
        })
        .toBe(teamA!.id);

    // Act — first kickoff passes; the player attempts to change the pick
    await setServerClock(adminPage, { mode: 'FIXED', iso: afterFirst });
    await champ.locator('select').selectOption(teamB!.id);
    await champ.getByRole('button', { name: /save/i }).click();

    // Assert — refresh guidance is shown, and the API still rejects a direct change
    await expect(champ.locator('.error')).toContainText(/refresh/i);
    const retry = await playerPage.request.put('/api/me/champion', { data: { teamId: teamB!.id } });
    expect(retry.status()).toBe(403);

    await adminCtx.close();
    await playerCtx.close();
});
