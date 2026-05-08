# Request Lifecycle

## HTTP Request Flow

```
Incoming HTTP Request
  |
  v
Node.js HTTP Server (hono or raw)
  |
  v
Middleware Stack
  +-- CORS (control-ui origins)
  +-- HSTS (if TLS)
  +-- Auth check (token / password / tailscale / trusted-proxy)
  +-- Rate limiting
  +-- Body parsing
  |
  v
Route Matching
  +-- /healthz → health check
  +-- /v1/chat/completions → OpenAI-compatible endpoint
  +-- /v1/responses → OpenResponses endpoint
  +-- /gateway/* → gateway methods (WS fallback)
  +-- /api/* → API routes
  +-- /webhook/:channelId → channel webhooks
  +-- /assets/* → static assets
  +-- /control-ui/* → bundled React app
  +-- /metrics → Prometheus metrics (if enabled)
  |
  v
Handler Execution
  +-- Gateway request context created
  +-- Plugin route registry lookup
  +-- Channel-specific handlers (webhooks)
  +-- Agent chat completions
  +-- Tool execution
  |
  v
Response
  +-- JSON / SSE / binary
  +-- WS upgrade (for streaming)
```

## WebSocket Connection Flow

```
WS Upgrade Request
  |
  v
Auth handshake (query param or header token)
  |
  v
Rate limit check (browser vs non-browser)
  |
  v
Connection accepted → client registry entry
  |
  v
Message dispatch loop
  +-- Gateway method routing
  +-- Session event subscriptions
  +-- Chat run streaming
  +-- Tool event broadcasts
  |
  v
Connection close / cleanup
```

## Auth Check Detail

From `src/gateway/auth.ts` and `src/gateway/server-ws-runtime.ts`:

### HTTP Auth (`authorizeGatewayConnect`)
1. Extract `Authorization` header or query `token`
2. Check against `resolvedAuth.token` (constant-time compare via `safeEqualSecret`)
3. If no token, check `password` (bcrypt/compare)
4. If `tailscale` mode, verify Tailscale whois identity
5. If `trusted-proxy`, verify proxy IP + user header
6. Apply rate limiting per IP
7. Return `GatewayAuthResult`

### WS Auth (`attachGatewayWsHandlers`)
1. Parse `?token=` or `?password=` from WS URL
2. Same auth resolution as HTTP
3. Browser-origin WS gets stricter rate limiting (`browserRateLimiter`)
4. Loopback requests may be exempt (configurable)

## Gateway Method Routing

After auth, messages route through `gatewayRequestContext`:
- `GATEWAY_EVENTS` define core event types
- Plugin handlers extend via `pluginRegistry.gatewayHandlers`
- Methods: `chat`, `agent_run`, `tool_call`, `session_subscribe`, `session_unsubscribe`, `config_reload`, `channel_start`, `channel_stop`, etc.

## Key Middleware Files

- `src/gateway/server-runtime-state.ts` — HTTP/WSS server creation
- `src/gateway/server-ws-runtime.ts` — WS handler attachment
- `src/gateway/auth.ts` — Auth resolution
- `src/gateway/auth-rate-limit.ts` — Rate limiting
- `src/gateway/server-request-context.ts` — Request context factory
- `src/gateway/net.ts` — IP/proxy resolution
- `src/gateway/origin-check.ts` — CORS origin verification

## Channel Webhook Flow

```
POST /webhook/:channelId
  |
  v
Channel plugin resolves webhook handler
  |
  v
Payload normalized to internal message format
  |
  v
Message enqueued for agent processing
  |
  v
Reply generated and dispatched back to channel
```

## OpenAI-Compatible Endpoint Flow

```
POST /v1/chat/completions
  |
  v
Parse request body (OpenAI schema)
  |
  v
Route to agent runtime with model catalog
  |
  v
Stream tokens back via SSE or WS
  |
  v
Finish with usage stats
```

---

*Evidence: `src/gateway/server.impl.ts`, `src/gateway/auth.ts`, `src/gateway/server-ws-runtime.ts`, `src/gateway/server-request-context.ts`.*
