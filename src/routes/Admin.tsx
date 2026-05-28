/** Admin UI — login + tabs for games, results, and players. */

import { useEffect, useState } from 'react';
import { api, ApiError, type GameSummary, type TournamentData } from '../api-client';

type AdminTab = 'games' | 'results' | 'players';

export function Admin() {
    const [loggedIn, setLoggedIn] = useState<boolean | undefined>();

    useEffect(() => {
        api.adminWhoami()
            .then(() => setLoggedIn(true))
            .catch(() => setLoggedIn(false));
    }, []);

    if (loggedIn === undefined) {
        return (
            <main className="container">
                <p>Loading…</p>
            </main>
        );
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
            {tab === 'players' && <p>Player management coming soon. Use the admin DELETE endpoint directly for now.</p>}
        </>
    );
}

function AdminGames() {
    const [games, setGames] = useState<GameSummary[]>([]);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | undefined>();

    const reload = async () => {
        const r = await api.listGames();
        setGames(r.games);
    };

    useEffect(() => {
        reload().catch((err: unknown) => setError(err instanceof Error ? err.message : 'load failed'));
    }, []);

    const onCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(undefined);
        try {
            await api.adminCreateGame(name, password);
            setName('');
            setPassword('');
            await reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to create');
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
                {error && <div className="error">{error}</div>}
                <button type="submit">Create</button>
            </form>
        </>
    );
}

function AdminResults() {
    const [tournament, setTournament] = useState<TournamentData | undefined>();
    const [selectedPhase, setSelectedPhase] = useState<string>('GROUP');
    const [error, setError] = useState<string | undefined>();
    const [savingId, setSavingId] = useState<string | undefined>();
    const [drafts, setDrafts] = useState<Map<string, { home: number; away: number }>>(new Map());

    useEffect(() => {
        api.tournament()
            .then(setTournament)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'load failed'));
    }, []);

    const onSave = async (matchId: string) => {
        const draft = drafts.get(matchId);
        if (!draft) return;
        setSavingId(matchId);
        setError(undefined);
        try {
            await api.adminSetResult(matchId, draft);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to save');
        } finally {
            setSavingId(undefined);
        }
    };

    const phases = ['GROUP', 'R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];
    const filtered = (tournament?.matches ?? []).filter((m) => m.phase === selectedPhase);

    return (
        <>
            <h2>Results</h2>
            <label>
                Phase{' '}
                <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)}>
                    {phases.map((p) => (
                        <option key={p} value={p}>
                            {p}
                        </option>
                    ))}
                </select>
            </label>
            {error && <div className="error">{error}</div>}
            <ul>
                {filtered.map((m) => {
                    const draft = drafts.get(m.id) ?? { home: 0, away: 0 };

                    return (
                        <li key={m.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' }}>
                            <code>{m.id}</code>
                            <input
                                type="number"
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
