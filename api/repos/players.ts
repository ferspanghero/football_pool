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
     * Create a player with their own password hash (set when they first join a game).
     * Throws if the display name already exists in the game (UNIQUE, case-insensitive) —
     * callers detect an existing player with {@link findByName} first and route to login.
     */
    async create(
        db: D1Database,
        input: { gameId: number; displayName: string; passwordHash: string },
    ): Promise<Player> {
        const created = await db
            .prepare(
                'INSERT INTO players (game_id, display_name, password_hash) VALUES (?, ?, ?) RETURNING id, game_id, display_name, champion_team_id, created_at',
            )
            .bind(input.gameId, input.displayName, input.passwordHash)
            .first<Row>();
        /* v8 ignore next */
        if (!created) throw new Error('INSERT INTO players returned no row');

        return mapRow(created);
    },

    /**
     * Look up a player by case-insensitive display name within a game, including the stored
     * password hash for login verification. Returns undefined when no such player exists.
     * The returned `passwordHash` is for the auth path only and must never reach a client.
     */
    async findByName(
        db: D1Database,
        gameId: number,
        displayName: string,
    ): Promise<(Player & { passwordHash: string }) | undefined> {
        const row = await db
            .prepare(
                'SELECT id, game_id, display_name, password_hash, champion_team_id, created_at FROM players WHERE game_id = ? AND display_name = ? COLLATE NOCASE',
            )
            .bind(gameId, displayName)
            .first<Row & { password_hash: string }>();

        return row ? { ...mapRow(row), passwordHash: row.password_hash } : undefined;
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
