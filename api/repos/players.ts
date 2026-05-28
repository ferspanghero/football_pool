/**
 * Repository for the `players` table — one row per (game, display_name) pair. Players
 * are scoped to their game; the same display name in two different games is two players.
 */

import type { TeamId } from '@shared/types';

/** A player within a single game. `(gameId, displayName)` is unique case-insensitive. */
export type Player = {
    id: number;
    gameId: number;
    displayName: string;
    /** Champion pick. Mutable until first kickoff; locked thereafter at the API layer. */
    championTeamId: TeamId | undefined;
    /** Unix epoch seconds. */
    createdAt: number;
};

type Row = {
    id: number;
    game_id: number;
    display_name: string;
    champion_team_id: string | null;
    created_at: number;
};

function mapRow(row: Row): Player {
    return {
        id: row.id,
        gameId: row.game_id,
        displayName: row.display_name,
        championTeamId: row.champion_team_id ?? undefined,
        createdAt: row.created_at,
    };
}

export const playersRepo = {
    /**
     * Look up a player by case-insensitive display name within a game; create the row
     * if none exists. This is what powers the "type your name to log in" flow — typing
     * the same name returns the same player, preserving predictions across devices.
     */
    async findOrCreate(db: D1Database, input: { gameId: number; displayName: string }): Promise<Player> {
        const existing = await db
            .prepare(
                'SELECT id, game_id, display_name, champion_team_id, created_at FROM players WHERE game_id = ? AND display_name = ? COLLATE NOCASE',
            )
            .bind(input.gameId, input.displayName)
            .first<Row>();
        if (existing) return mapRow(existing);

        const created = await db
            .prepare(
                'INSERT INTO players (game_id, display_name) VALUES (?, ?) RETURNING id, game_id, display_name, champion_team_id, created_at',
            )
            .bind(input.gameId, input.displayName)
            .first<Row>();
        /* v8 ignore next */
        if (!created) throw new Error('INSERT INTO players returned no row');

        return mapRow(created);
    },

    /** Look up a player by id. Returns undefined when no row matches. */
    async findById(db: D1Database, id: number): Promise<Player | undefined> {
        const row = await db
            .prepare('SELECT id, game_id, display_name, champion_team_id, created_at FROM players WHERE id = ?')
            .bind(id)
            .first<Row>();

        return row ? mapRow(row) : undefined;
    },

    /** All players in a game ordered by display name (case-insensitive ascending). */
    async listByGame(db: D1Database, gameId: number): Promise<Player[]> {
        const { results } = await db
            .prepare(
                'SELECT id, game_id, display_name, champion_team_id, created_at FROM players WHERE game_id = ? ORDER BY display_name COLLATE NOCASE ASC',
            )
            .bind(gameId)
            .all<Row>();

        return results.map(mapRow);
    },

    /** Set or clear the player's champion pick. Callers must enforce the kickoff lock. */
    async setChampionTeamId(db: D1Database, playerId: number, teamId: TeamId | undefined): Promise<void> {
        await db
            .prepare('UPDATE players SET champion_team_id = ? WHERE id = ?')
            .bind(teamId ?? null, playerId)
            .run();
    },

    /** Delete a player. Cascade-deletes their predictions via the FK ON DELETE CASCADE. */
    async delete(db: D1Database, id: number): Promise<void> {
        await db.prepare('DELETE FROM players WHERE id = ?').bind(id).run();
    },
};
