import { describe, test, expect, vi, afterEach } from 'vitest';
import { buildApp } from '@api/app';
import type { AppEnv } from '@api/types';

const SECRET = 'test-secret-32-chars-12345678901234';
// Embedded in the thrown error to prove the underlying detail never reaches the client body.
const SENSITIVE = 'SECRET-SQL-PARAM-should-never-reach-the-client';

/** A DB whose every prepared statement throws — forces an *uncaught* error through the leaderboard
 *  read (which does not wrap its repo calls), so the throw reaches `app.onError`. */
function throwingEnv(thrown: unknown): AppEnv['Bindings'] {
    return {
        DB: { prepare: () => { throw thrown; } } as unknown as D1Database,
        SESSION_SECRET: SECRET,
        ADMIN_PASSWORD_HASH: 'unused',
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('app.onError', () => {
    test('an uncaught route error returns the standard 500 INTERNAL envelope', async () => {
        // Arrange
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = buildApp();

        // Act
        const res = await app.request('/api/games/1/leaderboard', {}, throwingEnv(new Error(`boom: ${SENSITIVE}`)));
        const body = (await res.json()) as { error?: { code?: string; message?: string } };

        // Assert — normalized envelope the SPA can parse, generic INTERNAL code
        expect(res.status).toBe(500);
        expect(body.error?.code).toBe('INTERNAL');
        expect(body.error?.message).toBe('internal error');
    });

    test('the 500 body never leaks the underlying error detail', async () => {
        // Arrange
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = buildApp();

        // Act
        const res = await app.request('/api/games/1/leaderboard', {}, throwingEnv(new Error(`boom: ${SENSITIVE}`)));
        const text = await res.text();

        // Assert — the thrown message (and its secret payload) stays server-side only
        expect(text).not.toContain(SENSITIVE);
        expect(text).not.toContain('boom');
    });

    test('the failure is logged once, server-side, with request context', async () => {
        // Arrange
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = buildApp();

        // Act
        await app.request('/api/games/1/leaderboard', {}, throwingEnv(new Error('db down')));

        // Assert — exactly one structured error line carrying method + path
        expect(spy).toHaveBeenCalledTimes(1);
        const line = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>;
        expect(line.level).toBe('error');
        expect(line.method).toBe('GET');
        expect(line.path).toBe('/api/games/1/leaderboard');
    });
});
