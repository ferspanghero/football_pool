/**
 * Bracket resolution: derives knockout-stage matchups from group standings and
 * recorded results. Pure functions — no I/O.
 */

import type {
    BracketSlot,
    GroupLetter,
    GroupMatch,
    KnockoutMatch,
    Match,
    MatchId,
    Score,
    Team,
    TeamId,
} from '@shared/types';
import { isGroupMatch, isKnockoutMatch, phaseOrder } from '@shared/phases';

/**
 * Per-team standing within a group. Invariants:
 *   - `played = wins + draws + losses`
 *   - `points = wins * 3 + draws`
 *   - `goalDifference = goalsFor - goalsAgainst`
 *   - `rank` is the team's position 1-4 within the group, ordered by points → GD → GF →
 *     team name (alphabetical fallback — v1 simplification of FIFA's head-to-head rule).
 */
export type GroupStanding = {
    teamId: TeamId;
    rank: 1 | 2 | 3 | 4;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
};

type Stats = Omit<GroupStanding, 'rank'>;

function emptyStats(teamId: TeamId): Stats {
    return {
        teamId,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
    };
}

function applyResult(home: Stats, away: Stats, score: Score): void {
    home.played++;
    away.played++;
    home.goalsFor += score.home;
    home.goalsAgainst += score.away;
    away.goalsFor += score.away;
    away.goalsAgainst += score.home;

    if (score.home > score.away) {
        home.wins++;
        home.points += 3;
        away.losses++;
    } else if (score.home < score.away) {
        away.wins++;
        away.points += 3;
        home.losses++;
    } else {
        home.draws++;
        away.draws++;
        home.points += 1;
        away.points += 1;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
}

function compareStandings(a: Stats, b: Stats, nameByTeamId: ReadonlyMap<TeamId, string>): number {
    if (a.points !== b.points) return b.points - a.points;
    if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;

    const aName = nameByTeamId.get(a.teamId) ?? a.teamId;
    const bName = nameByTeamId.get(b.teamId) ?? b.teamId;

    return aName.localeCompare(bName);
}

/**
 * Compute the standings for a single group given recorded results.
 *
 * Matches without a recorded result are skipped (their teams' stats stay at zero for those
 * fixtures). When all 6 matches are recorded, the returned array's `[0]` and `[1]` are the
 * group winner and runner-up; `[2]` is the third-placed team eligible for `bestThirds`.
 */
export function groupStandings(
    teams: ReadonlyArray<Team>,
    matches: ReadonlyArray<GroupMatch>,
    results: ReadonlyMap<MatchId, Score>,
): GroupStanding[] {
    if (teams.length !== 4) {
        throw new Error(`groupStandings expects 4 teams, got ${teams.length}`);
    }

    const statsByTeam = new Map<TeamId, Stats>();
    for (const t of teams) {
        statsByTeam.set(t.id, emptyStats(t.id));
    }

    for (const m of matches) {
        const score = results.get(m.id);
        if (!score) continue;
        const home = statsByTeam.get(m.homeTeamId);
        const away = statsByTeam.get(m.awayTeamId);
        if (!home || !away) continue;
        applyResult(home, away, score);
    }

    const nameByTeamId = new Map(teams.map((t): [TeamId, string] => [t.id, t.name]));
    const sorted = Array.from(statsByTeam.values()).sort((a, b) => compareStandings(a, b, nameByTeamId));

    return sorted.map((s, i) => ({ ...s, rank: (i + 1) as 1 | 2 | 3 | 4 }));
}

/**
 * Returns the top-ranked 3rd-placed teams across all groups, up to 8 entries.
 *
 * Only groups with all 6 matches recorded contribute a candidate. Ranking uses the same
 * comparator as `groupStandings` (points → GD → GF → name). Returns fewer than 8 entries
 * when fewer than 8 groups are complete.
 */
export function bestThirds(
    teams: ReadonlyArray<Team>,
    matches: ReadonlyArray<GroupMatch>,
    results: ReadonlyMap<MatchId, Score>,
): GroupStanding[] {
    const groupLetters = Array.from(new Set(teams.map((t) => t.group))) as GroupLetter[];
    const thirds: GroupStanding[] = [];

    for (const letter of groupLetters) {
        const groupTeams = teams.filter((t) => t.group === letter);
        const groupMatches = matches.filter((m) => m.group === letter);
        const allDone = groupMatches.length > 0 && groupMatches.every((m) => results.has(m.id));
        if (!allDone) continue;
        const standings = groupStandings(groupTeams, groupMatches, results);
        const third = standings.find((s) => s.rank === 3);
        if (third) thirds.push(third);
    }

    const nameByTeamId = new Map(teams.map((t): [TeamId, string] => [t.id, t.name]));
    thirds.sort((a, b) => compareStandings(a, b, nameByTeamId));

    return thirds.slice(0, 8);
}

type ResolvedMatch = { homeTeamId: TeamId; awayTeamId: TeamId };

/**
 * Resolve every knockout match's home/away teams given current results.
 *
 * Returns a map keyed by match id. A value of `undefined` means the match isn't yet
 * fully determined (e.g., its feeder group has unfinished fixtures, or its feeder
 * knockout match ended in a draw at 90 minutes).
 *
 * BEST_THIRD_OF assignment uses a greedy algorithm (v1 simplification — see plan.md).
 * It may leave one slot unfilled in pathological tie scenarios; this is acceptable for
 * the friends-pool scope and can be replaced by FIFA's official lookup table later.
 */
export function resolveBracket(
    teams: ReadonlyArray<Team>,
    matches: ReadonlyArray<Match>,
    results: ReadonlyMap<MatchId, Score>,
): Map<MatchId, ResolvedMatch | undefined> {
    const out = new Map<MatchId, ResolvedMatch | undefined>();
    const groupMatches = matches.filter(isGroupMatch);
    const knockoutMatches: KnockoutMatch[] = matches.filter(isKnockoutMatch);

    // The greedy BEST_THIRD_OF assignment keys by matchId only; if a match had BEST_THIRD_OF
    // on both sides the second push would silently overwrite the first. FIFA's bracket never
    // does this, but assert to fail loudly if the data file ever drifts.
    for (const m of knockoutMatches) {
        if (m.homeSlot.kind === 'BEST_THIRD_OF' && m.awaySlot.kind === 'BEST_THIRD_OF') {
            throw new Error(`Match ${m.id} has BEST_THIRD_OF on both sides; not supported by v1 resolver`);
        }
    }
    const groupLetters = Array.from(new Set(teams.map((t) => t.group))) as GroupLetter[];

    const standingsByGroup = new Map<GroupLetter, GroupStanding[]>();
    for (const letter of groupLetters) {
        const groupTeams = teams.filter((t) => t.group === letter);
        const matchesInGroup = groupMatches.filter((m) => m.group === letter);
        if (matchesInGroup.length > 0 && matchesInGroup.every((m) => results.has(m.id))) {
            standingsByGroup.set(letter, groupStandings(groupTeams, matchesInGroup, results));
        }
    }

    const groupByTeamId = new Map(teams.map((t): [TeamId, GroupLetter] => [t.id, t.group]));
    const thirdsList = bestThirds(teams, groupMatches, results);
    const slotAssignments = new Map<MatchId, TeamId>();

    if (thirdsList.length === 8) {
        const rankByGroup = new Map<GroupLetter, number>();
        const teamIdByGroup = new Map<GroupLetter, TeamId>();
        for (let i = 0; i < thirdsList.length; i++) {
            const third = thirdsList[i]!;
            const group = groupByTeamId.get(third.teamId);
            if (!group) continue;
            rankByGroup.set(group, i);
            teamIdByGroup.set(group, third.teamId);
        }

        const slotsToFill = knockoutMatches
            .flatMap((m) => {
                const slots: { matchId: MatchId; eligible: ReadonlyArray<GroupLetter> }[] = [];
                if (m.homeSlot.kind === 'BEST_THIRD_OF') {
                    slots.push({ matchId: m.id, eligible: m.homeSlot.eligibleGroups });
                }
                if (m.awaySlot.kind === 'BEST_THIRD_OF') {
                    slots.push({ matchId: m.id, eligible: m.awaySlot.eligibleGroups });
                }
                return slots;
            })
            .sort((a, b) => a.matchId.localeCompare(b.matchId));

        const available = new Set(teamIdByGroup.keys());
        for (const { matchId, eligible } of slotsToFill) {
            let pickGroup: GroupLetter | undefined;
            let pickRank = Infinity;
            for (const group of available) {
                if (!eligible.includes(group)) continue;
                const rank = rankByGroup.get(group) ?? Infinity;
                if (rank < pickRank) {
                    pickRank = rank;
                    pickGroup = group;
                }
            }
            if (pickGroup) {
                const teamId = teamIdByGroup.get(pickGroup);
                if (teamId) slotAssignments.set(matchId, teamId);
                available.delete(pickGroup);
            }
        }
    }

    function resolveSlot(slot: BracketSlot, ownerMatchId: MatchId): TeamId | undefined {
        if (slot.kind === 'GROUP_WINNER') {
            return standingsByGroup.get(slot.group)?.[0]?.teamId;
        }
        if (slot.kind === 'GROUP_RUNNER_UP') {
            return standingsByGroup.get(slot.group)?.[1]?.teamId;
        }
        if (slot.kind === 'BEST_THIRD_OF') {
            return slotAssignments.get(ownerMatchId);
        }
        const feederMatch = out.get(slot.matchId);
        const feederScore = results.get(slot.matchId);
        if (!feederMatch || !feederScore) return undefined;

        if (feederScore.home > feederScore.away) {
            return slot.kind === 'KNOCKOUT_WINNER' ? feederMatch.homeTeamId : feederMatch.awayTeamId;
        }
        if (feederScore.away > feederScore.home) {
            return slot.kind === 'KNOCKOUT_WINNER' ? feederMatch.awayTeamId : feederMatch.homeTeamId;
        }
        return undefined;
    }

    const ordered = [...knockoutMatches].sort((a, b) => {
        const phaseDiff = phaseOrder(a.phase) - phaseOrder(b.phase);
        if (phaseDiff !== 0) return phaseDiff;
        return a.id.localeCompare(b.id);
    });

    for (const m of ordered) {
        const home = resolveSlot(m.homeSlot, m.id);
        const away = resolveSlot(m.awaySlot, m.id);
        out.set(m.id, home !== undefined && away !== undefined ? { homeTeamId: home, awayTeamId: away } : undefined);
    }

    return out;
}
