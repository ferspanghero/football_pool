/**
 * "My picks" tab — the prediction surface. A pinned champion banner, then one phase at a time
 * (◀ ▶ navigation, defaulting to the current phase), with that phase's matches laid out in
 * per-day cards. Open matches show score inputs; matches whose kickoff has passed are read-only.
 */

import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import { scorePrediction } from '@shared/scoring';
import { buildPhaseGroups, currentPhaseIndex, hasResolvedTeams, isGroupMatch, phaseFirstKickoffUtc } from '@shared/phases';
import { formatKickoffDate, formatKickoffTime } from '@shared/time';
import { flagEmoji } from '@data/flags';
import { matchSides, type MatchSide } from '../lib/matchDisplay';
import { TeamSide } from '../components/Flag';
import type { GameContextValue } from './GameLayout';
import type { FirstScorer, Match, MatchId, PhaseId, Score } from '@shared/types';

export function MyPicks() {
    const ctx = useOutletContext<GameContextValue>();
    const now = ctx.me.nowMs;
    const phaseGroups = useMemo(() => buildPhaseGroups(ctx.tournament.matches), [ctx.tournament.matches]);
    const [phaseIdx, setPhaseIdx] = useState(() => currentPhaseIndex(phaseGroups, ctx.me.nowMs));
    const predictionByMatch = useMemo(
        () => new Map(ctx.me.predictions.map((p) => [p.matchId, p])),
        [ctx.me.predictions],
    );
    const championLocked = now >= Date.parse(ctx.tournament.firstKickoffUtc);
    const group = phaseGroups[phaseIdx];

    // BL7 boost: one match per phase, doubling its points; it locks at the phase's first kickoff.
    const phaseFirstKick = group ? phaseFirstKickoffUtc(group.matches, group.phase.id) : undefined;
    const boostLocked = phaseFirstKick !== undefined && now >= Date.parse(phaseFirstKick);
    const boostedMatchId = group && ctx.me.boosts.find((b) => b.phaseId === group.phase.id)?.matchId;

    // Pick the row variant for a match: TBD (unresolved knockout) → read-only locked (kickoff
    // passed) → editable open. Each is wrapped in a `.pick-row` by the caller.
    const renderRow = (m: Match) => {
        const sides = matchSides(m, ctx.tournament.teams);
        const prefix = isGroupMatch(m) ? `Group ${m.group}` : '';
        const time = formatKickoffTime(m.kickoffUtc);
        const pred = predictionByMatch.get(m.id);
        const result = ctx.results.get(m.id);
        const common = { prefix, home: sides.home, away: sides.away, pick: pred?.score, firstScorer: pred?.firstScorer, time };

        if (!hasResolvedTeams(m, ctx.tournament.teams)) {
            return <LockedRow {...common} tbd />;
        }

        // Locked once kickoff passes. The result (when recorded) drives the per-row feedback; in
        // real play it only exists after kickoff, so a scored row is always a locked one.
        if (Date.parse(m.kickoffUtc) <= now) {
            return <LockedRow {...common} result={result} phase={m.phase} boosted={boostedMatchId === m.id} />;
        }

        return <OpenRow matchId={m.id} {...common} onSaved={ctx.refresh} />;
    };

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
                            {/* Each match is wrapped so it stays one row of the shared grid on
                                desktop (`.pick-row { display: contents }`) yet reflows into a
                                self-contained card on mobile. */}
                            {matches.map((m) => (
                                <div key={m.id} className="pick-row">
                                    {renderRow(m)}
                                    <BoostControl
                                        phaseId={m.phase}
                                        matchId={m.id}
                                        boosted={boostedMatchId === m.id}
                                        editable={
                                            !boostLocked &&
                                            hasResolvedTeams(m, ctx.tournament.teams) &&
                                            Date.parse(m.kickoffUtc) > now
                                        }
                                        onChanged={ctx.refresh}
                                    />
                                </div>
                            ))}
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

type RowProps = {
    prefix: string;
    home: MatchSide;
    away: MatchSide;
    pick: Score | undefined;
    firstScorer: FirstScorer | undefined;
    time: string;
};

/**
 * Inline ⚽ toggle shown beside a team in the score line (BL6). Tapping marks that side as the
 * first-to-score pick; tapping the active side clears it. Out of the tab order and tagged with
 * `data-fs` so leaving it doesn't count as leaving the row (see `onRowBlur`).
 */
function FirstScorerToggle({
    side,
    matchId,
    label,
    active,
    onToggle,
    onBlur,
}: {
    side: 'HOME' | 'AWAY';
    matchId: MatchId;
    label: string;
    active: boolean;
    onToggle: (side: 'HOME' | 'AWAY') => void;
    onBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
}) {
    return (
        <button
            type="button"
            className={`fs-pick${active ? ' fs-on' : ''}`}
            data-fs={matchId}
            tabIndex={-1}
            aria-pressed={active}
            aria-label={`${label} to score first`}
            title={active ? `${label} picked to score first — tap to clear` : `Pick ${label} to score first`}
            onClick={() => onToggle(side)}
            onBlur={onBlur}
        >
            ⚽
        </button>
    );
}

/**
 * A read-only match row: either kickoff has passed ("locked") or a knockout's teams aren't
 * assigned yet ("TBD"). Shows the saved pick (or "–") and the appropriate badge.
 */
function LockedRow({
    prefix,
    home,
    away,
    pick,
    firstScorer,
    time,
    tbd,
    result,
    phase,
    boosted,
}: RowProps & {
    tbd?: boolean;
    result?: { score: Score; firstScorer: FirstScorer | undefined } | undefined;
    phase?: PhaseId | undefined;
    boosted?: boolean | undefined;
}) {
    // Once the result is in, show what this match earned (its net contribution, incl. boost) and
    // tint the first-scorer ⚽ by whether it was right.
    const points =
        result && phase ? (pick ? scorePrediction(pick, firstScorer, result.score, result.firstScorer, phase, !!boosted).points : 0) : undefined;
    const correct = result?.firstScorer ? firstScorer === result.firstScorer : undefined;
    const fsMark =
        correct === undefined ? null : <span className={`fs-mark ${correct ? 'ok' : 'no'}`}>{correct ? '✓' : '✗'}</span>;

    return (
        <>
            <span className="pick-status">
                {tbd ? (
                    <span className="badge tbd">TBD</span>
                ) : points !== undefined ? (
                    <span className={`badge ${points > 0 ? 'pts-pos' : points < 0 ? 'pts-neg' : 'pts-zero'}`}>
                        {points > 0 ? `+${points}` : points}
                    </span>
                ) : (
                    <span className="badge locked">locked</span>
                )}
            </span>
            <span className="pick-prefix">{prefix}</span>
            <span className="pick-team home">
                <span className="team-label">
                    <TeamSide side={home} />
                </span>
                {!tbd && firstScorer === 'HOME' && (
                    <span className="fs-pick fs-on" title="Your first-to-score pick" aria-label={`${home.name} to score first`}>
                        ⚽{fsMark}
                    </span>
                )}
            </span>
            <span className="pick-num home">
                <input className="pick-input home" type="number" value={pick ? String(pick.home) : ''} disabled readOnly />
                {result && <span className="pick-actual">{result.score.home}</span>}
            </span>
            <span className="pick-dash">-</span>
            <span className="pick-num away">
                <input className="pick-input away" type="number" value={pick ? String(pick.away) : ''} disabled readOnly />
                {result && <span className="pick-actual">{result.score.away}</span>}
            </span>
            <span className="pick-team away">
                {!tbd && firstScorer === 'AWAY' && (
                    <span className="fs-pick fs-on" title="Your first-to-score pick" aria-label={`${away.name} to score first`}>
                        ⚽{fsMark}
                    </span>
                )}
                <span className="team-label">
                    <TeamSide side={away} />
                </span>
            </span>
            <span className="pick-action" />
            <time className="pick-time">{time}</time>
        </>
    );
}

/** An editable match row (still open): score inputs, a Save button, and an "open" badge. */
function OpenRow({ matchId, prefix, home, away, pick, firstScorer, time, onSaved }: RowProps & { matchId: MatchId; onSaved: () => Promise<void> }) {
    // Empty string (not 0) when there's no saved pick, since 0-0 is itself a valid prediction.
    const [homeGoals, setHomeGoals] = useState(pick ? String(pick.home) : '');
    const [awayGoals, setAwayGoals] = useState(pick ? String(pick.away) : '');
    // First-to-score pick: one side or none (toggling the active side off clears it). Players
    // can't bet on a goalless draw — a 0-0 simply makes any side pick wrong (−2).
    const [scorer, setScorer] = useState<'HOME' | 'AWAY' | ''>(firstScorer === 'HOME' || firstScorer === 'AWAY' ? firstScorer : '');
    const [saved, setSaved] = useState(pick !== undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const onSave = async () => {
        if (homeGoals === '' || awayGoals === '') {
            setError('Enter both scores before saving.');

            return;
        }
        setSaving(true);
        setError(undefined);
        try {
            await api.savePrediction(matchId, { home: Number(homeGoals), away: Number(awayGoals) }, scorer || undefined);
            setSaved(true);
            // Refresh the shared session so the saved pick survives navigating away and back.
            await onSaved();
        } catch (err) {
            setError(saveErrorMessage(err, 'This match has locked (kickoff passed). Refresh the page to see the latest.'));
        } finally {
            setSaving(false);
        }
    };

    const onChange = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        set(e.target.value);
        setSaved(false);
    };

    const toggleScorer = (side: 'HOME' | 'AWAY') => {
        setScorer((s) => (s === side ? '' : side));
        setSaved(false);
    };

    // Auto-save when focus leaves the whole row (vs. moving between this row's own inputs/toggles/
    // button, which share `data-match`). An untouched row is left alone; an unchanged saved row
    // isn't re-sent; a half-filled row still surfaces the "enter both" warning via onSave.
    const onRowBlur = (e: React.FocusEvent<HTMLInputElement | HTMLButtonElement>) => {
        // Keep focus moving among this row's own controls (score inputs + Save share `data-match`;
        // the first-scorer toggles use `data-fs`) from counting as leaving the row.
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.getAttribute('data-match') === matchId || related?.getAttribute('data-fs') === matchId) return;
        if (homeGoals === '' && awayGoals === '') return;
        if (saved) return;
        void onSave();
    };

    return (
        <>
            <span className="pick-status">
                <span className="badge">open</span>
            </span>
            <span className="pick-prefix">{prefix}</span>
            <span className="pick-team home">
                <span className="team-label">
                    <TeamSide side={home} />
                </span>
                <FirstScorerToggle side="HOME" matchId={matchId} label={home.name} active={scorer === 'HOME'} onToggle={toggleScorer} onBlur={onRowBlur} />
            </span>
            <input className="pick-input home" data-match={matchId} type="number" inputMode="numeric" min={0} max={20} value={homeGoals} onChange={onChange(setHomeGoals)} onBlur={onRowBlur} />
            <span className="pick-dash">-</span>
            <input className="pick-input away" data-match={matchId} type="number" inputMode="numeric" min={0} max={20} value={awayGoals} onChange={onChange(setAwayGoals)} onBlur={onRowBlur} />
            <span className="pick-team away">
                <FirstScorerToggle side="AWAY" matchId={matchId} label={away.name} active={scorer === 'AWAY'} onToggle={toggleScorer} onBlur={onRowBlur} />
                <span className="team-label">
                    <TeamSide side={away} />
                </span>
            </span>
            <span className="pick-action">
                <button type="button" data-match={matchId} tabIndex={-1} onClick={onSave} disabled={saving}>
                    {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
                </button>
            </span>
            <time className="pick-time">{time}</time>
            {error && <div className="pick-error">{error}</div>}
        </>
    );
}

/**
 * Per-match 2× boost control (BL7). The toggle appears only on a match that's still predictable
 * (resolved teams, kickoff not passed) and whose phase hasn't locked; selecting another match in
 * the phase replaces the prior one (enforced server-side by the per-phase key). Otherwise the row
 * is read-only: the boosted match shows a badge, everything else shows nothing.
 */
function BoostControl({
    phaseId,
    matchId,
    boosted,
    editable,
    onChanged,
}: {
    phaseId: PhaseId;
    matchId: MatchId;
    boosted: boolean;
    editable: boolean;
    onChanged: () => Promise<void>;
}) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>();

    if (!editable) {
        // Read-only: show the badge only on the boosted match, and render nothing otherwise so a
        // locked row doesn't carry an empty full-width boost line.
        if (!boosted) return null;

        return (
            <span className="pick-boost">
                <span className="badge boost">⚡ 2× boosted</span>
            </span>
        );
    }

    const toggle = async () => {
        setSaving(true);
        setError(undefined);
        try {
            await api.saveBoost(phaseId, boosted ? null : matchId);
            await onChanged();
        } catch (err) {
            setError(saveErrorMessage(err, 'Boosts have locked for this phase (it has started). Refresh the page.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <span className="pick-boost">
            <button
                type="button"
                className={boosted ? 'boost-on' : 'secondary'}
                onClick={toggle}
                disabled={saving}
                title="Double everything this match earns. One boost per round; it locks at the round's first kickoff."
            >
                {saving ? '…' : boosted ? '⚡ 2× boosted' : '⚡ Boost 2×'}
            </button>
            {error && <span className="pick-error">{error}</span>}
        </span>
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
                                {flagEmoji(t.id)} {t.name}
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
