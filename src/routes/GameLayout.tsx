/** Layout for `/game/:gameId` — header tabs + outlet for child routes. */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type MePayload, type TournamentData } from '../api-client';
import { Skeleton, useDelayedFlag } from '../components/Skeleton';
import { ThemeToggle } from '../components/ThemeToggle';
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
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [me, setMe] = useState<MePayload | undefined>();
    const [tournament, setTournament] = useState<TournamentData | undefined>();
    const [results, setResults] = useState<RecordedResults>(new Map());
    const [error, setError] = useState<string | undefined>();

    // `shouldApply` lets the navigation effect discard a slow in-flight response once a newer
    // navigation has superseded it, so the latest tab's data wins rather than the last to resolve.
    const load = async (shouldApply: () => boolean = () => true) => {
        try {
            const [meRes, tour, res] = await Promise.all([api.me(), api.tournament(), api.results()]);
            if (!shouldApply()) return;
            setMe(meRes);
            setTournament(tour);
            setResults(
                new Map(
                    res.results.map((r) => [r.matchId, { score: { home: r.home, away: r.away }, firstScorer: r.firstScorer ?? undefined }]),
                ),
            );
        } catch (err) {
            if (!shouldApply()) return;
            if (err instanceof ApiError && err.status === 401) {
                navigate('/');
                return;
            }
            setError(err instanceof Error ? err.message : 'Failed to load');
        }
    };

    // Re-fetch on every tab navigation (pathname change), not just when the game changes, so
    // switching tabs shows fresh picks/results/standings without a manual browser reload. State is
    // not cleared first, so an in-place refresh causes no skeleton flash. The `active` flag drops a
    // stale response if the user navigates again before it resolves.
    useEffect(() => {
        let active = true;
        load(() => active);
        return () => {
            active = false;
        };
    }, [gameId, pathname]);

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
                        <NavLink to={`${base}/connect`} className={({ isActive }) => (isActive ? 'active' : '')}>
                            Connect LLM
                        </NavLink>
                    </nav>
                    <ThemeToggle />
                    <button className="secondary" onClick={onLogout} type="button">
                        Switch game
                    </button>
                </div>
            </header>
            <main className="container">
                <Outlet context={{ me, tournament, results, refresh: () => load() }} />
            </main>
        </>
    );
}
