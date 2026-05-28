/**
 * Display-time formatting. All match kickoff times are stored UTC; the frontend renders
 * them in `America/Los_Angeles` (PDT in summer 2026) so the whole friend group sees the
 * same wall-clock time regardless of where the browser is.
 */

const DISPLAY_TZ = 'America/Los_Angeles';
const FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
});
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TZ,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
});

/**
 * Format an ISO 8601 UTC kickoff timestamp for display in Pacific time.
 *
 * Example: `formatKickoff('2026-06-11T19:00:00Z')` → `"Thu, Jun 11, 12:00 PM PDT"`.
 */
export function formatKickoff(isoUtc: string): string {
    return FORMATTER.format(new Date(isoUtc));
}

/** Date portion only, in Pacific time. Example: `"Thu, Jun 11"`. Doubles as a per-day group key. */
export function formatKickoffDate(isoUtc: string): string {
    return DATE_FORMATTER.format(new Date(isoUtc));
}

/** Time portion only, in Pacific time. Example: `"12:00 PM PDT"`. */
export function formatKickoffTime(isoUtc: string): string {
    return TIME_FORMATTER.format(new Date(isoUtc));
}
