/**
 * Typed wrapper around the Worker API. Every method returns a Promise that resolves on
 * 2xx and rejects with an `ApiError` carrying the server's `{ code, message }` envelope.
 */

import type { LeaderboardRow, Match, MatchId, Score, Team, TeamId } from '@shared/types';

export type ErrorCode =
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION'
    | 'RATE_LIMITED'
    | 'INTERNAL';

/** Thrown by every `api.*` call on a non-2xx response. */
export class ApiError extends Error {
    constructor(
        public readonly code: ErrorCode | 'UNKNOWN',
        message: string,
        public readonly status: number,
    ) {
        super(message);
    }
}

export type GameSummary = { id: number; name: string };
export type TournamentData = { teams: Team[]; matches: Match[]; firstKickoffUtc: string };
export type MePayload = {
    playerId: number;
    gameId: number;
    displayName: string;
    championTeamId: TeamId | null;
    predictions: Array<{ playerId: number; matchId: MatchId; score: Score; updatedAt: number }>;
    /** Server clock (epoch ms) at fetch time — used to lock the UI against authoritative time. */
    nowMs: number;
};
export type MatchPredictionsPayload = {
    predictions: Array<{ playerId: number; displayName: string; score: Score }>;
    result: Score | null;
};

export const api = {
    listGames: () => request<{ games: GameSummary[] }>('/api/games'),
    tournament: () => request<TournamentData>('/api/tournament'),
    enterGame: (
        gameId: number,
        body: { displayName: string; playerPassword: string; gamePassword?: string | undefined },
    ) =>
        request<{ playerId: number; gameId: number; displayName: string }>(
            `/api/games/${gameId}/enter`,
            { method: 'POST', body },
        ),
    logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
    me: () => request<MePayload>('/api/me'),
    savePrediction: (matchId: MatchId, score: Score) =>
        request<{ ok: true }>(`/api/me/predictions/${matchId}`, {
            method: 'PUT',
            body: { homeGoals: score.home, awayGoals: score.away },
        }),
    saveChampion: (teamId: TeamId) =>
        request<{ ok: true }>('/api/me/champion', { method: 'PUT', body: { teamId } }),
    leaderboard: (gameId: number) => request<{ rows: LeaderboardRow[] }>(`/api/games/${gameId}/leaderboard`),
    matchPredictions: (gameId: number, matchId: MatchId) =>
        request<MatchPredictionsPayload>(`/api/games/${gameId}/predictions/${matchId}`),
    adminLogin: (password: string) =>
        request<{ ok: true }>('/api/admin/login', { method: 'POST', body: { password } }),
    adminWhoami: () => request<{ admin: true }>('/api/admin/whoami'),
    adminLogout: () => request<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
    adminCreateGame: (name: string, password: string) =>
        request<{ game: GameSummary }>('/api/admin/games', { method: 'POST', body: { name, password } }),
    adminDeleteGame: (gameId: number) =>
        request<{ ok: true }>(`/api/admin/games/${gameId}`, { method: 'DELETE' }),
    adminSetResult: (matchId: MatchId, score: Score) =>
        request<{ ok: true }>(`/api/admin/results/${matchId}`, {
            method: 'PUT',
            body: { homeGoals: score.home, awayGoals: score.away },
        }),
    adminListResults: () =>
        request<{ results: Array<{ matchId: MatchId; home: number; away: number }> }>('/api/admin/results'),
    adminDeletePlayer: (playerId: number) =>
        request<{ ok: true }>(`/api/admin/players/${playerId}`, { method: 'DELETE' }),
    adminListPlayers: (gameId: number) =>
        request<{ players: Array<{ id: number; displayName: string; championTeamId: TeamId | null }> }>(
            `/api/admin/games/${gameId}/players`,
        ),
    adminSetClock: (body: { mode: 'REALTIME' } | { mode: 'FIXED'; iso: string }) =>
        request<{ mode: string; iso?: string }>('/api/admin/test/clock', { method: 'POST', body }),
    adminGetClock: () =>
        request<{ mode: 'REALTIME' | 'FIXED'; iso: string | null; nowMs: number }>('/api/admin/test/clock'),
};

type RequestOptions = { method?: string; body?: unknown };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const init: RequestInit = {
        method: options.method ?? 'GET',
        credentials: 'include',
    };
    if (options.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(options.body);
    }
    const res = await fetch(path, init);
    const text = await res.text();
    const body = text ? safeJson(text) : undefined;
    if (!res.ok) {
        const err = (body as { error?: { code?: string; message?: string } })?.error;
        const code = (err?.code as ErrorCode | undefined) ?? 'UNKNOWN';
        const message = err?.message ?? `HTTP ${res.status}`;
        throw new ApiError(code, message, res.status);
    }

    return body as T;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}
