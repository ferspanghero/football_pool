/**
 * "My picks" tab — the prediction surface. A pinned champion banner, then one phase at a time
 * (◀ ▶ navigation, defaulting to the current phase), with that phase's matches laid out in
 * per-day cards. Open matches show score inputs; matches whose kickoff has passed are read-only.
 */

import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import { buildPhaseGroups, currentPhaseIndex, isGroupMatch } from '@shared/phases';
import { formatKickoffDate, formatKickoffTime } from '@shared/time';
import { matchSides } from '../lib/matchDisplay';
import type { GameContextValue } from './GameLayout';
import type { Match, MatchId, Score } from '@shared/types';

export function MyPicks() {
    const ctx = useOutletContext<GameContextValue>();
    const now = Date.now();
    const phaseGroups = useMemo(() => buildPhaseGroups(ctx.tournament.matches), [ctx.tournament.matches]);
    const [phaseIdx, setPhaseIdx] = useState(() => currentPhaseIndex(phaseGroups, Date.now()));
    const predictionByMatch = useMemo(
        () => new Map(ctx.me.predictions.map((p) => [p.matchId, p.score])),
        [ctx.me.predictions],
    );
    const championLocked = now >= Date.parse(ctx.tournament.firstKickoffUtc);
    const group = phaseGroups[phaseIdx];

    return (
        <>
            <ChampionBanner locked={championLocked} />

            <div className="phase-nav">
                <button
                    type="button"
                    className="secondary"
                    onClick={() => setPhaseIdx((i) => i - 1)}
                    disabled={phaseIdx <= 0}
                    aria-label="Previous phase"
                >
                    ‹
                </button>
                <h2>{group?.phase.label ?? 'No matches'}</h2>
                <button
                    type="button"
                    className="secondary"
                    onClick={() => setPhaseIdx((i) => i + 1)}
                    disabled={phaseIdx >= phaseGroups.length - 1}
                    aria-label="Next phase"
                >
                    ›
                </button>
            </div>

            {group?.matches &&
                groupByDay(group.matches).map(({ date, matches }) => (
                    <section key={date} className="day-card">
                        <h3>{date}</h3>
                        <div className="picks-grid">
                            {matches.map((m) => {
                                const sides = matchSides(m, ctx.tournament.teams);
                                const prefix = isGroupMatch(m) ? `Group ${m.group}` : '';
                                const time = formatKickoffTime(m.kickoffUtc);
                                const pick = predictionByMatch.get(m.id);

                                return Date.parse(m.kickoffUtc) <= now ? (
                                    <LockedRow key={m.id} prefix={prefix} home={sides.home} away={sides.away} pick={pick} time={time} />
                                ) : (
                                    <OpenRow key={m.id} matchId={m.id} prefix={prefix} home={sides.home} away={sides.away} pick={pick} time={time} />
                                );
                            })}
                        </div>
                    </section>
                ))}
        </>
    );
}

/** Group a phase's (kickoff-sorted) matches into day buckets, preserving chronological order. */
function groupByDay(matches: ReadonlyArray<Match>): { date: string; matches: Match[] }[] {
    const order: string[] = [];
    const byDate = new Map<string, Match[]>();
    for (const m of matches) {
        const date = formatKickoffDate(m.kickoffUtc);
        const list = byDate.get(date);
        if (list) {
            list.push(m);
        } else {
            byDate.set(date, [m]);
            order.push(date);
        }
    }

    return order.map((date) => ({ date, matches: byDate.get(date)! }));
}

type RowProps = { prefix: string; home: string; away: string; pick: Score | undefined; time: string };

/** A read-only match row (kickoff has passed): shows the saved pick and a "locked" badge. */
function LockedRow({ prefix, home, away, pick, time }: RowProps) {
    return (
        <>
            <span className="pick-status">
                <span className="badge locked">locked</span>
            </span>
            <span className="pick-prefix">{prefix}</span>
            <span className="pick-team home">{home}</span>
            <span className="pick-val">{pick ? pick.home : '–'}</span>
            <span className="pick-dash">-</span>
            <span className="pick-val">{pick ? pick.away : '–'}</span>
            <span className="pick-team away">{away}</span>
            <span className="pick-action" />
            <time className="pick-time">{time}</time>
        </>
    );
}

/** An editable match row (still open): score inputs, a Save button, and an "open" badge. */
function OpenRow({ matchId, prefix, home, away, pick, time }: RowProps & { matchId: MatchId }) {
    const [homeGoals, setHomeGoals] = useState(pick?.home ?? 0);
    const [awayGoals, setAwayGoals] = useState(pick?.away ?? 0);
    const [saved, setSaved] = useState(pick !== undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const onSave = async () => {
        setSaving(true);
        setError(undefined);
        try {
            await api.savePrediction(matchId, { home: homeGoals, away: awayGoals });
            setSaved(true);
        } catch (err) {
            setError(saveErrorMessage(err, 'This match has locked (kickoff passed). Refresh the page to see the latest.'));
        } finally {
            setSaving(false);
        }
    };

    const onChange = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        set(Number(e.target.value));
        setSaved(false);
    };

    return (
        <>
            <span className="pick-status">
                <span className="badge">open</span>
            </span>
            <span className="pick-prefix">{prefix}</span>
            <span className="pick-team home">{home}</span>
            <input className="pick-input" data-match={matchId} type="number" inputMode="numeric" min={0} max={20} value={homeGoals} onChange={onChange(setHomeGoals)} />
            <span className="pick-dash">-</span>
            <input className="pick-input" data-match={matchId} type="number" inputMode="numeric" min={0} max={20} value={awayGoals} onChange={onChange(setAwayGoals)} />
            <span className="pick-team away">{away}</span>
            <span className="pick-action">
                <button type="button" data-match={matchId} onClick={onSave} disabled={saving}>
                    {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
                </button>
            </span>
            <time className="pick-time">{time}</time>
            {error && <div className="pick-error">{error}</div>}
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

/**
 * Message to show when a save fails. A 403 means the server clock has passed the lock point
 * (the player's page is stale), so we steer them to refresh rather than surface the raw server
 * message; any other failure shows its message verbatim.
 */
function saveErrorMessage(err: unknown, lockedHint: string): string {
    if (err instanceof ApiError && err.status === 403) return lockedHint;

    return err instanceof ApiError ? err.message : 'Failed to save';
}
