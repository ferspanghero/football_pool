/**
 * Shared helpers for the E2E specs.
 *
 * The whole suite drives one `wrangler dev`. Its server clock is mutable global state,
 * controlled via `POST /api/admin/test/clock` (enabled by `DEPLOYMENT_STAGE=TEST` in
 * `.dev.vars`). Because that state is shared, the specs run serially (`workers: 1`) and each
 * resets the clock to real time in `afterEach`.
 */

import { expect, type Page } from '@playwright/test';

/** Admin password — matches the `ADMIN_PASSWORD_HASH` baked into the local `.dev.vars`. */
export const ADMIN_PW = 'admin-pass';

type TournamentMatch = {
    id: string;
    phase: string;
    kickoffUtc: string;
    homeTeamId?: string;
    awayTeamId?: string;
};
export type TournamentPayload = {
    teams: Array<{ id: string; name: string }>;
    matches: TournamentMatch[];
    firstKickoffUtc: string;
};

/** A unique game name per call so runs stay idempotent against the persisted local D1. */
export function uniqueGameName(prefix: string): string {
    return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** An ISO string `deltaMs` away from `isoUtc` (negative = earlier). */
export function shiftIso(isoUtc: string, deltaMs: number): string {
    return new Date(Date.parse(isoUtc) + deltaMs).toISOString();
}

/** Fetch the static tournament payload (teams, matches, first kickoff) through the worker. */
export async function fetchTournament(page: Page): Promise<TournamentPayload> {
    const res = await page.request.get('/api/tournament');
    expect(res.ok()).toBeTruthy();

    return (await res.json()) as TournamentPayload;
}

/** Authenticate as admin on the page's request context (mints a fresh `admin_session`). */
async function authAdmin(page: Page): Promise<void> {
    const res = await page.request.post('/api/admin/login', { data: { password: ADMIN_PW } });
    expect(res.ok()).toBeTruthy();
}

/**
 * Set the server clock via the test endpoint. Re-authenticates first: a session cookie's
 * expiry is relative to the clock when it was issued, so a previous FIXED jump may have aged
 * the admin cookie out — a fresh login mints one valid at the current clock.
 */
export async function setServerClock(
    page: Page,
    body: { mode: 'REALTIME' } | { mode: 'FIXED'; iso: string },
): Promise<void> {
    await authAdmin(page);
    const res = await page.request.post('/api/admin/test/clock', { data: body });
    expect(res.ok()).toBeTruthy();
}

/** Create a game via the admin API and return its id. */
export async function createGame(page: Page, name: string, password: string): Promise<number> {
    await authAdmin(page);
    const res = await page.request.post('/api/admin/games', { data: { name, password } });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { game: { id: number } };

    return body.game.id;
}

/** Record an official match result via the admin API. */
export async function setResult(page: Page, matchId: string, home: number, away: number): Promise<void> {
    await authAdmin(page);
    const res = await page.request.put(`/api/admin/results/${matchId}`, { data: { homeGoals: home, awayGoals: away } });
    expect(res.ok()).toBeTruthy();
}

/** Enter a game through the `/` form as `displayName`. Leaves the page on the game home. */
export async function enterGameUi(page: Page, gameName: string, password: string, displayName: string): Promise<void> {
    await page.goto('/');
    await page.getByLabel('Game').selectOption({ label: gameName });
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Display name').fill(displayName);
    await page.getByRole('button', { name: 'Enter game' }).click();
    // Wait for the post-login navigation so the player_session cookie is set before callers
    // (which may issue API requests on this context) proceed.
    await page.waitForURL(/\/game\//);
}

/** Best-effort cleanup: delete the given games and restore real time. */
export async function cleanup(page: Page, gameIds: number[]): Promise<void> {
    await authAdmin(page);
    for (const id of gameIds) {
        await page.request.delete(`/api/admin/games/${id}`);
    }
    await page.request.post('/api/admin/test/clock', { data: { mode: 'REALTIME' } });
}
