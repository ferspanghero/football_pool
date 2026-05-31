/**
 * Repository for the `match_results` table — one row per match that the admin has
 * recorded a score for. Scores stored are 90-minute results (extra time / penalties
 * are not counted for prediction scoring).
 */

import type { FirstScorer, MatchId, Score } from '@shared/types';

/** Recorded actual result for a single match (90-minute score). */
export type MatchResult = {
    matchId: MatchId;
    score: Score;
    /** Admin-recorded side that scored first (BL6); undefined when not recorded. */
    firstScorer?: FirstScorer | undefined;
    /** Unix epoch seconds of the last write. */
    recordedAt: number;
};

type Row = {
    match_id: string;
    home_goals: number;
    away_goals: number;
    first_scorer: string | null;
    recorded_at: number;
};

function mapRow(row: Row): MatchResult {
    return {
        matchId: row.match_id,
        score: { home: row.home_goals, away: row.away_goals },
        firstScorer: (row.first_scorer ?? undefined) as FirstScorer | undefined,
        recordedAt: row.recorded_at,
    };
}

const SELECT_COLS = 'match_id, home_goals, away_goals, first_scorer, recorded_at';

export const resultsRepo = {
    /**
     * Insert or overwrite a recorded result. Rejects negative scores (and an invalid
     * `firstScorer`) via CHECK constraints. The first scorer is always written from
     * `input.firstScorer` (cleared to NULL when absent).
     */
    async upsert(db: D1Database, input: { matchId: MatchId; score: Score; firstScorer?: FirstScorer | undefined }): Promise<void> {
        await db
            .prepare(
                `INSERT INTO match_results (match_id, home_goals, away_goals, first_scorer, recorded_at)
                 VALUES (?, ?, ?, ?, unixepoch())
                 ON CONFLICT(match_id) DO UPDATE SET
                     home_goals = excluded.home_goals,
                     away_goals = excluded.away_goals,
                     first_scorer = excluded.first_scorer,
                     recorded_at = unixepoch()`,
            )
            .bind(input.matchId, input.score.home, input.score.away, input.firstScorer ?? null)
            .run();
    },

    /** Look up a result by match id. Returns undefined when no result is recorded. */
    async findById(db: D1Database, matchId: MatchId): Promise<MatchResult | undefined> {
        const row = await db
            .prepare(`SELECT ${SELECT_COLS} FROM match_results WHERE match_id = ?`)
            .bind(matchId)
            .first<Row>();

        return row ? mapRow(row) : undefined;
    },

    /** Every recorded result. Order is implementation-defined; callers should sort if needed. */
    async findAll(db: D1Database): Promise<MatchResult[]> {
        const { results } = await db.prepare(`SELECT ${SELECT_COLS} FROM match_results`).all<Row>();

        return results.map(mapRow);
    },
};
