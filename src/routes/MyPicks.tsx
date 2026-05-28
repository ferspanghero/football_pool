/** "My picks" tab — champion banner + upcoming match inputs + past matches with points. */

import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import { formatKickoff } from '@shared/time';
import type { GameContextValue } from './GameLayout';
import type { MatchId } from '@shared/types';

export function MyPicks() {
    const ctx = useOutletContext<GameContextValue>();
    const now = Date.now();
    const firstKickoff = Date.parse(ctx.tournament.firstKickoffUtc);
    const championLocked = now >= firstKickoff;
    const upcoming = ctx.tournament.matches.filter((m) => Date.parse(m.kickoffUtc) > now);
    const past = ctx.tournament.matches.filter((m) => Date.parse(m.kickoffUtc) <= now);
    const predictionByMatch = useMemo(
        () => new Map(ctx.me.predictions.map((p) => [p.matchId, p.score])),
        [ctx.me.predictions],
    );

    return (
        <>
            <ChampionBanner locked={championLocked} />
            <h2>Upcoming matches</h2>
            {upcoming.length === 0 && <p>No upcoming matches.</p>}
            {upcoming.slice(0, 30).map((m) => (
                <UpcomingMatchRow
                    key={m.id}
                    matchId={m.id}
                    label={matchLabel(m, ctx.tournament)}
                    kickoffUtc={m.kickoffUtc}
                    initial={predictionByMatch.get(m.id) ?? { home: 0, away: 0 }}
                    hasInitial={predictionByMatch.has(m.id)}
                />
            ))}
            <h2>Past matches</h2>
            {past.length === 0 && <p>No matches yet.</p>}
            <ul>
                {past.slice(-10).reverse().map((m) => {
                    const pred = predictionByMatch.get(m.id);

                    return (
                        <li key={m.id}>
                            {matchLabel(m, ctx.tournament)} · {formatKickoff(m.kickoffUtc)} ·{' '}
                            {pred ? `you: ${pred.home}-${pred.away}` : 'no pick'}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

function ChampionBanner({ locked }: { locked: boolean }) {
    const ctx = useOutletContext<GameContextValue>();
    const [teamId, setTeamId] = useState<string>(ctx.me.championTeamId ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const onSave = async () => {
        setSaving(true);
        setError(undefined);
        try {
            await api.saveChampion(teamId);
            await ctx.refresh();
        } catch (err) {
            setError(saveErrorMessage(err, 'Champion picks have locked (first kickoff passed). Refresh the page.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section style={{ background: 'var(--accent-soft)', padding: '0.75rem', borderRadius: 6, margin: '1rem 0' }}>
            <strong>Champion pick:</strong>{' '}
            {locked ? (
                <span>{ctx.me.championTeamId ?? 'no pick'} (locked)</span>
            ) : (
                <>
                    <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                        <option value="">— pick one —</option>
                        {ctx.tournament.teams.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>{' '}
                    <button type="button" onClick={onSave} disabled={saving || !teamId}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </>
            )}
            {error && <div className="error">{error}</div>}
        </section>
    );
}

function UpcomingMatchRow({
    matchId,
    label,
    kickoffUtc,
    initial,
    hasInitial,
}: {
    matchId: MatchId;
    label: string;
    kickoffUtc: string;
    initial: { home: number; away: number };
    hasInitial: boolean;
}) {
    const [home, setHome] = useState(initial.home);
    const [away, setAway] = useState(initial.away);
    const [saved, setSaved] = useState(hasInitial);
    const [error, setError] = useState<string | undefined>();
    const [saving, setSaving] = useState(false);

    const onSave = async () => {
        setSaving(true);
        setError(undefined);
        try {
            await api.savePrediction(matchId, { home, away });
            setSaved(true);
        } catch (err) {
            setError(saveErrorMessage(err, 'This match has locked (kickoff passed). Refresh the page to see the latest.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="match-row">
            <span>{label}</span>
            <span className="score">
                <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={20}
                    value={home}
                    onChange={(e) => {
                        setHome(Number(e.target.value));
                        setSaved(false);
                    }}
                />
                <span>-</span>
                <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={20}
                    value={away}
                    onChange={(e) => {
                        setAway(Number(e.target.value));
                        setSaved(false);
                    }}
                />
            </span>
            <span>
                <button type="button" onClick={onSave} disabled={saving}>
                    {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
                </button>
            </span>
            <time>{formatKickoff(kickoffUtc)}</time>
            {error && (
                <div className="error" style={{ gridColumn: '1 / -1' }}>
                    {error}
                </div>
            )}
        </div>
    );
}

/**
 * Message to show when a save fails. A 403 means the server clock has passed the lock
 * point (the player's page is stale), so we steer them to refresh rather than surface the
 * raw server message; any other failure shows its message verbatim.
 */
function saveErrorMessage(err: unknown, lockedHint: string): string {
    if (err instanceof ApiError && err.status === 403) return lockedHint;

    return err instanceof ApiError ? err.message : 'Failed to save';
}

function matchLabel(m: { phase: string; homeTeamId?: string; awayTeamId?: string }, tournament: GameContextValue['tournament']): string {
    const teamName = (id?: string) => tournament.teams.find((t) => t.id === id)?.name ?? '?';
    if (m.phase === 'GROUP' && 'homeTeamId' in m) {
        return `${teamName(m.homeTeamId)} vs ${teamName(m.awayTeamId)}`;
    }
    return m.phase;
}
