/** Layout for `/game/:gameId` — header tabs + outlet for child routes. */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type MePayload, type TournamentData } from '../api-client';
import { Skeleton, useDelayedFlag } from '../components/Skeleton';
import type { FirstScorer, MatchId, Score } from '@shared/types';

/** Recorded results keyed by match id — the score and (if recorded) who scored first. */
export type RecordedResults = Map<MatchId, { score: Score; firstScorer: FirstScorer | undefined }>;

export type GameContextValue = {
    me: MePayload;
    tournament: TournamentData;
    results: RecordedResults;
    refresh: () => Promise<void>;
};

export function GameLayout() {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const [me, setMe] = useState<MePayload | undefined>();
    const [tournament, setTournament] = useState<TournamentData | undefined>();
    const [results, setResults] = useState<RecordedResults>(new Map());
    const [error, setError] = useState<string | undefined>();

    const load = async () => {
        try {
            const [meRes, tour, res] = await Promise.all([api.me(), api.tournament(), api.results()]);
            setMe(meRes);
            setTournament(tour);
            setResults(
                new Map(
                    res.results.map((r) => [r.matchId, { score: { home: r.home, away: r.away }, firstScorer: r.firstScorer ?? undefined }]),
                ),
            );
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                navigate('/');
                return;
            }
            setError(err instanceof Error ? err.message : 'Failed to load');
        }
    };

    useEffect(() => {
        load();
    }, [gameId]);

    const loading = !me || !tournament;
    const showSkeleton = useDelayedFlag(loading, 300);

    const onLogout = async () => {
        await api.logout();
        navigate('/');
    };

    if (error) {
        return (
            <main className="container">
                <div className="error">{error}</div>
            </main>
        );
    }
    if (loading) {
        return <main className="container">{showSkeleton ? <Skeleton lines={5} /> : null}</main>;
    }
    const base = `/game/${gameId}`;

    return (
        <>
            <header className="app-header">
                <div className="container">
                    <strong>{me.displayName}</strong>
                    <nav className="tabs">
                        <NavLink to={base} end className={({ isActive }) => (isActive ? 'active' : '')}>
                            My picks
                        </NavLink>
                        <NavLink to={`${base}/groups`} className={({ isActive }) => (isActive ? 'active' : '')}>
                            Groups
                        </NavLink>
                        <NavLink to={`${base}/knockouts`} className={({ isActive }) => (isActive ? 'active' : '')}>
                            Knockouts
                        </NavLink>
                        <NavLink to={`${base}/leaderboard`} className={({ isActive }) => (isActive ? 'active' : '')}>
                            Leaderboard
                        </NavLink>
                    </nav>
                    <button className="secondary" onClick={onLogout} type="button">
                        Switch game
                    </button>
                </div>
            </header>
            <main className="container">
                <Outlet context={{ me, tournament, results, refresh: load }} />
            </main>
        </>
    );
}
