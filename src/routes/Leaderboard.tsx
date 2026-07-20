/** Leaderboard tab — standings table with a scoring-rules blurb. */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import { signedPoints } from '../lib/points';
import { POINTS, SCORE_COMPONENTS, CHAMPION_BONUS, FIRST_SCORER_BONUS } from '@shared/scoring';
import { PHASES } from '@shared/phases';
import type { LeaderboardRow } from '@shared/types';

const MIN_MULTIPLIER = Math.min(...PHASES.map((p) => p.multiplier));
const MAX_MULTIPLIER = Math.max(...PHASES.map((p) => p.multiplier));

/** A points cell with an explicit sign and positive/negative colouring. */
function PointsCell({ label, value }: { label: string; value: number }) {
    const { text, tone } = signedPoints(value);

    return (
        <td data-label={label} className={`pts pts-${tone}`}>
            {text}
        </td>
    );
}

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
                <p>
                    Each score prediction earns points for what it gets right. The leaderboard splits these into the
                    columns below — together with First Scorer and the Champion bonus, they add up to your total:
                </p>
                <ul>
                    <li><b>Right outcome</b> (winner or draw): <b>+{SCORE_COMPONENTS.OUTCOME}</b></li>
                    <li><b>Right goal difference</b>: <b>+{SCORE_COMPONENTS.GOAL_DIFF}</b></li>
                    <li><b>Exact score</b>: <b>+{SCORE_COMPONENTS.EXACT}</b></li>
                </ul>
                <p>
                    A perfect prediction earns all three (<b>+{POINTS.EXACT}</b>). Each part is multiplied by the round
                    (group stage ×{MIN_MULTIPLIER}, rising to ×{MAX_MULTIPLIER} for the final); knockout matches are
                    scored on the 90-minute result. Predictions lock at each match's kickoff.
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
                        points. The single-match 3rd-place and final rounds can't be boosted. You can move it to any
                        match in the round that hasn't kicked off yet; it locks once your boosted match kicks off.
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
                        <th>Right Outcome</th>
                        <th>Right Goal Diff</th>
                        <th>Exact Score</th>
                        <th>First Scorer</th>
                        <th>Champion</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.playerId}>
                            <td data-label="Rank">{i + 1}</td>
                            <td data-label="Player">{r.displayName}</td>
                            <td data-label="Points">{r.totalPoints}</td>
                            <PointsCell label="Right Outcome" value={r.correctOutcomePoints} />
                            <PointsCell label="Right Goal Diff" value={r.correctGoalDiffPoints} />
                            <PointsCell label="Exact Score" value={r.exactScorePoints} />
                            <PointsCell label="First Scorer" value={r.firstScorerPoints} />
                            <PointsCell label="Champion" value={r.championPoints} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
