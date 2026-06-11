/** Admin UI — login + tabs for games, results, and players. */

import { useEffect, useState } from 'react';
import { PHASES } from '@shared/phases';
import { api, ApiError, type GameSummary, type TournamentData } from '../api-client';
import { Skeleton, useDelayedFlag } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { TeamSide } from '../components/Flag';
import { SaveButton } from '../components/SaveButton';
import { matchSides, type MatchSide } from '../lib/matchDisplay';
import type { FirstScorer, ResultSource } from '@shared/types';

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
            <AdminClock />
            {tab === 'games' && <AdminGames />}
            {tab === 'results' && <AdminResults />}
            {tab === 'players' && <AdminPlayers />}
        </>
    );
}

/**
 * Test-only clock control. Reads the current server clock on mount (so a refresh reflects a
 * fixed clock rather than falsely showing real time) and swaps it via `POST /api/admin/test/clock`.
 * The control is always editable; the endpoint is gated to `DEPLOYMENT_STAGE=TEST` server-side, so
 * outside a test deployment Apply elegantly surfaces a "not available" message.
 */
function AdminClock() {
    const { showToast } = useToast();
    const [mode, setMode] = useState<'REALTIME' | 'FIXED'>('REALTIME');
    const [localTime, setLocalTime] = useState('');
    const [applying, setApplying] = useState(false);

    useEffect(() => {
        api.adminGetClock()
            .then((clock) => {
                setMode(clock.mode);
                if (clock.iso) setLocalTime(isoToLocalInput(clock.iso));
            })
            .catch(() => undefined);
    }, []);

    const apply = async () => {
        if (mode === 'FIXED' && !localTime) {
            showToast('error', 'Pick a date and time first');

            return;
        }
        setApplying(true);
        try {
            if (mode === 'FIXED') {
                await api.adminSetClock({ mode: 'FIXED', iso: new Date(localTime).toISOString() });
                showToast('success', `Clock fixed to ${new Date(localTime).toLocaleString()}`);
            } else {
                await api.adminSetClock({ mode: 'REALTIME' });
                showToast('success', 'Clock set to real time');
            }
        } catch (err) {
            const message =
                err instanceof ApiError && err.status === 403
                    ? 'Clock control is only available on a test deployment.'
                    : err instanceof ApiError
                      ? err.message
                      : 'Failed to set clock';
            showToast('error', message);
        } finally {
            setApplying(false);
        }
    };

    return (
        <section className="clock-control">
            <strong>Test clock</strong>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'REALTIME' | 'FIXED')}>
                <option value="REALTIME">Real time</option>
                <option value="FIXED">Fixed time</option>
            </select>
            {mode === 'FIXED' && (
                <input type="datetime-local" value={localTime} onChange={(e) => setLocalTime(e.target.value)} />
            )}
            <button type="button" onClick={apply} disabled={applying}>
                {applying ? 'Applying…' : 'Apply'}
            </button>
        </section>
    );
}

/** Convert a UTC ISO timestamp to the `YYYY-MM-DDTHH:mm` local value a `datetime-local` input wants. */
function isoToLocalInput(iso: string): string {
    const date = new Date(iso);

    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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

    // Deleting a game cascade-removes its players and their predictions, so confirm first.
    const onDelete = async (game: GameSummary) => {
        if (!window.confirm(`Delete "${game.name}"? This removes its players and all their predictions.`)) {
            return;
        }
        try {
            await api.adminDeleteGame(game.id);
            await reload();
            showToast('success', 'Game deleted');
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Failed to delete');
        }
    };

    return (
        <>
            <h2>Games</h2>
            <ul>
                {games.map((g) => (
                    <li key={g.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' }}>
                        <span>
                            {g.name} (id {g.id})
                        </span>
                        <button type="button" className="secondary" onClick={() => onDelete(g)}>
                            Delete
                        </button>
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
    // Recorded scores as strings so an unrecorded match shows empty (not 0-0); seeded from saved
    // results and updated on save so a saved value survives switching phases away and back.
    type RecordedResult = { home: string; away: string; firstScorer: FirstScorer | null; source: ResultSource };
    const [scores, setScores] = useState<Map<string, RecordedResult>>(new Map());
    const [syncing, setSyncing] = useState(false);
    // Bumped after a manual sync so the result rows remount and re-seed from the refreshed scores.
    const [reloadKey, setReloadKey] = useState(0);

    const toScores = (results: Awaited<ReturnType<typeof api.adminListResults>>['results']) =>
        new Map(
            results.map((res) => [
                res.matchId,
                { home: String(res.home), away: String(res.away), firstScorer: res.firstScorer, source: res.source },
            ]),
        );

    useEffect(() => {
        Promise.all([api.tournament(), api.adminListResults()])
            .then(([t, r]) => {
                setTournament(t);
                setScores(toScores(r.results));
            })
            .catch((err: unknown) => showToast('error', err instanceof Error ? err.message : 'load failed'));
    }, []);

    const onRowSaved = (matchId: string, result: RecordedResult) => {
        setScores((prev) => new Map(prev).set(matchId, result));
    };

    const onSync = async () => {
        setSyncing(true);
        try {
            const { summary } = await api.adminSyncResults();
            const r = await api.adminListResults();
            setScores(toScores(r.results));
            setReloadKey((k) => k + 1);
            showToast('success', `Synced — ${summary.written} written, ${summary.skipped} skipped (${summary.processed} finished)`);
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const teams = tournament?.teams ?? [];
    const filtered = (tournament?.matches ?? []).filter((m) => m.phase === selectedPhase);

    return (
        <>
            <h2>Results</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                <button type="button" onClick={onSync} disabled={syncing} title="Pull finished results from the live feed now">
                    {syncing ? 'Syncing…' : 'Sync results now'}
                </button>
            </div>
            <ul>
                {filtered.map((m) => (
                    <ResultRow
                        key={`${m.id}-${reloadKey}`}
                        matchId={m.id}
                        sides={matchSides(m, teams)}
                        initial={scores.get(m.id)}
                        onSaved={onRowSaved}
                    />
                ))}
            </ul>
        </>
    );
}

/**
 * One Admin Results row. Records a match's 90-minute score. Mirrors the My-picks row UX: leaving
 * the row (vs. moving between its own inputs/button) auto-saves a complete, changed entry, the
 * Save button is out of the tab order, and a half-filled row still warns on save.
 */
function ResultRow({
    matchId,
    sides,
    initial,
    onSaved,
}: {
    matchId: string;
    sides: { home: MatchSide; away: MatchSide };
    initial: { home: string; away: string; firstScorer: FirstScorer | null; source: ResultSource } | undefined;
    onSaved: (matchId: string, result: { home: string; away: string; firstScorer: FirstScorer | null; source: ResultSource }) => void;
}) {
    const { showToast } = useToast();
    const [home, setHome] = useState(initial?.home ?? '');
    const [away, setAway] = useState(initial?.away ?? '');
    const [scorer, setScorer] = useState<FirstScorer | ''>(initial?.firstScorer ?? '');
    const [saved, setSaved] = useState(initial !== undefined);
    const [saving, setSaving] = useState(false);
    // Provenance of the recorded result (BL4): undefined until something is recorded. An admin save
    // always makes it MANUAL (and the server refuses to let the sync overwrite it thereafter).
    const [source, setSource] = useState<ResultSource | undefined>(initial?.source);

    // The first scorer is determined by the score except when both teams scored: a 0-0 is "no
    // goal", a one-sided result auto-picks the lone scorer (both locked), and only a both-scored
    // result lets the admin choose. `selectedScorer` is what's shown and saved.
    const bothFilled = home !== '' && away !== '';
    const h = Number(home);
    const a = Number(away);
    const goalless = bothFilled && h === 0 && a === 0;
    const onlyHome = bothFilled && h > 0 && a === 0;
    const onlyAway = bothFilled && h === 0 && a > 0;
    const bothScored = bothFilled && h > 0 && a > 0;
    const forcedScorer: FirstScorer | undefined = goalless ? 'NONE' : onlyHome ? 'HOME' : onlyAway ? 'AWAY' : undefined;
    const selectedScorer: FirstScorer | '' =
        forcedScorer ?? (bothScored && (scorer === 'HOME' || scorer === 'AWAY') ? scorer : '');

    const onSave = async () => {
        if (home === '' || away === '') {
            showToast('error', 'Enter both scores before saving.');

            return;
        }
        setSaving(true);
        try {
            const firstScorer = selectedScorer || undefined;
            await api.adminSetResult(matchId, { home: h, away: a }, firstScorer);
            setSaved(true);
            setSource('MANUAL');
            onSaved(matchId, { home, away, firstScorer: firstScorer ?? null, source: 'MANUAL' });
            showToast('success', `Saved ${matchId}`);
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const onChange = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        set(e.target.value);
        setSaved(false);
    };

    const onRowBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
        if ((e.relatedTarget as HTMLElement | null)?.getAttribute('data-match') === matchId) return;
        if (home === '' && away === '') return;
        if (saved) return;
        void onSave();
    };

    return (
        <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0' }}>
            <code>{matchId}</code>
            {source && (
                <span
                    className={`badge source-${source.toLowerCase()}`}
                    data-source={source}
                    title={source === 'AUTO' ? 'Auto-pulled from the results feed' : 'Entered by an admin'}
                >
                    {source}
                </span>
            )}
            <span style={{ flex: 1 }}>
                <TeamSide side={sides.home} /> vs <TeamSide side={sides.away} />
            </span>
            <input type="number" data-match={matchId} inputMode="numeric" min={0} max={20} value={home} onChange={onChange(setHome)} onBlur={onRowBlur} />
            <span>-</span>
            <input type="number" data-match={matchId} inputMode="numeric" min={0} max={20} value={away} onChange={onChange(setAway)} onBlur={onRowBlur} />
            <select
                aria-label="First to score"
                title={bothScored ? 'Pick who scored first' : 'Set automatically from the score'}
                data-match={matchId}
                value={selectedScorer}
                disabled={!bothScored}
                style={{ width: '8.5rem', flex: 'none' }}
                onChange={(e) => {
                    setScorer(e.target.value as FirstScorer | '');
                    setSaved(false);
                }}
                onBlur={onRowBlur}
            >
                {goalless ? (
                    <option value="NONE">No goal</option>
                ) : onlyHome ? (
                    <option value="HOME">{sides.home.name}</option>
                ) : onlyAway ? (
                    <option value="AWAY">{sides.away.name}</option>
                ) : bothScored ? (
                    <>
                        <option value="">1st: —</option>
                        <option value="HOME">{sides.home.name}</option>
                        <option value="AWAY">{sides.away.name}</option>
                    </>
                ) : (
                    <option value="">1st: —</option>
                )}
            </select>
            {/* Fixed width so "Save"/"Saving…"/"Saved ✓" can't reflow the score inputs' position. */}
            <SaveButton saving={saving} saved={saved} data-match={matchId} tabIndex={-1} onClick={onSave} style={{ width: '6rem', flex: 'none' }} />
        </li>
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
