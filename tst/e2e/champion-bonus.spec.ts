/**
 * E3 — the champion bonus shows up on the leaderboard after the final resolves.
 *
 * We script a full, decisive set of results (home wins every match) so the bracket resolves
 * end to end. The exact margins come from a fixed PRNG seed chosen because its script makes
 * the v1 best-third greedy resolve all the way to M104. We compute the eventual champion with
 * the same `resolveBracket` the server uses (its `@shared` imports are type-only, so it
 * transforms cleanly here), have Alice pick it and Bob pick someone else, record the very same
 * scores, then assert the +20 lands only on Alice.
 */

import { test, expect } from '@playwright/test';
import { ADMIN_PW, cleanup, createGame, enterGameUi, fetchTournament, setServerClock, uniqueGameName } from './helpers';
import { resolveBracket } from '../../shared/bracket';
import type { Match, MatchId, Score, Team } from '../../shared/types';

const GAME_PW = 'bonuspw';
const SEED = 6; // a script that drives the v1 bracket resolver all the way to the final

let createdGameIds: number[] = [];

function mulberry32(seed: number): () => number {
    let a = seed;

    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A decisive home win (margin 1-3) for every match, derived deterministically from SEED. */
function scriptedResults(matches: ReadonlyArray<Match>): Map<MatchId, Score> {
    const rng = mulberry32(SEED);
    const results = new Map<MatchId, Score>();
    for (const m of matches) {
        results.set(m.id, { home: 1 + Math.floor(rng() * 3), away: 0 });
    }

    return results;
}

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

test('E3 — the correct champion pick earns +20 on the leaderboard', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const aliceCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();

    // Real clock (today is before the tournament) → champion picks are open.
    await setServerClock(adminPage, { mode: 'REALTIME' });

    const t = await fetchTournament(adminPage);
    const teams = t.teams as unknown as Team[];
    const matches = t.matches as unknown as Match[];
    const results = scriptedResults(matches);
    const championId = resolveBracket(teams, matches, results).get('M104' as MatchId)?.homeTeamId;
    expect(championId, 'seeded script should resolve a champion').toBeTruthy();
    const otherTeamId = teams.find((team) => team.id !== championId)!.id;

    const gameName = uniqueGameName('E3-champ');
    const gameId = await createGame(adminPage, gameName, GAME_PW);
    createdGameIds.push(gameId);

    // Alice (UI session) picks the eventual champion; Bob (API only) picks someone else.
    await enterGameUi(alicePage, gameName, GAME_PW, 'Alice');
    expect((await alicePage.request.put('/api/me/champion', { data: { teamId: championId } })).ok()).toBeTruthy();
    expect(
        (await bobPage.request.post(`/api/games/${gameId}/enter`, { data: { password: GAME_PW, displayName: 'Bob' } })).ok(),
    ).toBeTruthy();
    expect((await bobPage.request.put('/api/me/champion', { data: { teamId: otherTeamId } })).ok()).toBeTruthy();

    // Record the scripted results (one admin login, then reuse the cookie).
    expect((await adminPage.request.post('/api/admin/login', { data: { password: ADMIN_PW } })).ok()).toBeTruthy();
    for (const m of matches) {
        const score = results.get(m.id)!;
        const res = await adminPage.request.put(`/api/admin/results/${m.id}`, {
            data: { homeGoals: score.home, awayGoals: score.away },
        });
        expect(res.ok()).toBeTruthy();
    }

    // Alice opens the leaderboard: neither player predicted any match, so the totals are
    // exactly the champion bonus (Alice) and nothing (Bob).
    await alicePage.getByRole('link', { name: 'Leaderboard' }).click();
    const board = alicePage.locator('.leaderboard-table');
    await expect(board).toBeVisible();
    const pointsCell = (name: string) => board.locator('tbody tr', { hasText: name }).locator('td').nth(2);
    await expect(pointsCell('Alice')).toHaveText('20');
    await expect(pointsCell('Bob')).toHaveText('0');

    await adminCtx.close();
    await aliceCtx.close();
    await bobCtx.close();
});
