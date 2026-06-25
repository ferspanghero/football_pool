/**
 * ESPN adapter (BL4) — the sole source of recorded results, using ESPN's unofficial, key-less feed.
 *
 * Produces each finished match's **90-minute** score and first-scorer:
 *  - **Score:** for a match decided in regulation, ESPN's headline score *is* the 90-minute score.
 *    For a match that went to extra time / penalties (status `AET`/`PEN`), the headline includes
 *    those goals, so the 90-minute score is reconstructed by counting goals in periods 1–2.
 *  - **First-scorer:** forced by the score when one side (or neither) scored; otherwise the first
 *    regulation goal's side — trusted only when the regulation goal count reconciles with the
 *    90-minute score (a guard against an incomplete `keyEvents` list), else left for the admin.
 *
 * A goal is any `keyEvents` entry with `scoringPlay === true` that is not a shootout penalty —
 * robust across ESPN's goal-type strings (`Goal`, `Goal - Header`, `Penalty - Scored`, `Own Goal`,
 * …). Own goals are credited to the side that benefits, so all goals map uniformly to the side whose
 * score rose. ESPN team abbreviations equal our `TeamId`s, so no code reconciliation is needed.
 */

import { log } from '@api/log';
import type { FirstScorer, Score, TeamId } from '@shared/types';

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';
// ESPN's scoreboard caps each response at ~100 events, so query in windows this many days wide.
const RANGE_DAYS = 5;

type EspnCompetitor = { homeAway?: string; score?: string | number; team?: { id?: string; abbreviation?: string } };
type EspnStatus = { type?: { name?: string; completed?: boolean } };
type EspnSummary = {
    header?: { competitions?: Array<{ status?: EspnStatus; competitors?: EspnCompetitor[] }> };
    keyEvents?: Array<{ scoringPlay?: boolean; shootout?: boolean; period?: { number?: number }; team?: { id?: string } | null }>;
};
type EspnEvent = { id?: string; date?: string; status?: EspnStatus; competitions?: Array<{ competitors?: EspnCompetitor[] }> };
type EspnScoreboard = { events?: EspnEvent[] };

/** A finished match's 90-minute result, in ESPN's home/away orientation. */
export type EspnResult = {
    homeTeamCode: TeamId;
    awayTeamCode: TeamId;
    /** 90-minute score (extra time / penalties excluded). */
    score: Score;
    /** First-scorer side, or undefined when it could not be determined safely. */
    firstScorer?: FirstScorer | undefined;
};

/**
 * A scheduled fixture's teams as ESPN lists them, used to resolve knockout pairings (v4). The codes
 * are ESPN's team abbreviations **as-is** — a real `TeamId` once a side is decided, or a placeholder
 * pseudo-code (`2A`, `1F`, `3RD`, …) while it is undecided. The bracket sync keeps only the fixtures
 * whose codes are both real teams.
 */
export type EspnFixture = {
    /** ESPN's scheduled kickoff instant (ISO UTC), used to map the fixture to our schedule. */
    kickoffUtc: string;
    homeTeamCode: TeamId;
    awayTeamCode: TeamId;
};

/** A minimal `fetch`-like dependency, so the network call can be faked in tests. */
export type FetchLike = (url: string) => Promise<{ json: () => Promise<unknown> }>;

/** The UTC calendar date of a kickoff, as ESPN's `dates=YYYYMMDD` scoreboard parameter. */
export function espnDateFromKickoff(kickoffUtc: string): string {
    return kickoffUtc.slice(0, 10).replace(/-/g, '');
}

const parseYmd = (s: string): Date => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
const fmtYmd = (d: Date): string =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const DAY_MS = 86_400_000;

/** Shift a `YYYYMMDD` date by `days` (may be negative). */
export function shiftYmd(ymd: string, days: number): string {
    return fmtYmd(new Date(parseYmd(ymd).getTime() + days * DAY_MS));
}

/** Split an inclusive `[start, end]` date span into `RANGE_DAYS`-wide scoreboard query windows. */
export function dateRangeWindows(start: string, end: string): Array<[string, string]> {
    const windows: Array<[string, string]> = [];
    let from = parseYmd(start);
    const last = parseYmd(end);
    while (from.getTime() <= last.getTime()) {
        const to = new Date(Math.min(last.getTime(), from.getTime() + (RANGE_DAYS - 1) * DAY_MS));
        windows.push([fmtYmd(from), fmtYmd(to)]);
        from = new Date(to.getTime() + DAY_MS);
    }

    return windows;
}

/** First-scorer the score alone fixes: `NONE` for 0-0, the lone side for a one-sided result, else undefined. */
function firstScorerFromScore(score: Score): FirstScorer | undefined {
    if (score.home === 0 && score.away === 0) return 'NONE';
    if (score.away === 0) return 'HOME';
    if (score.home === 0) return 'AWAY';

    return undefined;
}

const isGoal = (e: { scoringPlay?: boolean; shootout?: boolean; team?: { id?: string } | null }): boolean =>
    e.scoringPlay === true && !e.shootout && !!e.team?.id;

function competitorPair(
    competitors: EspnCompetitor[],
): { home: EspnCompetitor; away: EspnCompetitor } | null {
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) return null;

    return { home, away };
}

/**
 * Derive the 90-minute result from an ESPN match summary, or `null` if its teams can't be read.
 * Reconstructs the 90-minute score for extra-time / penalty matches; otherwise uses the headline.
 */
export function extractFromSummary(summary: unknown): EspnResult | null {
    const comp = (summary as EspnSummary)?.header?.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const pair = competitorPair(competitors);
    if (!pair) return null;
    const { home, away } = pair;
    const statusName = comp?.status?.type?.name ?? '';

    const goals = ((summary as EspnSummary).keyEvents ?? []).filter(isGoal);
    const idToSide = (id: string | undefined): FirstScorer | undefined =>
        id === home.team!.id ? 'HOME' : id === away.team!.id ? 'AWAY' : undefined;
    const regulation = goals.filter((g) => (g.period?.number ?? 99) <= 2);
    let regHome = 0;
    let regAway = 0;
    for (const g of regulation) {
        const side = idToSide(g.team!.id);
        if (side === 'HOME') regHome++;
        else if (side === 'AWAY') regAway++;
    }

    const wentBeyond90 = /AET|PEN/i.test(statusName) || goals.some((g) => (g.period?.number ?? 0) >= 3);
    const score: Score = wentBeyond90
        ? { home: regHome, away: regAway }
        : { home: Number(home.score), away: Number(away.score) };

    let firstScorer = firstScorerFromScore(score);
    if (firstScorer === undefined) {
        // Both sides scored: trust the first regulation goal only if the regulation count reconciles
        // with the 90-minute score (guards against an incomplete keyEvents list).
        const consistent = regHome === score.home && regAway === score.away;
        firstScorer = consistent && regulation[0] ? idToSide(regulation[0].team!.id) : undefined;
    }

    return { homeTeamCode: home.team!.abbreviation!, awayTeamCode: away.team!.abbreviation!, score, firstScorer };
}

/** A finished scoreboard event's teams + headline score + whether it went past 90 minutes. */
function parseScoreboardEvent(
    event: EspnEvent,
): { id: string; homeTeamCode: TeamId; awayTeamCode: TeamId; headline: Score; beyond90: boolean } | null {
    if (!event.id || event.status?.type?.completed !== true) return null;
    const pair = competitorPair(event.competitions?.[0]?.competitors ?? []);
    if (!pair) return null;

    return {
        id: event.id,
        homeTeamCode: pair.home.team!.abbreviation!,
        awayTeamCode: pair.away.team!.abbreviation!,
        headline: { home: Number(pair.home.score), away: Number(pair.away.score) },
        beyond90: /AET|PEN/i.test(event.status?.type?.name ?? ''),
    };
}

/**
 * Fetch every finished match's 90-minute result across `[startDate, endDate]` (YYYYMMDD). Queries
 * the scoreboard in capped windows; fetches a match summary only when one is needed (extra-time
 * reconstruction, or first-scorer for a both-scored match). A summary failure degrades gracefully:
 * a regulation match still yields its headline score (first-scorer left for the admin); an
 * extra-time match is skipped so a wrong 90-minute score is never written.
 */
export async function fetchFinishedResults(fetchFn: FetchLike, startDate: string, endDate: string): Promise<EspnResult[]> {
    const out: EspnResult[] = [];
    const seen = new Set<string>();
    for (const [from, to] of dateRangeWindows(startDate, endDate)) {
        let board: EspnScoreboard;
        try {
            board = (await (await fetchFn(`${SCOREBOARD_URL}?dates=${from}-${to}`)).json()) as EspnScoreboard;
        } catch (err) {
            // Transient ESPN/network failure for this window — skip it; a later sync retries. Surface
            // it so a feed outage or shape change is visible rather than silently swallowed.
            log.warn('espn scoreboard fetch failed', { window: `${from}-${to}`, err: String(err) });
            continue;
        }
        for (const event of board.events ?? []) {
            const base = parseScoreboardEvent(event);
            if (!base || seen.has(base.id)) continue;
            seen.add(base.id);
            const bothScored = base.headline.home > 0 && base.headline.away > 0;
            if (!base.beyond90 && !bothScored) {
                out.push({
                    homeTeamCode: base.homeTeamCode,
                    awayTeamCode: base.awayTeamCode,
                    score: base.headline,
                    firstScorer: firstScorerFromScore(base.headline),
                });
                continue;
            }
            let summary: unknown;
            try {
                summary = await (await fetchFn(`${SUMMARY_URL}?event=${base.id}`)).json();
            } catch (err) {
                // Summary fetch failed — degrade per the rules above (regulation keeps its headline,
                // extra-time is skipped). Surface it so a feed issue isn't invisible.
                log.warn('espn summary fetch failed', { eventId: base.id, err: String(err) });
                summary = undefined;
            }
            const resolved = summary ? extractFromSummary(summary) : null;
            if (resolved) {
                out.push(resolved);
            } else if (!base.beyond90) {
                // Regulation match with no usable summary: the headline is the 90-minute score.
                out.push({
                    homeTeamCode: base.homeTeamCode,
                    awayTeamCode: base.awayTeamCode,
                    score: base.headline,
                    firstScorer: undefined,
                });
            }
            // else: extra-time match with no summary → skip; the next sync retries it.
        }
    }

    return out;
}

/**
 * Fetch every scheduled fixture's teams across `[startDate, endDate]` (YYYYMMDD), in ESPN's
 * home/away orientation (v4). One cheap scoreboard pass per window — no summary fetch. Emits each
 * event with a readable team pair and a kickoff date, regardless of status or whether the teams are
 * decided yet (placeholder pseudo-codes pass through); the caller filters and maps them to our
 * fixtures. A window fetch failure is logged and skipped, so a later sync retries it.
 */
export async function fetchScheduledFixtures(fetchFn: FetchLike, startDate: string, endDate: string): Promise<EspnFixture[]> {
    const out: EspnFixture[] = [];
    const seen = new Set<string>();
    for (const [from, to] of dateRangeWindows(startDate, endDate)) {
        let board: EspnScoreboard;
        try {
            board = (await (await fetchFn(`${SCOREBOARD_URL}?dates=${from}-${to}`)).json()) as EspnScoreboard;
        } catch (err) {
            log.warn('espn scoreboard fetch failed', { window: `${from}-${to}`, err: String(err) });
            continue;
        }
        for (const event of board.events ?? []) {
            if (!event.id || !event.date || seen.has(event.id)) continue;
            const pair = competitorPair(event.competitions?.[0]?.competitors ?? []);
            if (!pair) continue;
            seen.add(event.id);
            out.push({
                kickoffUtc: event.date,
                homeTeamCode: pair.home.team!.abbreviation!,
                awayTeamCode: pair.away.team!.abbreviation!,
            });
        }
    }

    return out;
}
