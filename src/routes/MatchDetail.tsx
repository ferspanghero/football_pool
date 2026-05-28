/** Match detail page — post-kickoff shows all players' predictions and the actual result. */

import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api, ApiError, type MatchPredictionsPayload } from '../api-client';
import { formatKickoff } from '@shared/time';
import { scoreMatch, POINTS } from '@shared/scoring';
import { matchSides } from '../lib/matchDisplay';
import { TeamSide } from '../components/Flag';
import type { GameContextValue } from './GameLayout';
import type { Score } from '@shared/types';

export function MatchDetail() {
    const ctx = useOutletContext<GameContextValue>();
    const { matchId, gameId } = useParams();
    const [data, setData] = useState<MatchPredictionsPayload | undefined>();
    const [error, setError] = useState<string | undefined>();
    const match = ctx.tournament.matches.find((m) => m.id === matchId);
    const locked = match ? Date.parse(match.kickoffUtc) <= Date.now() : false;

    useEffect(() => {
        if (!locked || !gameId || !matchId) return;
        api.matchPredictions(Number.parseInt(gameId, 10), matchId)
            .then(setData)
            .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    }, [gameId, matchId, locked]);

    if (!match) return <p>Match not found.</p>;

    const sides = matchSides(match, ctx.tournament.teams);
    const heading = (
        <h2>
            <TeamSide side={sides.home} /> vs <TeamSide side={sides.away} />
        </h2>
    );

    if (!locked) {
        return (
            <>
                {heading}
                <p>Predictions visible after kickoff at {formatKickoff(match.kickoffUtc)}.</p>
            </>
        );
    }

    return (
        <>
            {heading}
            <p>Kickoff: {formatKickoff(match.kickoffUtc)}</p>
            <p>
                Actual result:{' '}
                {data?.result ? `${data.result.home} - ${data.result.away}` : 'pending'}
            </p>
            {error && <div className="error">{error}</div>}
            <table className="leaderboard-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Prediction</th>
                        <th>Outcome</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.predictions.map((p) => (
                        <tr key={p.playerId}>
                            <td>{p.displayName}</td>
                            <td>
                                {p.score.home} - {p.score.away}
                            </td>
                            <td>
                                <OutcomeBadge prediction={p.score} result={data?.result ?? null} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

/** Maps a per-match base-point value to a label + CSS class for the outcome badge. */
function outcomeTier(points: number): { label: string; cls: string } {
    switch (points) {
        case POINTS.EXACT:
            return { label: 'Exact', cls: 'outcome-exact' };
        case POINTS.OUTCOME_AND_GD:
            return { label: 'Outcome + GD', cls: 'outcome-good' };
        case POINTS.OUTCOME_ONLY:
            return { label: 'Outcome', cls: 'outcome-ok' };
        case POINTS.GD_ONLY:
            return { label: 'GD only', cls: 'outcome-gd' };
        default:
            return { label: 'Miss', cls: 'outcome-miss' };
    }
}

/** A colored badge showing how a prediction scored against the actual result. */
function OutcomeBadge({ prediction, result }: { prediction: Score; result: Score | null }) {
    if (!result) return null;
    const tier = outcomeTier(scoreMatch(prediction, result));

    return <span className={`badge ${tier.cls}`}>{tier.label}</span>;
}
