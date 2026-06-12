/**
 * Minimal JSON-RPC 2.0 wire helpers for the MCP server — message parsing and response-envelope
 * builders. Pure and transport-agnostic; the dispatcher (`server.ts`) and route (`routes/mcp.ts`)
 * build on these.
 */

export const JSONRPC_VERSION = '2.0';

/** Standard JSON-RPC 2.0 error codes (the subset this server emits). */
export const RPC_ERROR = {
    PARSE: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL: -32603,
} as const;

/** A JSON-RPC message id — string or number for a request, absent for a notification. */
export type JsonRpcId = string | number | null;

/**
 * Result of parsing one inbound JSON-RPC message:
 * - `request` — has a `method` and an `id`; expects a response.
 * - `notification` — has a `method` but no `id`; expects no response (HTTP 202).
 * - `error` — unparseable or structurally invalid; the server replies with a JSON-RPC error.
 */
export type ParseResult =
    | { kind: 'request'; id: JsonRpcId; method: string; params: unknown }
    | { kind: 'notification'; method: string; params: unknown }
    | { kind: 'error'; id: JsonRpcId; code: number; message: string };

/** Parse a raw request body into a {@link ParseResult}. Never throws. */
export function parseMessage(raw: string): ParseResult {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return { kind: 'error', id: null, code: RPC_ERROR.PARSE, message: 'Parse error' };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { kind: 'error', id: null, code: RPC_ERROR.INVALID_REQUEST, message: 'Invalid Request' };
    }
    const obj = value as Record<string, unknown>;
    const hasId = 'id' in obj;
    const id: JsonRpcId = typeof obj.id === 'string' || typeof obj.id === 'number' ? obj.id : null;
    if (typeof obj.method !== 'string') {
        return { kind: 'error', id: hasId ? id : null, code: RPC_ERROR.INVALID_REQUEST, message: 'Invalid Request' };
    }
    if (!hasId) {
        return { kind: 'notification', method: obj.method, params: obj.params };
    }

    return { kind: 'request', id, method: obj.method, params: obj.params };
}

/** Build a JSON-RPC success response. */
export function rpcResult(id: JsonRpcId, result: unknown): { jsonrpc: string; id: JsonRpcId; result: unknown } {
    return { jsonrpc: JSONRPC_VERSION, id, result };
}

/** Build a JSON-RPC error response. */
export function rpcError(
    id: JsonRpcId,
    code: number,
    message: string,
): { jsonrpc: string; id: JsonRpcId; error: { code: number; message: string } } {
    return { jsonrpc: JSONRPC_VERSION, id, error: { code, message } };
}
