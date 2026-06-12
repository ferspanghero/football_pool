# v3 Tasks — MCP Server for LLM-Driven Predictions

Each maps to a step in `plan.md`. Unit scenario ids (`U*`) and E2E ids (`E2E-MCP*`) are defined in
`plan.md` § Test Scenarios.

## MCP protocol layer

- [x] **RPC1**: `api/mcp/jsonrpc.ts` — `parseRequest`, `result`/`error` builders, JSON-RPC 2.0 error codes. (U4)
- [x] **RPC2**: `api/mcp/server.ts` — `dispatch(message, ctx)` for `initialize` / `notifications/initialized` / `tools/list` / `tools/call` / `ping`; tool faults → `isError` result, protocol faults → JSON-RPC error. (U1–U6)

## Auth & token

- [x] **AUTH1**: `api/middleware.ts` — `requireMcpPlayer` reads `Authorization: Bearer`, verifies via `verifyCookie`, sets `playerId`/`gameId`; 401 on missing/malformed/expired. (U7–U8)
- [x] **AUTH2**: `api/routes/mcp.ts` — `POST /mcp/token` (requirePlayer cookie) mints `signCookie({sub,gid,exp:+60d})`, returns `{ token, expiresAt }`. (U9)

## Read tools

- [x] **TR1**: `list_matches` handler + definition — fixtures with team labels, `teamsResolved`, `locked`, inlined own pick + result. (U10)
- [x] **TR2**: `get_my_entry` handler + definition — predictions + champion + boosts. (U11)
- [x] **TR3**: `get_leaderboard` handler + definition — leaderboard rows for the token's game. (U12)

## Shared write services (refactor + new)

- [x] **SVC1**: `api/services/predictions.ts` — `submitPrediction` / `setChampion` / `setBoost` orchestrators returning `{ok} | {error:{code,message}}`.
- [x] **SVC2**: Refactor `api/routes/predictions.ts` to call the services (behavior-preserving); existing route tests stay green. (U19)

## Write tools

- [x] **TW1**: `submit_prediction` handler + definition (calls `submitPrediction`). (U13–U16)
- [x] **TW2**: `set_champion` handler + definition (calls `setChampion`). (U17)
- [x] **TW3**: `set_boost` handler + definition (calls `setBoost`). (U18)
- [x] **TW4**: Injection-safety test — stray `playerId`/`gameId` in `arguments` ignored; write uses token scope. (U20)

## Route wiring

- [x] **API1**: `api/routes/mcp.ts` — `POST /mcp` (requireMcpPlayer) → `dispatch`, returns JSON / 202 for notifications.
- [x] **API2**: `api/app.ts` — `app.route('/api', mcpRoutes)`.

## SPA panel

- [x] **UI1**: `src/api-client.ts` — `createMcpToken()`.
- [x] **UI2**: `src/routes/Connect.tsx` — "Connect your LLM" panel: mint token, render copy-paste `claude mcp add` command + expiry + *Copy*; nav link; dark-skin parity.

## E2E & verification

- [x] **E1**: `tst/e2e/mcp.spec.ts` — connect & predict end-to-end; locked-after-kickoff rejection; cleanup. (E2E-MCP1)
- [x] **E2**: `tst/e2e/mcp.spec.ts` — no/invalid bearer → 401. (E2E-MCP2)
- [x] **V1**: `npm run check` green; `npx playwright test` green; ≥90% line+branch on `api/` (incl. `api/mcp`, `api/services`).

## Publish (Phase 6)

- [x] **DOC1**: `create-readme` — document the MCP connect flow + tool surface.
- [x] **DOC2**: `create-claude-md` — note the `/api/mcp` server, token auth, and the shared write-services seam.
