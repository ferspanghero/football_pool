# v3 Implementation Plan — MCP Server for LLM-Driven Predictions

## Goal

Let a player drive their pool entry by chatting with their own LLM in **Claude Code**, instead of
(or alongside) the web UI. The existing single Worker gains a **hand-rolled, stateless MCP server**
at `POST /api/mcp` that exposes six tools (read fixtures/entry/leaderboard, write
predictions/champion/boost). Auth reuses the **existing HMAC-signed session token** carried as an
`Authorization: Bearer` header — no new auth system, no new secret, no runtime dependency. All write
tools route through the **same lock/validation code** the HTTP routes use, so kickoff locks and
per-player scoping hold identically on both surfaces.

## User Experience

### One-time connect (per game, ~30 s)

1. Player logs into the web app as today (displayName + player password).
2. On a new **"Connect your LLM"** panel they click *Generate token*. The SPA calls
   `POST /api/mcp/token` (cookie-gated) and renders a ready-to-paste command with the token and the
   app's own origin already filled in:

   ```
   claude mcp add --transport http -s user football-pool https://<origin>/api/mcp \
     --header "Authorization: Bearer <token>"
   ```

   plus the expiry date and a *Copy* button. Password is never typed into Claude Code.
3. Player pastes the line into their terminal. Done (verify with `claude mcp list` / `/mcp`).

### Recurring use

Zero setup. In any Claude Code session: *"What are my open matches? Predict 2-1 for Brazil vs
Argentina and set Brazil as my champion."* The LLM calls the tools; Claude Code asks the player to
approve each write call (built-in human gate); the Worker enforces locks and writes for the
token's player only.

### Re-auth

The token shares the 60-day session lifetime. When it lapses, tool calls return MCP errors and the
player re-opens the panel to regenerate. The panel shows an "expires in N days" note.

### Tool surface (what the LLM sees)

| Tool | Kind | Input | Returns |
|---|---|---|---|
| `list_matches` | read | _(none)_ | per match: `matchId`, `phase`, `phaseLabel`, `kickoffUtc`, `home`/`away` (`{id,name}` or placeholder label), `group?`, `teamsResolved`, `locked`, `myPrediction` (`{homeGoals,awayGoals,firstScorer}`\|null), `result` (`{home,away,firstScorer}`\|null) |
| `get_my_entry` | read | _(none)_ | `{ predictions[], championTeamId\|null, boosts: [{phaseId,matchId}] }` |
| `submit_prediction` | write | `{ matchId, homeGoals, awayGoals, firstScorer? }` | `{ ok:true, matchId }` or `isError` |
| `set_champion` | write | `{ teamId }` | `{ ok:true }` or `isError` |
| `set_boost` | write | `{ phaseId, matchId? }` (omit/null clears) | `{ ok:true }` or `isError` |
| `get_leaderboard` | read | _(none)_ | `{ rows: LeaderboardRow[] }` for the token's game |

`submit_prediction.firstScorer` is an optional `"HOME"|"AWAY"` (mirrors the web form; `NONE` is
admin-only and rejected). Tool outputs are JSON-encoded text content blocks.

## Architecture

```
Claude Code ──HTTP POST /api/mcp──────────────────────────────────────────┐
  Authorization: Bearer <signed session token>   (JSON-RPC 2.0 body)       │
        │                                                                   ▼
        │                         requireMcpPlayer (api/middleware.ts)
        │                           verifyCookie(token) → { sub, gid, exp }
        │                           sets c.playerId = sub, c.gameId = gid   ← identity from TOKEN,
        ▼                                                                      never from arguments
  api/routes/mcp.ts  POST /mcp ──► dispatch(message, ctx)  (api/mcp/server.ts)
        │                              initialize | notifications/initialized | tools/list
        │                              | tools/call | ping     (api/mcp/jsonrpc.ts envelopes)
        │                                     │
        │                              tools/call → registry (api/mcp/tools.ts)
        │                                     │   handler(args, ctx{ db, playerId, gameId, clock })
        ▼                                     ▼
  POST /mcp/token (requirePlayer, COOKIE)   read tools → repos directly
  mints Bearer = signCookie({sub,gid,exp})  write tools → api/services/* (shared with HTTP routes)
```

Two seams make this safe and DRY:

- **Identity from the token.** Every handler reads `ctx.playerId`/`ctx.gameId` (the verified `sub`/
  `gid`). **No tool schema accepts a target-player or target-game field**, so a prompt injection has
  no lever to read or write another player's data. The only cross-player tool, `get_leaderboard`, is
  standings already shared within the game.
- **One lock authority.** The kickoff/first-kickoff/phase-first-kickoff lock checks + validation move
  into pure orchestrators in `api/services/` returning a typed result. The HTTP prediction routes are
  refactored to call them (behavior-preserving), and the MCP write tools call the *same* functions.
  Locks cannot drift between the two surfaces.

The hand-rolled layer is JSON-RPC 2.0 + five methods; responds `application/json` (no SSE — every
tool is request/response). Stateless: no session/Durable-Object state. Zero new runtime dependency.

## MCP protocol layer (`api/mcp/`)

### `jsonrpc.ts` — wire envelopes (pure)
- `parseRequest(raw)` → a JSON-RPC request/notification, or a parse-error sentinel.
- `result(id, payload)` / `error(id, code, message, data?)` builders.
- Error codes: `-32700` parse, `-32600` invalid request, `-32601` method not found, `-32602`
  invalid params, `-32603` internal.

### `server.ts` — dispatcher (deps injected)
- `dispatch(message, ctx)`:
  - `initialize` → `{ protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "football-pool", version } }`. Advertise one supported MCP protocol version; pinned against Claude Code's real handshake in E2E.
  - `notifications/initialized` (and any notification: no `id`) → no JSON-RPC body; route returns **HTTP 202**.
  - `tools/list` → `{ tools: [ {name, description, inputSchema} ] }` from the registry.
  - `tools/call` → `{ name, arguments }`: unknown name → JSON-RPC `-32602`; otherwise run the
    handler and wrap as `{ content: [{type:"text", text}], isError? }`. **Tool-level failures
    (locked, validation, not-found) are `isError:true` results, not JSON-RPC errors** — only
    protocol faults use JSON-RPC error codes.
  - `ping` → `{}`. Unknown method → `-32601`.

### `tools.ts` — registry: definitions + handlers
Each entry: `{ name, description, inputSchema (JSON Schema), handler(args, ctx) }`. Read handlers hit
repos directly; write handlers call `api/services/*` and translate the typed result into a tool
result. Descriptions are prescriptive about *when* to call (helps the model pick correctly).

## Shared write services (`api/services/`)
Behavior-preserving extraction of the current inline route logic into pure orchestrators returning
`{ ok: true } | { error: { code, message } }` (code ∈ existing taxonomy: `VALIDATION`,
`NOT_FOUND`, `FORBIDDEN`):

- `submitPrediction(db, clock, { playerId, matchId, homeGoals, awayGoals, firstScorer })` — match
  exists → `hasResolvedTeams` → kickoff lock → goal range `[0,99]` → firstScorer `HOME|AWAY|absent`
  (reject `NONE`/invalid) → `predictionsRepo.upsert`.
- `setChampion(db, clock, { playerId, teamId })` — first-kickoff lock → valid `teamId` →
  `playersRepo.setChampionTeamId`.
- `setBoost(db, clock, { playerId, phaseId, matchId })` — phase exists → phase-first-kickoff lock →
  `matchId` null clears, else must belong to phase → `boostsRepo.set`/`clear`.

`api/routes/predictions.ts` becomes a thin adapter: parse body → call service → map
`{error}` to the HTTP envelope/status, `{ok}` to `200`.

## Auth & token (`api/middleware.ts`, `api/routes/mcp.ts`)
- `requireMcpPlayer` — reads `Authorization: Bearer <token>`, verifies with the existing
  `verifyCookie(token, SESSION_SECRET, clock())`, narrows to `{ sub, gid, exp }`, sets
  `playerId`/`gameId`. Missing/malformed/expired/invalid → `401` `UNAUTHENTICATED`. Browser routes
  stay cookie-only — `SameSite` CSRF posture untouched.
- `POST /api/mcp/token` (gated by the existing cookie `requirePlayer`) — mints
  `signCookie({ sub: playerId, gid: gameId, exp: now + 60d }, SESSION_SECRET)`; returns
  `{ token, expiresAt }`. The SPA assembles the `claude mcp add` command from its own origin.

## SPA panel (`src/`)
- `src/api-client.ts` — `createMcpToken()` → `POST /api/mcp/token`.
- A "Connect your LLM" panel (reachable from the header/landing once logged in) that mints a token,
  renders the copy-paste `claude mcp add` command + expiry, with a *Copy* button and a one-line
  "what is this" explainer. Dark-skin CSS parity per [[project_dark_theme_mobile_cards]].

## File Manifest
```
api/
  mcp/
    jsonrpc.ts        (new) JSON-RPC 2.0 envelopes + error codes
    server.ts         (new) method dispatcher
    tools.ts          (new) 6-tool registry: definitions + handlers
  services/
    predictions.ts    (new) submitPrediction / setChampion / setBoost orchestrators
  routes/
    mcp.ts            (new) POST /mcp (requireMcpPlayer) + POST /mcp/token (requirePlayer)
    predictions.ts    (mod) refactor to call api/services/* (behavior-preserving)
  middleware.ts       (mod) add requireMcpPlayer
  app.ts              (mod) app.route('/api', mcpRoutes)
src/
  api-client.ts       (mod) createMcpToken()
  routes/Connect.tsx  (new) "Connect your LLM" panel  (+ nav link)
tst/
  mcp/*.test.ts       (new) protocol, auth, tools, services, token unit tests
  e2e/mcp.spec.ts     (new) end-to-end Claude-Code-shaped flow over HTTP
```

## Verification
1. `npm run test:coverage` — unit suite green; ≥90% line AND branch on `api/` (incl. `api/mcp`, `api/services`).
2. `npx playwright test` (Firefox) — E2E green, including the MCP spec.
3. `npm run check` — typecheck → lint → coverage → build all pass.
4. Manual: `claude mcp add` the local Worker with a minted token; run `tools/list` and a
   `submit_prediction` from Claude Code; confirm the pick appears in the web UI.

## Test Scenarios

### Protocol (unit)
- **U1** — initialize: returns `protocolVersion`, `capabilities.tools`, `serverInfo`.
- **U2** — tools/list: returns all six tools with non-empty `inputSchema`.
- **U3** — ping → `{}`; unknown method → `-32601`.
- **U4** — malformed JSON body → `-32700`; request missing `method` → `-32600`.
- **U5** — `notifications/initialized` (no `id`) → HTTP 202, empty body.
- **U6** — tools/call unknown tool name → `-32602`.

### Auth & token (unit)
- **U7** — `POST /api/mcp` with no `Authorization` → 401; malformed bearer → 401; expired token → 401.
- **U8** — valid bearer → handler runs with `playerId`/`gameId` from the token.
- **U9** — `POST /api/mcp/token` requires the cookie session; minted token verifies via `verifyCookie` with the correct `sub`/`gid` and a ~60-day `exp`.

### Read tools (unit)
- **U10** — list_matches: resolved match shows `{id,name}` + `teamsResolved:true`; unresolved knockout shows placeholder + `false`; a kicked-off match shows `locked:true`; player's own pick + recorded result inlined.
- **U11** — get_my_entry: returns the player's predictions, `championTeamId`, and boosts.
- **U12** — get_leaderboard: rows scoped to the token's game (sorted by `totalPoints`).

### Write tools / services (unit)
- **U13** — submit_prediction happy path writes the row.
- **U14** — submit_prediction on a kicked-off match → `isError` `FORBIDDEN` (no write).
- **U15** — submit_prediction unresolved teams → `isError` `FORBIDDEN`; unknown match → `isError` `NOT_FOUND`.
- **U16** — submit_prediction bad goals (negative / >99 / non-int) → `isError` `VALIDATION`; `firstScorer:"NONE"` → `isError` `VALIDATION`.
- **U17** — set_champion happy; after first kickoff → `isError` `FORBIDDEN`; unknown teamId → `isError` `VALIDATION`.
- **U18** — set_boost happy set; `matchId` null clears; match not in phase → `isError` `VALIDATION`; after phase first kickoff → `isError` `FORBIDDEN`; unknown phase → `isError` `NOT_FOUND`.
- **U19** — refactored HTTP prediction routes still pass their existing tests (services parity).
- **U20** — **injection safety**: a `tools/call` whose `arguments` carry stray `playerId`/`gameId`/`displayName` is ignored — the write targets the token's `sub`/`gid` only.

### E2E (Playwright, Firefox, over HTTP — pinned to a pre-kickoff clock)
- **E2E-MCP1** — connect & predict: cookie-login → `POST /api/mcp/token` → with the bearer, drive
  `initialize` → `tools/list` → `tools/call submit_prediction`; assert the pick is visible via the
  web session (`GET /me`); then advance the test clock past kickoff and assert a second
  `submit_prediction` returns `isError`. Cleans up the created game/player/pick.
- **E2E-MCP2** — `POST /api/mcp` with no/invalid bearer → 401 (no tool runs).

## Implementation Order
```
RPC (jsonrpc + dispatcher: U1–U6)
  → AUTH (requireMcpPlayer + token endpoint: U7–U9)
  → TOOL-read (list_matches, get_my_entry, get_leaderboard: U10–U12)
  → SVC (extract services + refactor predictions route: U19)
  → TOOL-write (submit_prediction, set_champion, set_boost: U13–U18, U20)
  → API (mount mcpRoutes in app.ts)
  → UI (api-client + Connect panel)
  → E (E2E-MCP1, E2E-MCP2)
  → Docs (README + CLAUDE.md)
(RPC and AUTH are independent and can be built in either order; everything else follows.)
```
