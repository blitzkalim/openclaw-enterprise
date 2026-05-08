# Request Lifecycle

## Purpose
Trace an HTTP/WebSocket request from ingress to handler response.

## Findings

### HTTP Request Flow

```
Inbound Request
  → Node.js HTTP Server (src/gateway/server-http.ts)
    → resolveRequestClientIp() (proxy-aware IP resolution)
    → Plugin auth bypass check (channel webhook paths)
    → authorizeHttpGatewayConnect() (src/gateway/auth.ts)
      → Token / Password / Tailscale / Trusted-Proxy validation
      → Rate limit check (src/gateway/auth-rate-limit.ts)
    → CORS / Security headers (src/gateway/http-common.ts)
    → Route dispatch:
      - /health, /healthz → live probe
      - /ready, /readyz → readiness probe
      - /v1/models → model catalog
      - /v1/chat/completions → OpenAI-compatible chat endpoint
      - /v1/responses → OpenAI responses API
      - /canvas/* → Canvas host
      - /a2ui/* → A2UI surface
      - /gateway/* → Gateway RPC methods
      - /hooks/* → Plugin webhook handlers
      - /ws → WebSocket upgrade
    → Handler execution
    → Response
```

### WebSocket Connection Flow

```
WS Upgrade Request
  → HTTP auth handshake (same as above)
  → ws-connection/auth-context.ts — resolve auth context
  → ws-connection/handshake-auth-helpers.ts — validate connection token
  → ws-connection/message-handler.ts — message routing
    → Gateway method dispatch (server-methods-list.ts)
    → Session binding
    → Real-time streaming
```

### Gateway RPC Method Flow

```
POST /gateway/call
  → parse request body
  → resolveGatewayAuth() → validate caller identity
  → call.ts — route to method handler
  → server-methods/*.ts — execute specific method
    → channels.ts — channel operations
    → cron.ts — cron operations
    → devices.ts — device operations
    → models.ts — model operations
    → sessions.ts — session operations
    → tools.ts — tool invocation
  → format response
  → send response
```

## Evidence
- `src/gateway/server-http.ts` — HTTP request routing
- `src/gateway/auth.ts` — authentication decision tree
- `src/gateway/call.ts` — RPC call handler
- `src/gateway/server-methods-list.ts` — method registry
- `src/gateway/server/ws-connection/message-handler.ts` — WS message handling

## Notes
- Health probes (`/healthz`) bypass authentication
- Plugin routes can declare auth bypass for webhooks
- Rate limiting applies per-IP for failed auth attempts
- Tailscale auth uses `tailscale whois` for identity verification
