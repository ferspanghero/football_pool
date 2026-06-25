/**
 * Repository for the `phase_boosts` table — at most one boosted match per (player, phase),
 * enforced by the table's composite primary key (BL7). A boost doubles the points its match
 * earns; the kickoff lock (per target match) is enforced at the API layer (see `setBoost`).
 */

import type { MatchId, PhaseId } from '@shared/types';

/** A player's boosted match for one phase. */
export type PhaseBoost = {
    playerId: number;
    phaseId: PhaseId;
    matchId: MatchId;
};

type Row = { player_id: number; phase_id: string; match_id: string };

function mapRow(row: Row): PhaseBoost {
    return { playerId: row.player_id, phaseId: row.phase_id as PhaseId, matchId: row.match_id };
}

export const boostsRepo = {
    /** Insert or replace the boost for a (player, phase) — the PK keeps it to one per phase. */
    async set(db: D1Database, input: { playerId: number; phaseId: PhaseId; matchId: MatchId }): Promise<void> {
        await db
            .prepare(
                `INSERT INTO phase_boosts (player_id, phase_id, match_id, updated_at)
                 VALUES (?, ?, ?, unixepoch())
                 ON CONFLICT(player_id, phase_id) DO UPDATE SET
                     match_id = excluded.match_id,
                     updated_at = unixepoch()`,
            )
            .bind(input.playerId, input.phaseId, input.matchId)
            .run();
    },

    /** Remove a player's boost for a phase (no-op when none is set). */
    async clear(db: D1Database, playerId: number, phaseId: PhaseId): Promise<void> {
        await db.prepare('DELETE FROM phase_boosts WHERE player_id = ? AND phase_id = ?').bind(playerId, phaseId).run();
    },

    /** Every boost a player has set, across phases. */
    async findByPlayer(db: D1Database, playerId: number): Promise<PhaseBoost[]> {
        const { results } = await db
            .prepare('SELECT player_id, phase_id, match_id FROM phase_boosts WHERE player_id = ?')
            .bind(playerId)
            .all<Row>();

        return results.map(mapRow);
    },

    /** All boosts in a game (joined through `players`). Used by the leaderboard. */
    async findAllForGame(db: D1Database, gameId: number): Promise<PhaseBoost[]> {
        const { results } = await db
            .prepare(
                `SELECT b.player_id, b.phase_id, b.match_id
                 FROM phase_boosts b
                 JOIN players pl ON pl.id = b.player_id
                 WHERE pl.game_id = ?`,
            )
            .bind(gameId)
            .all<Row>();

        return results.map(mapRow);
    },
};
