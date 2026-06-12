/**
 * Tiny structured logger over `console.*` — the Workers-native log sink (captured by Workers Logs,
 * enabled in `wrangler.toml`, and streamed live by `wrangler tail`). A single chokepoint so call
 * sites stay uniform and every line is queryable JSON `{ level, msg, ...fields }`.
 *
 * Only the three levels this app actually emits exist — `info` (happy-path liveness, e.g. a sync
 * summary), `warn` (recoverable external degradation), `error` (a handled failure worth a look).
 * No third-party logger: Node loggers assume streams/fs the Workers runtime lacks, and `console.*`
 * is exactly what the platform already ingests.
 *
 * SECURITY: never pass secrets, passwords, password hashes, session cookies, or raw request bodies
 * as `fields` — these lines reach the Workers Logs UI. Log identifiers and counts, not credentials.
 */

/** Structured fields merged into the JSON line alongside `level` and `msg`. */
type Fields = Record<string, unknown>;

export const log = {
    /** Happy-path / liveness event, e.g. a results-sync summary (→ `console.log`). */
    info: (msg: string, fields?: Fields): void => console.log(JSON.stringify({ level: 'info', msg, ...fields })),
    /** Recoverable degradation — an external fetch failed but the run carried on (→ `console.warn`). */
    warn: (msg: string, fields?: Fields): void => console.warn(JSON.stringify({ level: 'warn', msg, ...fields })),
    /** A handled failure worth investigating (→ `console.error`). */
    error: (msg: string, fields?: Fields): void => console.error(JSON.stringify({ level: 'error', msg, ...fields })),
};
