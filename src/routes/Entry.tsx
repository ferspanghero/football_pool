/** Game-select / login screen at `/`. */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type GameSummary, type MePayload } from '../api-client';
import { ThemeToggle } from '../components/ThemeToggle';

export function Entry() {
    const navigate = useNavigate();
    const [games, setGames] = useState<GameSummary[]>([]);
    const [resume, setResume] = useState<MePayload | undefined>();
    const [selectedGameId, setSelectedGameId] = useState<string>('');
    const [displayName, setDisplayName] = useState('');
    const [playerPassword, setPlayerPassword] = useState('');
    const [gamePassword, setGamePassword] = useState('');
    const [error, setError] = useState<string | undefined>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.listGames()
            .then((r) => {
                setGames(r.games);
                if (r.games[0]) setSelectedGameId(String(r.games[0].id));
            })
            .catch((err: unknown) => setError(errMessage(err)));
        // A valid cookie means we can offer one-tap resume without re-typing anything.
        api.me()
            .then(setResume)
            .catch(() => setResume(undefined));
    }, []);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(undefined);
        setSubmitting(true);
        try {
            const gameId = Number.parseInt(selectedGameId, 10);
            await api.enterGame(gameId, { displayName, playerPassword, gamePassword: gamePassword || undefined });
            navigate(`/game/${gameId}`);
        } catch (err: unknown) {
            setError(errMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const resumeGameName = resume && games.find((g) => g.id === resume.gameId)?.name;

    return (
        <main className="container">
            <div className="entry-top">
                <h1>FIFA 2026 Pool</h1>
                <ThemeToggle />
            </div>

            {resume && (
                <section className="resume-card">
                    <span>
                        Welcome back, <strong>{resume.displayName}</strong>
                        {resumeGameName ? ` — ${resumeGameName}` : ''}
                    </span>
                    <button type="button" onClick={() => navigate(`/game/${resume.gameId}`)}>
                        Continue
                    </button>
                </section>
            )}

            {games.length === 0 && !error ? (
                <p>No games yet. Ask the admin to create one.</p>
            ) : (
                <form className="stack" onSubmit={onSubmit}>
                    <label>
                        Game
                        <select aria-label="Game" value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required>
                            {games.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Display name
                        <input
                            type="text"
                            autoComplete="username"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            maxLength={40}
                            required
                        />
                    </label>
                    <label>
                        Your password
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={playerPassword}
                            onChange={(e) => setPlayerPassword(e.target.value)}
                            required
                        />
                    </label>
                    <label>
                        Game password
                        <input
                            type="password"
                            autoComplete="off"
                            value={gamePassword}
                            onChange={(e) => setGamePassword(e.target.value)}
                        />
                    </label>
                    <small className="hint">Game password is only needed the first time you join a game.</small>
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
