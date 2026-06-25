/**
 * E12/E13 — the two bonus features end-to-end (BL6 first-to-score, BL7 per-phase 2× boost).
 *
 * Both pin the clock before the first kickoff (so Round 1 is open and G_A_1 is predictable and
 * boostable). Each asserts the UI control persists across a reload and that the choice changes the
 * leaderboard total via the scoring engine. Specs self-clean their game.
 */

import { test, expect } from '@playwright/test';
import {
    cleanup,
    createGame,
    enterGameUi,
    fetchTournament,
    setClockBeforeTournament,
    setServerClock,
    shiftIso,
    uniqueGameName,
} from './helpers';

const GAME_PW = 'bonuspw';

type LeaderboardBody = { rows: Array<{ displayName: string; totalPoints: number }> };

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E12 — first-to-score pick persists and adds its bonus on the leaderboard', async ({ browser }) => {
    // Arrange — clock pinned before kickoff; Alice on the open Round 1.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setClockBeforeTournament(adminPage);
    const gameName = uniqueGameName('E12');
    const gameId = await createGame(adminPage, gameName, GAME_PW);
    createdGameIds.push(gameId);

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    // Act — predict a wrong score (0 base) but tap the home team's ⚽ (correct first scorer), and save.
    const fsRow = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_A_1"]') });
    await playerPage.locator('input[data-match="G_A_1"]').nth(0).fill('0');
    await playerPage.locator('input[data-match="G_A_1"]').nth(1).fill('3');
    await fsRow.locator('.pick-team.home .fs-pick').click();
    await playerPage.locator('button[data-match="G_A_1"]').click();
    await expect(playerPage.locator('button[data-match="G_A_1"]')).toContainText('Saved');

    // Assert — the pick survives a reload (the home ⚽ stays active)…
    await playerPage.reload();
    const reloadedRow = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_A_1"]') });
    await expect(reloadedRow.locator('.pick-team.home .fs-pick')).toHaveClass(/fs-on/);

    // …and once the admin records the real result + first scorer, it scores (group ×1 → +2).
    const put = await adminPage.request.put('/api/admin/results/G_A_1', {
        data: { homeGoals: 2, awayGoals: 1, firstScorer: 'HOME' },
    });
    expect(put.ok()).toBeTruthy();
    const lb = await playerPage.request.get(`/api/games/${gameId}/leaderboard`);
    const alice = ((await lb.json()) as LeaderboardBody).rows.find((r) => r.displayName === 'Alice');
    expect(alice?.totalPoints).toBe(2);

    await adminCtx.close();
    await playerCtx.close();
});

test('E13 — boosting a match doubles its points on the leaderboard', async ({ browser }) => {
    // Arrange — clock pinned before kickoff; Alice on the open Round 1.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setClockBeforeTournament(adminPage);
    const gameName = uniqueGameName('E13');
    const gameId = await createGame(adminPage, gameName, GAME_PW);
    createdGameIds.push(gameId);

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    // Act — predict an exact score (7), then boost that match.
    await playerPage.locator('input[data-match="G_A_1"]').nth(0).fill('2');
    await playerPage.locator('input[data-match="G_A_1"]').nth(1).fill('1');
    await playerPage.locator('button[data-match="G_A_1"]').click();
    await expect(playerPage.locator('button[data-match="G_A_1"]')).toContainText('Saved');

    const row = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_A_1"]') });
    await row.locator('.pick-boost button').click();
    await expect(row.locator('.pick-boost button')).toContainText('2× boosted');

    // Assert — the boost survives a reload…
    await playerPage.reload();
    const reloadedRow = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_A_1"]') });
    await expect(reloadedRow.locator('.pick-boost button')).toContainText('2× boosted');

    // …and doubles the exact-score points (7 × 2 = 14) once the result is recorded.
    const put = await adminPage.request.put('/api/admin/results/G_A_1', { data: { homeGoals: 2, awayGoals: 1 } });
    expect(put.ok()).toBeTruthy();
    const lb = await playerPage.request.get(`/api/games/${gameId}/leaderboard`);
    const alice = ((await lb.json()) as LeaderboardBody).rows.find((r) => r.displayName === 'Alice');
    expect(alice?.totalPoints).toBe(14);

    await adminCtx.close();
    await playerCtx.close();
});

test('E20 — a later Round-1 match stays boostable after earlier matches in the phase kick off', async ({ browser }) => {
    // Arrange — FIXED clock just after G_L_1's kickoff: many Round-1 matches (incl. the opener) have
    // started, but the later G_L_2 has not. Under the old phase-wide lock its boost would be gone.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const tour = await fetchTournament(adminPage);
    const gL1 = tour.matches.find((m) => m.id === 'G_L_1')!;
    await setServerClock(adminPage, { mode: 'FIXED', iso: shiftIso(gL1.kickoffUtc, 60_000) });
    const gameName = uniqueGameName('E20');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    // Assert — the phase is mid-flight: the opener G_A_1 has locked (no editable inputs) while the
    // later G_L_2 is still open. (Keys off the clock, so it's robust to any recorded results.)
    await expect(playerPage.locator('input[data-match="G_A_1"]')).toHaveCount(0);

    // …and the still-upcoming G_L_2 can be boosted, with the boost surviving a reload.
    const lateRow = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_L_2"]') });
    await expect(lateRow.locator('input[data-match="G_L_2"]')).toHaveCount(2);
    await lateRow.locator('.pick-boost button').click();
    await expect(lateRow.locator('.pick-boost button')).toContainText('2× boosted');

    await playerPage.reload();
    const reloaded = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_L_2"]') });
    await expect(reloaded.locator('.pick-boost button')).toContainText('2× boosted');

    await adminCtx.close();
    await playerCtx.close();
});

test('E14 — a scored My-picks row shows net points, the actual score, and a correct ⚽', async ({ browser }) => {
    // Arrange — clock pinned before kickoff; Alice predicts a wrong score (0-3) but the correct first scorer (home).
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await setClockBeforeTournament(adminPage);
    const gameName = uniqueGameName('E14');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');

    const row = playerPage.locator('.pick-row', { has: playerPage.locator('input[data-match="G_A_1"]') });
    await playerPage.locator('input[data-match="G_A_1"]').nth(0).fill('0');
    await playerPage.locator('input[data-match="G_A_1"]').nth(1).fill('3');
    await row.locator('.pick-team.home .fs-pick').click();
    await playerPage.locator('button[data-match="G_A_1"]').click();
    await expect(playerPage.locator('button[data-match="G_A_1"]')).toContainText('Saved');

    // Act — admin records the actual result + first scorer, then the clock moves past kickoff so the
    // row is locked and scored (0 base + correct first scorer in the group = +2).
    await adminPage.request.put('/api/admin/results/G_A_1', { data: { homeGoals: 2, awayGoals: 1, firstScorer: 'HOME' } });
    const tour = await fetchTournament(playerPage);
    const g1 = tour.matches.find((m) => m.id === 'G_A_1')!;
    await setServerClock(adminPage, { mode: 'FIXED', iso: shiftIso(g1.kickoffUtc, 1000) });
    await playerPage.reload();

    // Assert — net-points badge, the actual goals under each picker, and a correct (green) ⚽. Once
    // locked the inputs drop their data-match, so find the (only) scored row by its actual goals.
    const scored = playerPage.locator('.pick-row', { has: playerPage.locator('.pick-actual') });
    await expect(scored.locator('.badge.pts-pos')).toHaveText('+2');
    await expect(scored.locator('.pick-num.home .pick-actual')).toHaveText('2');
    await expect(scored.locator('.pick-num.away .pick-actual')).toHaveText('1');
    await expect(scored.locator('.pick-team.home .fs-mark.ok')).toHaveText('✓');

    await adminCtx.close();
    await playerCtx.close();
});
