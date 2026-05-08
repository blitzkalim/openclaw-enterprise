# Controllers & Handlers

## Gateway Request Context

From `src/gateway/server-request-context.ts`:

The `createGatewayRequestContext()` function builds the core request handler that dispatches:
- HTTP API requests
- WebSocket messages
- Internal gateway method calls

```typescript
type GatewayRequestContext = {
  handleHttpRequest(req, res): Promise<void>;
  handleWsMessage(client, message): Promise<void>;
  handleGatewayMethod(method, params, client): Promise<any>;
  // ...
};
```

## Core Method Handlers

### Chat Completions Handler

**File:** `src/gateway/server-request-context.ts` (routed to agent runtime)

```
Input: { model, messages, stream?, temperature?, ... }
  |
  v
Resolve model from catalog (src/model-catalog/)
  |
  v
Resolve provider (extension: openai, anthropic, google, ...)
  |
  v
Build context from session history + new messages
  |
  v
Call provider API
  |
  +-- Streaming: SSE / WS chunk events
  +-- Non-streaming: full response JSON
  |
  v
Return OpenAI-compatible response format
```

### Agent Run Handler

**File:** `src/agents/runtime/` (invoked from gateway context)

```
Input: { agent, session, message, tools?, ... }
  |
  v
Planner (src/agents/planner/) — decide approach
  |
  v
Tool selection (if needed)
  |
  v
LLM call with tool definitions
  |
  v
Tool execution loop (if tool_calls returned)
  |
  v
Final response generation
  |
  v
Stream results via gateway WS
```

### Tool Call Handler

**File:** `src/agents/tools/` (invoked from gateway or agent runtime)

```
Input: { tool, args, session }
  |
  v
Resolve tool from registry
  |
  v
Validate arguments (Zod schema)
  |
  v
Execute tool handler
  |
  +-- Built-in: web_search, file_read, memory_search, ...
  +-- Extension: browser, code_interpreter, ...
  |
  v
Return result to caller
```

### Session Subscribe/Unsubscribe

**File:** `src/gateway/server-request-context.ts` + `src/sessions/`

```
session_subscribe { sessionKey }
  |
  v
Add client to sessionEventSubscribers Map
  |
  v
Push existing session state
  |
  v
Future events broadcast to all subscribers
```

### Config Reload Handler

**File:** `src/gateway/server-reload-handlers.ts`

```
config_reload { }
  |
  v
Trigger config reloader
  |
  v
Read new snapshot from disk
  |
  v
Validate with Zod schema
  |
  v
Apply hot reload
  |
  v
Broadcast config_change event
```

### Channel Start/Stop/Status

**File:** `src/gateway/server-channels.ts`

```
channel_start { channelId }
  |
  v
Lookup channel plugin
  |
  v
Call channel runtime start()
  |
  v
Register webhook routes
  |
  v
Update readiness state

channel_stop { channelId }
  |
  v
Call channel runtime stop()
  |
  v
Unregister webhook routes
  |
  v
Update readiness state
```

### Execution Approval Handler

**File:** `src/gateway/server-aux-handlers.ts`

```
approve_execution { executionId, approved }
  |
  v
Lookup pending execution in approval queue
  |
  v
If approved: resume execution
  |
  v
If rejected: cancel with error
```

## HTTP Route Controllers

### Health Controller

**File:** `src/gateway/server/health-state.ts`

```typescript
GET /healthz → { status: "ok", version: "2026.4.26", uptime: 12345 }
```

Always returns 200 once HTTP server is listening.

### Readiness Controller

**File:** `src/gateway/server/readiness.ts`

```typescript
GET /readiness → {
  ready: boolean,
  channels: { telegram: true, whatsapp: false, ... },
  plugins: { "memory-core": true, ... }
}
```

Returns 200 when all critical components are ready, 503 otherwise.

### OpenAI Chat Completions Controller

**File:** `src/gateway/server-request-context.ts`

```typescript
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <token>

Body: {
  model: "gpt-5.4",
  messages: [...],
  stream?: boolean,
  temperature?: number,
  max_tokens?: number,
  tools?: [...]
}

Response: OpenAI-compatible JSON or SSE stream
```

### OpenResponses Controller

**File:** `src/gateway/server-request-context.ts`

```typescript
POST /v1/responses
// Similar to chat/completions with different schema
```

### Webhook Controller

**File:** `src/channels/webhook-router.ts`

```typescript
POST /webhook/:channelId
// Channel-specific signature validation
// Normalizes to internal message format
// Dispatches to agent session
```

### Static Asset Controller

**File:** `src/gateway/server-runtime-state.ts` (serves from `ui/dist/`)

```typescript
GET /control-ui/* → Serve React SPA
GET /assets/* → Serve static files
```

## WebSocket Message Controllers

From `src/gateway/server-ws-runtime.ts`:

### Connection Controller

```typescript
onConnect(ws, req):
  1. Extract token from query or header
  2. Authenticate
  3. Rate limit check
  4. Register in wsClients Map
  5. Send welcome message
```

### Message Controller

```typescript
onMessage(ws, data):
  1. Parse JSON message
  2. Validate method name
  3. Lookup method handler (core or plugin)
  4. Execute handler with request context
  5. Send response or stream events
```

### Disconnect Controller

```typescript
onDisconnect(ws):
  1. Unregister from wsClients
  2. Unsubscribe from all sessions
  3. Abort pending operations
  4. Cleanup
```

## Plugin Gateway Handlers

Plugins register custom gateway method handlers:

```typescript
// Plugin runtime registration
pluginRegistry.registerGatewayMethod("my_method", handler);

// Handler signature:
type GatewayMethodHandler = (
  params: any,
  context: GatewayMethodContext
) => Promise<any> | AsyncIterable<any>;
```

Examples (from extension architecture):
- Browser extension: `browser_navigate`, `browser_screenshot`, `browser_click`
- Memory extension: `memory_search`, `memory_add`, `memory_delete`
- Diagnostics extension: `diagnostics_run`, `diagnostics_status`

## Handler Middleware Stack

Each handler executes within:

```
1. Auth check (already done at connection/request level)
2. Rate limiting (method-specific)
3. Input validation (Zod schema per method)
4. Execution
5. Error handling → standardized error response
6. Logging / diagnostics
```

## Error Handling

Standardized error format (OpenAI-compatible):

```typescript
{
  error: {
    message: string,
    type: string,
    code?: string,
    param?: string
  }
}
```

Error types observed:
- `invalid_request_error` — bad parameters
- `authentication_error` — invalid token
- `rate_limit_error` — too many requests
- `internal_error` — server failure
- `not_found` — method/resource not found

## Key Files

- `src/gateway/server-request-context.ts` — Core request routing & method dispatch
- `src/gateway/server-ws-runtime.ts` — WebSocket message handlers
- `src/gateway/server-aux-handlers.ts` — Execution approval, plugin approval
- `src/gateway/server-channels.ts` — Channel lifecycle handlers
- `src/agents/runtime/` — Agent execution runtime
- `src/agents/planner/` — Agent planning
- `src/agents/tools/` — Tool execution
- `src/channels/webhook-router.ts` — Webhook dispatch
- `src/gateway/server/health-state.ts` — Health endpoint
- `src/gateway/server/readiness.ts` — Readiness endpoint

---

*Evidence: `src/gateway/server-request-context.ts`, `src/gateway/server-ws-runtime.ts`, `src/gateway/server-aux-handlers.ts`, `src/gateway/server-channels.ts`, `src/agents/runtime/`, `src/agents/planner/`, `src/agents/tools/`, `src/channels/webhook-router.ts`, `src/gateway/server/health-state.ts`, `src/gateway/server/readiness.ts`.*
