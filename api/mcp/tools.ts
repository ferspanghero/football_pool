/**
 * MCP tool registry — the six tools an LLM can call to read fixtures/entry/leaderboard and write
 * predictions/champion/boost on behalf of the authenticated player.
 *
 * Read handlers hit repositories directly; write handlers delegate to the shared write services
 * (`api/services/predictions.ts`) so locks and validation match the HTTP routes exactly. Every
 * handler resolves the acting player and game from `ctx` (the verified token), **never** from tool
 * arguments — so a tool call can only ever read or write the token's own player/game.
 */

import { boostsRepo } from '@api/repos/boosts';
import { playersRepo } from '@api/repos/players';
import { predictionsRepo } from '@api/repos/predictions';
import { resultsRepo } from '@api/repos/results';
import { loadLeaderboard } from '@api/services/leaderboard';
import { setBoost, setChampion, submitPrediction, type ServiceResult } from '@api/services/predictions';
import { hasResolvedTeams, phaseById, PHASES } from '@shared/phases';
import { MATCHES, TEAMS } from '@data/tournament';

/** Per-request context for a tool handler — DB plus the identity resolved from the bearer token. */
export type ToolContext = { db: D1Database; playerId: number; gameId: number; nowMs: number };

/** An MCP `tools/call` result: text content block(s), optionally flagged as an error. */
export type ToolCallResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

/** Public shape of a tool advertised by `tools/list`. */
export type ToolDefinition = { name: string; description: string; inputSchema: object };

/** A registered tool: its advertised definition plus the handler that runs it. */
export type ToolEntry = ToolDefinition & {
    handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolCallResult>;
};

const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));
const PHASE_IDS = PHASES.map((p) => p.id);
const NO_ARGS = { type: 'object', properties: {}, additionalProperties: false } as const;

/** Wrap arbitrary data as a JSON text content block. */
function jsonContent(data: unknown): ToolCallResult {
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** Wrap a human-readable failure as an `isError` text result the model can read and recover from. */
function errorContent(message: string): ToolCallResult {
    return { content: [{ type: 'text', text: message }], isError: true };
}

/** Translate a write-service result into a tool result. */
function fromService(result: ServiceResult, onOk: () => unknown): ToolCallResult {
    return result.ok ? jsonContent(onOk()) : errorContent(result.error.message);
}

/** Render a match side as a resolved `{ id, name }` or an unresolved knockout placeholder label. */
function teamRef(teamId: string): { id: string; name: string } | { label: string } {
    const team = TEAM_BY_ID.get(teamId);

    return team ? { id: team.id, name: team.name } : { label: teamId };
}

export const TOOLS: ToolEntry[] = [
    {
        name: 'list_matches',
        description:
            'List every tournament fixture with its phase, kickoff time, whether it is locked (kickoff passed), whether its teams are resolved, your current prediction, and the recorded result if any. Call this first to find the matchId for a fixture before submitting a prediction.',
        inputSchema: NO_ARGS,
        handler: async (_args, ctx) => {
            const predByMatch = new Map((await predictionsRepo.findByPlayer(ctx.db, ctx.playerId)).map((p) => [p.matchId, p]));
            const resultByMatch = new Map((await resultsRepo.findAll(ctx.db)).map((r) => [r.matchId, r]));
            const matches = MATCHES.map((m) => {
                const pred = predByMatch.get(m.id);
                const result = resultByMatch.get(m.id);

                return {
                    matchId: m.id,
                    phase: m.phase,
                    phaseLabel: phaseById(m.phase).label,
                    kickoffUtc: m.kickoffUtc,
                    home: teamRef(m.homeTeamId),
                    away: teamRef(m.awayTeamId),
                    group: m.group ?? null,
                    teamsResolved: hasResolvedTeams(m, TEAMS),
                    locked: ctx.nowMs >= Date.parse(m.kickoffUtc),
                    myPrediction: pred
                        ? { homeGoals: pred.score.home, awayGoals: pred.score.away, firstScorer: pred.firstScorer ?? null }
                        : null,
                    result: result
                        ? { home: result.score.home, away: result.score.away, firstScorer: result.firstScorer ?? null }
                        : null,
                };
            });

            return jsonContent({ matches });
        },
    },
    {
        name: 'get_my_entry',
        description:
            'Get your identity and current entry: which player you are acting as (player id + display name) and your game id, plus your score predictions, champion pick, and per-phase boosts. Call this to confirm who you are before addressing the user by name.',
        inputSchema: NO_ARGS,
        handler: async (_args, ctx) => {
            const player = await playersRepo.findById(ctx.db, ctx.playerId);
            const predictions = await predictionsRepo.findByPlayer(ctx.db, ctx.playerId);
            const boosts = await boostsRepo.findByPlayer(ctx.db, ctx.playerId);

            return jsonContent({
                playerId: ctx.playerId,
                displayName: player?.displayName ?? null,
                gameId: ctx.gameId,
                predictions: predictions.map((p) => ({
                    matchId: p.matchId,
                    homeGoals: p.score.home,
                    awayGoals: p.score.away,
                    firstScorer: p.firstScorer ?? null,
                })),
                championTeamId: player?.championTeamId ?? null,
                boosts: boosts.map((b) => ({ phaseId: b.phaseId, matchId: b.matchId })),
            });
        },
    },
    {
        name: 'get_leaderboard',
        description:
            'Get the current standings for your game, sorted by total points. Each row carries its `rank` and a `you` flag marking your own row, so you can report your position accurately.',
        inputSchema: NO_ARGS,
        handler: async (_args, ctx) => {
            const rows = await loadLeaderboard(ctx.db, ctx.gameId);

            return jsonContent({
                rows: rows.map((row, i) => ({ rank: i + 1, you: row.playerId === ctx.playerId, ...row })),
            });
        },
    },
    {
        name: 'submit_prediction',
        description:
            'Submit or update your score prediction for one match. Rejected once the match has kicked off, before its teams are resolved, or with out-of-range goals. firstScorer is optional and picks the side you think scores first.',
        inputSchema: {
            type: 'object',
            properties: {
                matchId: { type: 'string', description: 'The match id from list_matches.' },
                homeGoals: { type: 'integer', minimum: 0, description: 'Predicted home-side goals.' },
                awayGoals: { type: 'integer', minimum: 0, description: 'Predicted away-side goals.' },
                firstScorer: { type: 'string', enum: ['HOME', 'AWAY'], description: 'Optional: which side scores first.' },
            },
            required: ['matchId', 'homeGoals', 'awayGoals'],
            additionalProperties: false,
        },
        handler: async (args, ctx) => {
            const matchId = typeof args.matchId === 'string' ? args.matchId : '';
            const result = await submitPrediction(ctx.db, ctx.nowMs, {
                playerId: ctx.playerId,
                matchId,
                homeGoals: args.homeGoals,
                awayGoals: args.awayGoals,
                firstScorer: args.firstScorer,
            });

            return fromService(result, () => ({ ok: true, matchId }));
        },
    },
    {
        name: 'set_champion',
        description: 'Set your one-shot tournament champion pick. Rejected once the tournament has kicked off.',
        inputSchema: {
            type: 'object',
            properties: { teamId: { type: 'string', description: 'A team id from list_matches.' } },
            required: ['teamId'],
            additionalProperties: false,
        },
        handler: async (args, ctx) => {
            const result = await setChampion(ctx.db, ctx.nowMs, { playerId: ctx.playerId, teamId: args.teamId });

            return fromService(result, () => ({ ok: true }));
        },
    },
    {
        name: 'set_boost',
        description:
            'Boost one match in a phase to double the points it earns (one boost per phase). Pass a null matchId to clear the phase boost. Rejected once the phase has started or if the match is not in the phase.',
        inputSchema: {
            type: 'object',
            properties: {
                phaseId: { type: 'string', enum: PHASE_IDS, description: 'The phase to boost in.' },
                matchId: { type: ['string', 'null'], description: 'A match in that phase, or null to clear.' },
            },
            required: ['phaseId'],
            additionalProperties: false,
        },
        handler: async (args, ctx) => {
            const phaseId = typeof args.phaseId === 'string' ? args.phaseId : '';
            const result = await setBoost(ctx.db, ctx.nowMs, { playerId: ctx.playerId, phaseId, matchId: args.matchId });

            return fromService(result, () => ({ ok: true }));
        },
    },
];

/** The public tool definitions (no handlers) for `tools/list`. */
export function toolDefinitions(): ToolDefinition[] {
    return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/** Look up a registered tool by name. */
export function findTool(name: string): ToolEntry | undefined {
    return TOOLS.find((t) => t.name === name);
}
