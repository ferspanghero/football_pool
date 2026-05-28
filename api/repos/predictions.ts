/**
 * Repository for the `predictions` table — one row per (player, match) pair.
 * Predictions are mutable until the match's kickoff (enforced at the API layer).
 */

import type { MatchId, Score } from '@shared/types';

/** A player's score prediction for one match. Primary key is `(playerId, matchId)`. */
export type Prediction = {
    playerId: number;
    matchId: MatchId;
    score: Score;
    /** Unix epoch seconds of the last write. */
    updatedAt: number;
};

type Row = {
    player_id: number;
    match_id: string;
    home_goals: number;
    away_goals: number;
    updated_at: number;
};

function mapRow(row: Row): Prediction {
    return {
        playerId: row.player_id,
        matchId: row.match_id,
        score: { home: row.home_goals, away: row.away_goals },
        updatedAt: row.updated_at,
    };
}

export const predictionsRepo = {
    /**
     * Insert or overwrite a prediction. Rejects scores below zero via the CHECK constraint.
     * Callers must enforce kickoff lock and result-of-result validation at the API layer.
     */
    async upsert(
        db: D1Database,
        input: { playerId: number; matchId: MatchId; score: Score },
    ): Promise<void> {
        await db
            .prepare(
                `INSERT INTO predictions (player_id, match_id, home_goals, away_goals, updated_at)
                 VALUES (?, ?, ?, ?, unixepoch())
                 ON CONFLICT(player_id, match_id) DO UPDATE SET
                     home_goals = excluded.home_goals,
                     away_goals = excluded.away_goals,
                     updated_at = unixepoch()`,
            )
            .bind(input.playerId, input.matchId, input.score.home, input.score.away)
            .run();
    },

    /** All predictions a player has made, across all matches. */
    async findByPlayer(db: D1Database, playerId: number): Promise<Prediction[]> {
        const { results } = await db
            .prepare(
                'SELECT player_id, match_id, home_goals, away_goals, updated_at FROM predictions WHERE player_id = ?',
            )
            .bind(playerId)
            .all<Row>();

        return results.map(mapRow);
    },

    /** All predictions for a given match, across all players in all games. */
    async findByMatch(db: D1Database, matchId: MatchId): Promise<Prediction[]> {
        const { results } = await db
            .prepare(
                'SELECT player_id, match_id, home_goals, away_goals, updated_at FROM predictions WHERE match_id = ?',
            )
            .bind(matchId)
            .all<Row>();

        return results.map(mapRow);
    },

    /** All predictions in a given game (joined through `players`). Used by the leaderboard. */
    async findAllForGame(db: D1Database, gameId: number): Promise<Prediction[]> {
        const { results } = await db
            .prepare(
                `SELECT p.player_id, p.match_id, p.home_goals, p.away_goals, p.updated_at
                 FROM predictions p
                 JOIN players pl ON pl.id = p.player_id
                 WHERE pl.game_id = ?`,
            )
            .bind(gameId)
            .all<Row>();

        return results.map(mapRow);
    },
};
