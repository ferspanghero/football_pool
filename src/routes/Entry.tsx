/** Game-select / login screen at `/`. */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type GameSummary } from '../api-client';

export function Entry() {
    const navigate = useNavigate();
    const [games, setGames] = useState<GameSummary[]>([]);
    const [selectedGameId, setSelectedGameId] = useState<string>('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState<string | undefined>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.listGames()
            .then((r) => {
                setGames(r.games);
                if (r.games[0]) setSelectedGameId(String(r.games[0].id));
            })
            .catch((err: unknown) => setError(errMessage(err)));
    }, []);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(undefined);
        setSubmitting(true);
        try {
            const gameId = Number.parseInt(selectedGameId, 10);
            await api.enterGame(gameId, password, displayName);
            navigate(`/game/${gameId}`);
        } catch (err: unknown) {
            setError(errMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="container">
            <h1>FIFA 2026 Pool</h1>
            {games.length === 0 && !error ? (
                <p>No games yet. Ask the admin to create one.</p>
            ) : (
                <form className="stack" onSubmit={onSubmit}>
                    <label>
                        Game
                        <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required>
                            {games.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Password
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </label>
                    <label>
                        Display name
                        <input
                            type="text"
                            autoComplete="nickname"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            maxLength={40}
                            required
                        />
                    </label>
                    {error && <div className="error">{error}</div>}
                    <button type="submit" disabled={submitting}>
                        {submitting ? 'Entering…' : 'Enter game'}
                    </button>
                </form>
            )}
            <p style={{ marginTop: '2rem' }}>
                <a href="/admin">Admin →</a>
            </p>
        </main>
    );
}

function errMessage(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return 'Something went wrong';
}
