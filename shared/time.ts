/**
 * Display-time formatting. Match kickoffs are stored in UTC; these helpers render them in the
 * viewer's own browser locale and time zone by default, so a friend in Brazil sees BRT while one
 * in California sees PT. Tests (and any caller needing a fixed zone) can pin the zone/locale via
 * the optional {@link KickoffFormatOptions}.
 */

/** Overrides for the viewer's resolved locale/zone. Omit a field to use the runtime default. */
export type KickoffFormatOptions = {
    locale?: string;
    timeZone?: string;
};

type FormatterKind = 'full' | 'date' | 'time';

const PARTS: Record<FormatterKind, Intl.DateTimeFormatOptions> = {
    full: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
    date: { weekday: 'short', month: 'short', day: 'numeric' },
    time: { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Build (and memoize) an `Intl.DateTimeFormat` for a kind + zone/locale combination. */
function getFormatter(kind: FormatterKind, opts: KickoffFormatOptions): Intl.DateTimeFormat {
    const key = `${kind}|${opts.locale ?? ''}|${opts.timeZone ?? ''}`;
    let formatter = formatterCache.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(opts.locale, { timeZone: opts.timeZone, ...PARTS[kind] });
        formatterCache.set(key, formatter);
    }

    return formatter;
}

/**
 * Format an ISO 8601 UTC kickoff timestamp with weekday, date, time, and zone label.
 *
 * Example (viewer in Los Angeles): `formatKickoff('2026-06-11T19:00:00Z')` → `"Thu, Jun 11, 12:00 PM PDT"`.
 */
export function formatKickoff(isoUtc: string, opts: KickoffFormatOptions = {}): string {
    return getFormatter('full', opts).format(new Date(isoUtc));
}

/** Date portion only (e.g. `"Thu, Jun 11"`). Doubles as a per-day group key — buckets follow the viewer's zone. */
export function formatKickoffDate(isoUtc: string, opts: KickoffFormatOptions = {}): string {
    return getFormatter('date', opts).format(new Date(isoUtc));
}

/** Time portion only, with the zone label (e.g. `"12:00 PM PDT"`). */
export function formatKickoffTime(isoUtc: string, opts: KickoffFormatOptions = {}): string {
    return getFormatter('time', opts).format(new Date(isoUtc));
}
