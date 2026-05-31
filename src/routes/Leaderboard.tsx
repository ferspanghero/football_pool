/** Leaderboard tab — standings table with a scoring-rules blurb. */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import { POINTS, CHAMPION_BONUS, FIRST_SCORER_BONUS } from '@shared/scoring';
import { PHASES } from '@shared/phases';
import type { LeaderboardRow } from '@shared/types';

const MIN_MULTIPLIER = Math.min(...PHASES.map((p) => p.multiplier));
const MAX_MULTIPLIER = Math.max(...PHASES.map((p) => p.multiplier));

export function Leaderboard() {
    const { gameId } = useParams();
    const [rows, setRows] = useState<LeaderboardRow[]>([]);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        if (!gameId) return;
        api.leaderboard(Number.parseInt(gameId, 10))
            .then((r) => setRows(r.rows))
            .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    }, [gameId]);

    return (
        <>
            <h2>Leaderboard</h2>

            <section className="leaderboard-rules">
                <strong>How points work</strong>
                <ul>
                    <li>Exact score: <b>{POINTS.EXACT}</b></li>
                    <li>Right result + goal difference: <b>{POINTS.OUTCOME_AND_GD}</b></li>
                    <li>Right result only: <b>{POINTS.OUTCOME_ONLY}</b></li>
                    <li>Right goal difference only: <b>{POINTS.GD_ONLY}</b></li>
                    <li>Nothing right: <b>{POINTS.WRONG}</b></li>
                </ul>
                <p>
                    Each match's points are multiplied by the round (group stage ×{MIN_MULTIPLIER}, rising to ×
                    {MAX_MULTIPLIER} for the final). Knockout matches are scored on the 90-minute result. Score
                    predictions lock at each match's kickoff.
                </p>
                <strong style={{ display: 'block', marginTop: '0.8rem' }}>Optional points</strong>
                <ul>
                    <li>
                        <b>Champion</b>: correctly picking the tournament winner adds <b>+{CHAMPION_BONUS}</b>. Locks at
                        the tournament's first kickoff.
                    </li>
                    <li>
                        <b>First to score</b>: pick the team you think scores first — or neither. Correct earns{' '}
                        <b>+{FIRST_SCORER_BONUS}</b>, wrong costs <b>−{FIRST_SCORER_BONUS}</b> (a goalless draw counts as
                        wrong) — both multiplied by the round, so it's a risk. Skip it and nothing changes. Locks at the
                        match's kickoff.
                    </li>
                    <li>
                        <b>Boost</b>: flag one match per round to <b>double</b> everything it earns — including negative
                        points. Locks at the round's first kickoff.
                    </li>
                </ul>
            </section>

            {error && <div className="error">{error}</div>}
            <table className="leaderboard-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Points</th>
                        <th>Exact Predictions</th>
                        <th>Right Outcome</th>
                        <th>Right Goal Diff</th>
                        <th>First Scorer</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.playerId}>
                            <td data-label="Rank">{i + 1}</td>
                            <td data-label="Player">{r.displayName}</td>
                            <td data-label="Points">{r.totalPoints}</td>
                            <td data-label="Exact Predictions">{r.exactScoreCount}</td>
                            <td data-label="Right Outcome">{r.correctOutcomeCount}</td>
                            <td data-label="Right Goal Diff">{r.correctGoalDiffCount}</td>
                            <td data-label="First Scorer">{r.firstScorerPoints}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
