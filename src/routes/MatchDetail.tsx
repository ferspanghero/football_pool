/** Match detail page — post-kickoff shows all players' predictions and the actual result. */

import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { api, ApiError, type MatchPredictionsPayload } from '../api-client';
import { formatKickoff } from '@shared/time';
import type { GameContextValue } from './GameLayout';

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

    if (!locked) {
        return (
            <>
                <h2>{matchId}</h2>
                <p>Predictions visible after kickoff at {formatKickoff(match.kickoffUtc)}.</p>
            </>
        );
    }

    return (
        <>
            <h2>{matchId}</h2>
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
                    </tr>
                </thead>
                <tbody>
                    {data?.predictions.map((p) => (
                        <tr key={p.playerId}>
                            <td>{p.displayName}</td>
                            <td>
                                {p.score.home} - {p.score.away}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
