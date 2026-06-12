/**
 * MCP method dispatcher — turns one parsed JSON-RPC message into a response.
 *
 * Handles the stateless subset of MCP this server needs: `initialize`, `notifications/initialized`
 * (and any other notification), `tools/list`, `tools/call`, and `ping`. Tool-level failures
 * (locked match, validation) surface as `isError` tool *results*; only protocol faults (bad params,
 * unknown method/tool) use JSON-RPC error codes. Unexpected handler throws propagate to the route's
 * `app.onError`, which logs the cause and returns the standard error envelope.
 */

import { parseMessage, rpcError, rpcResult, RPC_ERROR } from '@api/mcp/jsonrpc';
import { findTool, toolDefinitions, type ToolContext } from '@api/mcp/tools';

/**
 * MCP protocol version advertised when the client omits one. When the client sends a
 * `protocolVersion`, we echo it back (standard interop behavior) so the client negotiates the
 * version it asked for. The JSON-RPC contract is covered by the MCP E2E spec; the live handshake
 * with Claude Code is the manual `claude mcp add` connect step in the plan's verification.
 */
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

/** Server identity returned from `initialize`. `version` is informational for MCP clients. */
export const SERVER_INFO = { name: 'football-pool', version: '1.0.0' } as const;

/**
 * Instructions surfaced to the MCP client at `initialize`. The connection is bound to one specific
 * player by its bearer token; the model must learn that identity from `get_my_entry`, not guess it
 * from the server name or game id (which caused it to address users by the wrong name).
 */
export const SERVER_INSTRUCTIONS =
    'You are acting as one specific player in a FIFA World Cup prediction pool, identified by your connection token — not by the server name or game id. Before addressing the user by name or reporting their standing, call get_my_entry to learn your player id and display name, and use the `you` flag on get_leaderboard rows to find your own row and rank. Never infer the player from the server name.';

/** One HTTP-shaped outcome: 200 with a JSON-RPC body, or 202 with no body (a notification). */
export type RpcOutcome = { status: 200 | 202; body: object | null };

function initializeResult(params: unknown): object {
    const requested =
        typeof params === 'object' && params !== null && typeof (params as Record<string, unknown>).protocolVersion === 'string'
            ? ((params as Record<string, unknown>).protocolVersion as string)
            : DEFAULT_PROTOCOL_VERSION;

    return { protocolVersion: requested, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS };
}

async function handleToolCall(id: string | number | null, params: unknown, ctx: ToolContext): Promise<object> {
    if (typeof params !== 'object' || params === null) {
        return rpcError(id, RPC_ERROR.INVALID_PARAMS, 'Invalid params');
    }
    const { name, arguments: rawArgs } = params as { name?: unknown; arguments?: unknown };
    if (typeof name !== 'string') return rpcError(id, RPC_ERROR.INVALID_PARAMS, 'tool name is required');
    const tool = findTool(name);
    if (!tool) return rpcError(id, RPC_ERROR.INVALID_PARAMS, `Unknown tool: ${name}`);
    const args = typeof rawArgs === 'object' && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};

    return rpcResult(id, await tool.handler(args, ctx));
}

/**
 * Parse and dispatch one raw JSON-RPC request body. Returns the HTTP status and JSON body the
 * route should send. A notification yields `{ status: 202, body: null }`.
 */
export async function handleRpc(raw: string, ctx: ToolContext): Promise<RpcOutcome> {
    const parsed = parseMessage(raw);
    if (parsed.kind === 'error') return { status: 200, body: rpcError(parsed.id, parsed.code, parsed.message) };
    if (parsed.kind === 'notification') return { status: 202, body: null };

    const { id, method, params } = parsed;
    switch (method) {
        case 'initialize':
            return { status: 200, body: rpcResult(id, initializeResult(params)) };
        case 'ping':
            return { status: 200, body: rpcResult(id, {}) };
        case 'tools/list':
            return { status: 200, body: rpcResult(id, { tools: toolDefinitions() }) };
        case 'tools/call':
            return { status: 200, body: await handleToolCall(id, params, ctx) };
        default:
            return { status: 200, body: rpcError(id, RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`) };
    }
}
