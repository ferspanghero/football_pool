/** Leaderboard tab — sortable-looking table (server already sorts). */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import type { LeaderboardRow } from '@shared/types';

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
            {error && <div className="error">{error}</div>}
            <table className="leaderboard-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Points</th>
                        <th>Exact</th>
                        <th>Outcome</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.playerId}>
                            <td>{i + 1}</td>
                            <td>{r.displayName}</td>
                            <td>{r.totalPoints}</td>
                            <td>{r.exactScoreCount}</td>
                            <td>{r.correctOutcomeCount}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
