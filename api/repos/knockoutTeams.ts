/**
 * Repository for the `knockout_teams` overlay (v4) — one row per knockout fixture whose real teams
 * are known, merged onto the static placeholder fixtures at read time (see `getResolvedMatches`).
 * Each row carries a `source`: `AUTO` (written by the scheduled bracket sync from ESPN) or `MANUAL`
 * (an admin override). An `AUTO` write never overwrites a `MANUAL` row, so a hand correction wins —
 * the same provenance rule the `match_results` repo uses for scores.
 */

import type { MatchId, ResultSource, TeamId } from '@shared/types';

/** Resolved team identities for a single knockout fixture. */
export type KnockoutTeams = {
    matchId: MatchId;
    homeTeamId: TeamId;
    awayTeamId: TeamId;
    /** Provenance: `AUTO` (scheduled sync) or `MANUAL` (admin override). */
    source: ResultSource;
    /** Unix epoch seconds of the last write. */
    updatedAt: number;
};

type Row = { match_id: string; home_team_id: string; away_team_id: string; source: string; updated_at: number };

function mapRow(row: Row): KnockoutTeams {
    return {
        matchId: row.match_id,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        source: row.source as ResultSource,
        updatedAt: row.updated_at,
    };
}

const SELECT_COLS = 'match_id, home_team_id, away_team_id, source, updated_at';

export const knockoutTeamsRepo = {
    /**
     * Insert or overwrite a knockout fixture's resolved teams. `source` defaults to `AUTO` (the
     * sync is the common writer). A `MANUAL` write always wins; an `AUTO` write is skipped when the
     * existing row is `MANUAL`, so it can never clobber an admin override. An invalid `source` is
     * rejected by the CHECK constraint.
     */
    async upsert(
        db: D1Database,
        input: { matchId: MatchId; homeTeamId: TeamId; awayTeamId: TeamId; source?: ResultSource },
    ): Promise<void> {
        const source: ResultSource = input.source ?? 'AUTO';
        const guard = source === 'AUTO' ? `WHERE knockout_teams.source != 'MANUAL'` : '';
        await db
            .prepare(
                `INSERT INTO knockout_teams (match_id, home_team_id, away_team_id, source, updated_at)
                 VALUES (?, ?, ?, ?, unixepoch())
                 ON CONFLICT(match_id) DO UPDATE SET
                     home_team_id = excluded.home_team_id,
                     away_team_id = excluded.away_team_id,
                     source = excluded.source,
                     updated_at = unixepoch()
                 ${guard}`,
            )
            .bind(input.matchId, input.homeTeamId, input.awayTeamId, source)
            .run();
    },

    /** Remove a fixture's override (revert it to the static placeholder). No-op when none is set. */
    async clear(db: D1Database, matchId: MatchId): Promise<void> {
        await db.prepare('DELETE FROM knockout_teams WHERE match_id = ?').bind(matchId).run();
    },

    /** Look up an override by match id. Returns undefined when none is recorded. */
    async findById(db: D1Database, matchId: MatchId): Promise<KnockoutTeams | undefined> {
        const row = await db
            .prepare(`SELECT ${SELECT_COLS} FROM knockout_teams WHERE match_id = ?`)
            .bind(matchId)
            .first<Row>();

        return row ? mapRow(row) : undefined;
    },

    /** Every recorded override. Order is implementation-defined; callers should sort if needed. */
    async findAll(db: D1Database): Promise<KnockoutTeams[]> {
        const { results } = await db.prepare(`SELECT ${SELECT_COLS} FROM knockout_teams`).all<Row>();

        return results.map(mapRow);
    },
};
