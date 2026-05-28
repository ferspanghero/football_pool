/**
 * Repository for the `match_results` table — one row per match that the admin has
 * recorded a score for. Scores stored are 90-minute results (extra time / penalties
 * are not counted for prediction scoring).
 */

import type { MatchId, Score } from '@shared/types';

/** Recorded actual result for a single match (90-minute score). */
export type MatchResult = {
    matchId: MatchId;
    score: Score;
    /** Unix epoch seconds of the last write. */
    recordedAt: number;
};

type Row = {
    match_id: string;
    home_goals: number;
    away_goals: number;
    recorded_at: number;
};

function mapRow(row: Row): MatchResult {
    return {
        matchId: row.match_id,
        score: { home: row.home_goals, away: row.away_goals },
        recordedAt: row.recorded_at,
    };
}

export const resultsRepo = {
    /** Insert or overwrite a recorded result. Rejects negative scores via the CHECK constraint. */
    async upsert(db: D1Database, input: { matchId: MatchId; score: Score }): Promise<void> {
        await db
            .prepare(
                `INSERT INTO match_results (match_id, home_goals, away_goals, recorded_at)
                 VALUES (?, ?, ?, unixepoch())
                 ON CONFLICT(match_id) DO UPDATE SET
                     home_goals = excluded.home_goals,
                     away_goals = excluded.away_goals,
                     recorded_at = unixepoch()`,
            )
            .bind(input.matchId, input.score.home, input.score.away)
            .run();
    },

    /** Look up a result by match id. Returns undefined when no result is recorded. */
    async findById(db: D1Database, matchId: MatchId): Promise<MatchResult | undefined> {
        const row = await db
            .prepare('SELECT match_id, home_goals, away_goals, recorded_at FROM match_results WHERE match_id = ?')
            .bind(matchId)
            .first<Row>();

        return row ? mapRow(row) : undefined;
    },

    /** Every recorded result. Order is implementation-defined; callers should sort if needed. */
    async findAll(db: D1Database): Promise<MatchResult[]> {
        const { results } = await db
            .prepare('SELECT match_id, home_goals, away_goals, recorded_at FROM match_results')
            .all<Row>();

        return results.map(mapRow);
    },
};
