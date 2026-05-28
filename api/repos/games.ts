/**
 * Repository for the `games` table — one row per friend-group "pool". Each game has a
 * unique case-insensitive name and a scrypt-hashed shared password.
 */

/** A game (= one friend-group's pool). `name` is unique case-insensitive across all games. */
export type Game = {
    id: number;
    name: string;
    passwordHash: string;
    /** Unix epoch seconds when the game was created. */
    createdAt: number;
};

type Row = {
    id: number;
    name: string;
    password_hash: string;
    created_at: number;
};

function mapRow(row: Row): Game {
    return {
        id: row.id,
        name: row.name,
        passwordHash: row.password_hash,
        createdAt: row.created_at,
    };
}

export const gamesRepo = {
    /** Inserts a new game. Throws on duplicate name (case-insensitive UNIQUE constraint). */
    async create(db: D1Database, input: { name: string; passwordHash: string }): Promise<Game> {
        const result = await db
            .prepare(
                'INSERT INTO games (name, password_hash) VALUES (?, ?) RETURNING id, name, password_hash, created_at',
            )
            .bind(input.name, input.passwordHash)
            .first<Row>();
        /* v8 ignore next */
        if (!result) throw new Error('INSERT INTO games returned no row');

        return mapRow(result);
    },

    /** Look up a game by its numeric id. Returns undefined when no row matches. */
    async findById(db: D1Database, id: number): Promise<Game | undefined> {
        const row = await db
            .prepare('SELECT id, name, password_hash, created_at FROM games WHERE id = ?')
            .bind(id)
            .first<Row>();

        return row ? mapRow(row) : undefined;
    },

    /** Look up a game by name (case-insensitive). Returns undefined when no row matches. */
    async findByName(db: D1Database, name: string): Promise<Game | undefined> {
        const row = await db
            .prepare('SELECT id, name, password_hash, created_at FROM games WHERE name = ? COLLATE NOCASE')
            .bind(name)
            .first<Row>();

        return row ? mapRow(row) : undefined;
    },

    /** All games ordered by name (case-insensitive ascending). */
    async listAll(db: D1Database): Promise<Game[]> {
        const { results } = await db
            .prepare('SELECT id, name, password_hash, created_at FROM games ORDER BY name COLLATE NOCASE ASC')
            .all<Row>();

        return results.map(mapRow);
    },

    /**
     * Delete a game and all of its game-scoped state (its players and their predictions).
     * Global `match_results` are the official tournament record and are left untouched.
     *
     * Deletes are issued explicitly in dependency order so the wipe holds regardless of
     * whether foreign-key cascade enforcement is enabled on the connection.
     */
    async delete(db: D1Database, id: number): Promise<void> {
        await db
            .prepare('DELETE FROM predictions WHERE player_id IN (SELECT id FROM players WHERE game_id = ?)')
            .bind(id)
            .run();
        await db.prepare('DELETE FROM players WHERE game_id = ?').bind(id).run();
        await db.prepare('DELETE FROM games WHERE id = ?').bind(id).run();
    },
};
