/** Layout for `/game/:gameId` — header tabs + outlet for child routes. */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type MePayload, type TournamentData } from '../api-client';

export type GameContextValue = {
    me: MePayload;
    tournament: TournamentData;
    refresh: () => Promise<void>;
};

export function GameLayout() {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const [me, setMe] = useState<MePayload | undefined>();
    const [tournament, setTournament] = useState<TournamentData | undefined>();
    const [error, setError] = useState<string | undefined>();

    const load = async () => {
        try {
            const [meRes, tour] = await Promise.all([api.me(), api.tournament()]);
            setMe(meRes);
            setTournament(tour);
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
    if (!me || !tournament) {
        return (
            <main className="container">
                <p>Loading…</p>
            </main>
        );
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
                <Outlet context={{ me, tournament, refresh: load }} />
            </main>
        </>
    );
}
