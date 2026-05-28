import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../migrations/0001_init.sql',
);

export function createTestDb(): D1Database {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(readFileSync(migrationPath, 'utf8'));

    return shimD1(sqlite);
}

function shimD1(db: Database.Database): D1Database {
    return {
        prepare: (sql: string) => new ShimStatement(db, sql, []),
    } as unknown as D1Database;
}

class ShimStatement {
    constructor(
        private readonly db: Database.Database,
        private readonly sql: string,
        private readonly params: readonly unknown[],
    ) {}

    bind(...args: unknown[]): ShimStatement {
        return new ShimStatement(this.db, this.sql, args);
    }

    async first<T = unknown>(column?: string): Promise<T | null> {
        const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (column !== undefined) return (row[column] as T) ?? null;
        return row as T;
    }

    async all<T = unknown>(): Promise<{ results: T[]; success: true }> {
        const rows = this.db.prepare(this.sql).all(...this.params) as T[];
        return { results: rows, success: true };
    }

    async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number | bigint } }> {
        const info = this.db.prepare(this.sql).run(...this.params);
        return {
            success: true,
            meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
        };
    }
}
