/**
 * E2E-MCP1 / E2E-MCP2 — the MCP server end to end, exercised the way Claude Code would: mint a
 * bearer from the logged-in browser session, then drive JSON-RPC (`initialize` → `tools/list` →
 * `tools/call`) over HTTP with that bearer. Pinned to a pre-kickoff clock so the opener is open,
 * then advanced past kickoff to prove the server-side lock holds on the MCP surface too.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { cleanup, createGame, enterGameUi, fetchTournament, setClockBeforeTournament, setServerClock, shiftIso, uniqueGameName } from './helpers';

const GAME_PW = 'mcppw';

let createdGameIds: number[] = [];

test.afterEach(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await cleanup(page, createdGameIds);
    await ctx.close();
    createdGameIds = [];
});

/** Send one JSON-RPC message to the MCP endpoint with an optional bearer token. */
function rpc(reqCtx: APIRequestContext, token: string | undefined, method: string, params: unknown) {
    return reqCtx.post('/api/mcp', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        data: { jsonrpc: '2.0', id: 1, method, params },
    });
}

test('E2E-MCP1 — connect, predict via tools/call, and the lock holds after kickoff', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();

    // Arrange — pin before the tournament so G_A_1 is open, then sign a player in via the UI
    await setClockBeforeTournament(adminPage);
    const gameName = uniqueGameName('mcp');
    createdGameIds.push(await createGame(adminPage, gameName, GAME_PW));
    await enterGameUi(playerPage, gameName, GAME_PW, 'Alice');
    const t = await fetchTournament(adminPage);
    const gA1 = t.matches.find((m) => m.id === 'G_A_1')!;

    // Mint the bearer from the logged-in session (what the Connect panel does)
    const tokenRes = await playerPage.request.post('/api/mcp/token');
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = (await tokenRes.json()) as { token: string };

    // Act — handshake + discover + submit a prediction over MCP
    const initRes = await rpc(playerPage.request, token, 'initialize', { protocolVersion: '2025-06-18' });
    const initBody = (await initRes.json()) as { result: { serverInfo: { name: string } } };
    const listRes = await rpc(playerPage.request, token, 'tools/list', {});
    const listBody = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
    const callRes = await rpc(playerPage.request, token, 'tools/call', {
        name: 'submit_prediction',
        arguments: { matchId: 'G_A_1', homeGoals: 2, awayGoals: 1 },
    });
    const callBody = (await callRes.json()) as { result: { isError?: boolean } };

    // Assert — handshake ok, tool present, prediction written and visible to the browser session
    expect(initBody.result.serverInfo.name).toBe('football-pool');
    expect(listBody.result.tools.map((tool) => tool.name)).toContain('submit_prediction');
    expect(callBody.result.isError).toBeFalsy();
    const me = await playerPage.request.get('/api/me');
    const meBody = (await me.json()) as { predictions: Array<{ matchId: string; score: { home: number; away: number } }> };
    expect(meBody.predictions.find((p) => p.matchId === 'G_A_1')?.score).toEqual({ home: 2, away: 1 });

    // get_my_entry exposes the caller's identity so the model doesn't guess it from the server name
    const entryRes = await rpc(playerPage.request, token, 'tools/call', { name: 'get_my_entry', arguments: {} });
    const entryBody = (await entryRes.json()) as { result: { content: Array<{ text: string }> } };
    expect((JSON.parse(entryBody.result.content[0]!.text) as { displayName: string }).displayName).toBe('Alice');

    // Act — kickoff passes; the same tool call is now rejected by the server lock
    await setServerClock(adminPage, { mode: 'FIXED', iso: shiftIso(gA1.kickoffUtc, 1) });
    const lockedRes = await rpc(playerPage.request, token, 'tools/call', {
        name: 'submit_prediction',
        arguments: { matchId: 'G_A_1', homeGoals: 3, awayGoals: 0 },
    });
    const lockedBody = (await lockedRes.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };

    // Assert
    expect(lockedBody.result.isError).toBe(true);
    expect(lockedBody.result.content[0]!.text).toMatch(/locked/i);

    await adminCtx.close();
    await playerCtx.close();
});

test('E2E-MCP2 — an MCP request with no bearer is rejected (401)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Act
    const res = await rpc(page.request, undefined, 'ping', {});

    // Assert
    expect(res.status()).toBe(401);

    await ctx.close();
});
