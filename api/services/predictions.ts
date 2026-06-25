/**
 * Player write-orchestration services — the single source of truth for the prediction,
 * champion, and boost write paths, including their kickoff locks and input validation.
 *
 * Both the HTTP routes (`api/routes/predictions.ts`) and the MCP tools (`api/mcp/tools.ts`)
 * call these, so the lock and validation rules can never drift between the two surfaces. Each
 * function takes the raw (untrusted) inputs, the injected `nowMs` clock, and the DB, and returns
 * a transport-agnostic {@link ServiceResult}; callers translate that into their own envelope
 * (an HTTP status, or an MCP `isError` tool result).
 */

import { isValidGoal, MAX_GOALS, parseFirstScorer } from '@api/http';
import { boostsRepo } from '@api/repos/boosts';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { hasResolvedTeams, PHASES } from '@shared/phases';
import { getResolvedMatches } from '@api/resolved-matches';
import { FIRST_KICKOFF_UTC, MATCHES, TEAMS } from '@data/tournament';
import type { PhaseId } from '@shared/types';

/** Coarse failure category — mirrors the existing API error taxonomy. */
export type ServiceErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN';

/** Outcome of a write service: success, or a categorized, human-readable failure. */
export type ServiceResult = { ok: true } | { ok: false; error: { code: ServiceErrorCode; message: string } };

const OK: ServiceResult = { ok: true };

function fail(code: ServiceErrorCode, message: string): ServiceResult {
    return { ok: false, error: { code, message } };
}

const MATCH_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));
const VALID_TEAM_IDS = new Set(TEAMS.map((t) => t.id));
const VALID_PHASE_IDS = new Set<string>(PHASES.map((p) => p.id));
const BOOSTABLE_PHASE_IDS = new Set<string>(PHASES.filter((p) => p.boostable).map((p) => p.id));

/**
 * Validate and persist a player's score prediction for one match. Rejects (without writing) an
 * unknown match, a knockout match whose teams are not yet resolved, a match already past kickoff,
 * out-of-range goals, or a first-scorer that is not `HOME`/`AWAY` (a player picks a side or
 * nothing — `NONE` is admin-only). `homeGoals`/`awayGoals`/`firstScorer` arrive untrusted.
 */
export async function submitPrediction(
    db: D1Database,
    nowMs: number,
    input: { playerId: number; matchId: string; homeGoals: unknown; awayGoals: unknown; firstScorer: unknown },
): Promise<ServiceResult> {
    // Resolve teams from the overlay so a knockout fixture ESPN has filled in becomes predictable.
    const match = (await getResolvedMatches(db)).find((m) => m.id === input.matchId);
    if (!match) return fail('NOT_FOUND', 'match not found');
    if (!hasResolvedTeams(match, TEAMS)) return fail('FORBIDDEN', 'match teams not assigned yet');
    if (nowMs >= Date.parse(match.kickoffUtc)) return fail('FORBIDDEN', 'prediction locked at kickoff');
    if (!isValidGoal(input.homeGoals) || !isValidGoal(input.awayGoals)) {
        return fail('VALIDATION', `homeGoals/awayGoals must be integers in [0, ${MAX_GOALS}]`);
    }
    const firstScorer = parseFirstScorer(input.firstScorer);
    if (firstScorer === 'INVALID' || firstScorer === 'NONE') {
        return fail('VALIDATION', 'firstScorer must be HOME or AWAY');
    }
    await predictionsRepo.upsert(db, {
        playerId: input.playerId,
        matchId: input.matchId,
        score: { home: input.homeGoals, away: input.awayGoals },
        firstScorer,
    });

    return OK;
}

/**
 * Validate and persist a player's champion pick. Rejected once the tournament's first kickoff has
 * passed, or when `teamId` is not a known team. `teamId` arrives untrusted.
 */
export async function setChampion(
    db: D1Database,
    nowMs: number,
    input: { playerId: number; teamId: unknown },
): Promise<ServiceResult> {
    if (nowMs >= Date.parse(FIRST_KICKOFF_UTC)) return fail('FORBIDDEN', 'champion pick locked');
    const teamId = typeof input.teamId === 'string' ? input.teamId : '';
    if (!VALID_TEAM_IDS.has(teamId)) return fail('VALIDATION', 'unknown teamId');
    await playersRepo.setChampionTeamId(db, input.playerId, teamId);

    return OK;
}

/**
 * Validate and persist (or clear) a player's per-phase boost. A null/undefined `matchId` clears the
 * phase's boost.
 *
 * The boost is locked **per target match**, not per phase: a player may set, move, or clear their
 * one boost among the matches in the phase that have not yet kicked off — even after earlier matches
 * in the same phase are done. Once the currently-boosted match kicks off the boost freezes: it can
 * no longer be moved to another match nor cleared, so a player can't retract a boost after seeing
 * how that match is going. Rejected for an unknown phase, a non-boostable phase (the single-match
 * 3rd-place and final rounds), a target match not in the phase, or a target that has already kicked
 * off. Clearing a stale boost on a non-boostable phase (which scoring ignores) is always allowed.
 * `phaseId`/`matchId` arrive untrusted.
 */
export async function setBoost(
    db: D1Database,
    nowMs: number,
    input: { playerId: number; phaseId: string; matchId: unknown },
): Promise<ServiceResult> {
    if (!VALID_PHASE_IDS.has(input.phaseId)) return fail('NOT_FOUND', 'unknown phase');
    const phaseId = input.phaseId as PhaseId;

    // The player's existing boost for this phase (if any) and whether its match has already started.
    // A started boost is frozen — it cannot be moved off or cleared.
    const current = (await boostsRepo.findByPlayer(db, input.playerId)).find((b) => b.phaseId === phaseId);
    const currentMatch = current ? MATCH_BY_ID.get(current.matchId) : undefined;
    const currentLocked = currentMatch !== undefined && nowMs >= Date.parse(currentMatch.kickoffUtc);

    if (input.matchId === null || input.matchId === undefined) {
        // Block clearing only when a live boostable boost has started; a stale row on a non-boostable
        // phase is always removable (scoring already ignores it).
        if (BOOSTABLE_PHASE_IDS.has(phaseId) && currentLocked) {
            return fail('FORBIDDEN', 'boost locked at kickoff');
        }
        await boostsRepo.clear(db, input.playerId, phaseId);

        return OK;
    }
    if (!BOOSTABLE_PHASE_IDS.has(phaseId)) return fail('FORBIDDEN', 'this phase cannot be boosted');
    if (currentLocked) return fail('FORBIDDEN', 'boost locked at kickoff');
    const match = typeof input.matchId === 'string' ? MATCH_BY_ID.get(input.matchId) : undefined;
    if (!match || match.phase !== phaseId) return fail('VALIDATION', 'match does not belong to this phase');
    if (nowMs >= Date.parse(match.kickoffUtc)) return fail('FORBIDDEN', 'boost locked at kickoff');
    await boostsRepo.set(db, { playerId: input.playerId, phaseId, matchId: match.id });

    return OK;
}
