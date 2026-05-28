/** Admin UI — login + tabs for games, results, and players. */

import { useEffect, useState } from 'react';
import { PHASES } from '@shared/phases';
import { api, ApiError, type GameSummary, type TournamentData } from '../api-client';
import { Skeleton, useDelayedFlag } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { TeamSide } from '../components/Flag';
import { matchSides } from '../lib/matchDisplay';

type AdminTab = 'games' | 'results' | 'players';

export function Admin() {
    const [loggedIn, setLoggedIn] = useState<boolean | undefined>();

    useEffect(() => {
        api.adminWhoami()
            .then(() => setLoggedIn(true))
            .catch(() => setLoggedIn(false));
    }, []);

    const showSkeleton = useDelayedFlag(loggedIn === undefined, 300);

    if (loggedIn === undefined) {
        return <main className="container">{showSkeleton ? <Skeleton lines={3} /> : null}</main>;
    }

    return (
        <main className="container">
            <h1>Admin</h1>
            {loggedIn ? <AdminPanel onLogout={() => setLoggedIn(false)} /> : <AdminLogin onSuccess={() => setLoggedIn(true)} />}
            <p style={{ marginTop: '2rem' }}>
                <a href="/">← Back</a>
            </p>
        </main>
    );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(undefined);
        try {
            await api.adminLogin(password);
            onSuccess();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to log in');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="stack" onSubmit={onSubmit}>
            <label>
                Admin password
                <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
            </label>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={submitting}>
                {submitting ? 'Logging in…' : 'Log in'}
            </button>
        </form>
    );
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
    const [tab, setTab] = useState<AdminTab>('games');

    const doLogout = async () => {
        await api.adminLogout();
        onLogout();
    };

    return (
        <>
            <nav className="tabs">
                <a className={tab === 'games' ? 'active' : ''} onClick={() => setTab('games')} href="#games">
                    Games
                </a>
                <a className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')} href="#results">
                    Results
                </a>
                <a className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')} href="#players">
                    Players
                </a>
                <button className="secondary" type="button" onClick={doLogout}>
                    Log out
                </button>
            </nav>
            {tab === 'games' && <AdminGames />}
            {tab === 'results' && <AdminResults />}
            {tab === 'players' && <AdminPlayers />}
        </>
    );
}

function AdminGames() {
    const { showToast } = useToast();
    const [games, setGames] = useState<GameSummary[]>([]);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');

    const reload = async () => {
        const r = await api.listGames();
        setGames(r.games);
    };

    useEffect(() => {
        reload().catch((err: unknown) => showToast('error', err instanceof Error ? err.message : 'load failed'));
    }, []);

    const onCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.adminCreateGame(name, password);
            setName('');
            setPassword('');
            await reload();
            showToast('success', 'Game created');
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Failed to create');
        }
    };

    return (
        <>
            <h2>Games</h2>
            <ul>
                {games.map((g) => (
                    <li key={g.id}>
                        {g.name} (id {g.id})
                    </li>
                ))}
            </ul>
            <h3>Create new game</h3>
            <form className="stack" onSubmit={onCreate}>
                <label>
                    Name
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
                </label>
                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </label>
                <button type="submit">Create</button>
            </form>
        </>
    );
}

function AdminResults() {
    const { showToast } = useToast();
    const [tournament, setTournament] = useState<TournamentData | undefined>();
    const [selectedPhase, setSelectedPhase] = useState<string>('GROUP_R1');
    const [savingId, setSavingId] = useState<string | undefined>();
    const [drafts, setDrafts] = useState<Map<string, { home: number; away: number }>>(new Map());

    useEffect(() => {
        api.tournament()
            .then(setTournament)
            .catch((err: unknown) => showToast('error', err instanceof Error ? err.message : 'load failed'));
    }, []);

    const onSave = async (matchId: string) => {
        const draft = drafts.get(matchId);
        if (!draft) return;
        setSavingId(matchId);
        try {
            await api.adminSetResult(matchId, draft);
            showToast('success', `Saved ${matchId}`);
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Failed to save');
        } finally {
            setSavingId(undefined);
        }
    };

    const teams = tournament?.teams ?? [];
    const filtered = (tournament?.matches ?? []).filter((m) => m.phase === selectedPhase);

    return (
        <>
            <h2>Results</h2>
            <label>
                Phase{' '}
                <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)}>
                    {PHASES.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </label>
            <ul>
                {filtered.map((m) => {
                    const draft = drafts.get(m.id) ?? { home: 0, away: 0 };
                    const sides = matchSides(m, teams);

                    return (
                        <li key={m.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' }}>
                            <code>{m.id}</code>
                            <span style={{ flex: 1 }}>
                                <TeamSide side={sides.home} /> vs <TeamSide side={sides.away} />
                            </span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={20}
                                value={draft.home}
                                onChange={(e) => {
                                    const next = new Map(drafts);
                                    next.set(m.id, { home: Number(e.target.value), away: draft.away });
                                    setDrafts(next);
                                }}
                            />
                            <span>-</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={20}
                                value={draft.away}
                                onChange={(e) => {
                                    const next = new Map(drafts);
                                    next.set(m.id, { home: draft.home, away: Number(e.target.value) });
                                    setDrafts(next);
                                }}
                            />
                            <button type="button" onClick={() => onSave(m.id)} disabled={savingId === m.id}>
                                {savingId === m.id ? 'Saving…' : 'Save'}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

function AdminPlayers() {
    const { showToast } = useToast();
    const [games, setGames] = useState<GameSummary[]>([]);
    const [selectedGameId, setSelectedGameId] = useState<string>('');
    const [players, setPlayers] = useState<Array<{ id: number; displayName: string }>>([]);

    useEffect(() => {
        api.listGames()
            .then((r) => {
                setGames(r.games);
                if (r.games[0]) setSelectedGameId(String(r.games[0].id));
            })
            .catch((err: unknown) => showToast('error', err instanceof Error ? err.message : 'load failed'));
    }, []);

    const loadPlayers = async (gameId: number) => {
        const r = await api.adminListPlayers(gameId);
        setPlayers(r.players);
    };

    useEffect(() => {
        if (!selectedGameId) return;
        loadPlayers(Number.parseInt(selectedGameId, 10)).catch((err: unknown) =>
            showToast('error', err instanceof Error ? err.message : 'load failed'),
        );
    }, [selectedGameId]);

    const onDelete = async (playerId: number) => {
        try {
            await api.adminDeletePlayer(playerId);
            await loadPlayers(Number.parseInt(selectedGameId, 10));
            showToast('success', 'Player removed');
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Failed to delete');
        }
    };

    return (
        <>
            <h2>Players</h2>
            {games.length === 0 ? (
                <p>No games yet.</p>
            ) : (
                <label>
                    Game{' '}
                    <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)}>
                        {games.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {selectedGameId && players.length === 0 && <p>No players in this game yet.</p>}
            <ul>
                {players.map((p) => (
                    <li key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' }}>
                        <span>{p.displayName}</span>
                        <button type="button" className="secondary" onClick={() => onDelete(p.id)}>
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
}
