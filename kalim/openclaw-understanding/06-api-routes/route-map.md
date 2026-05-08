# API Route Map

## OpenAI-Compatible Endpoints

| Route | Method | Auth | Purpose | File |
|-------|--------|------|---------|------|
| `/v1/chat/completions` | POST | Token | OpenAI-compatible chat completions | `src/gateway/server-request-context.ts` → agent runtime |
| `/v1/models` | GET | Token | List available models | Model catalog |
| `/v1/responses` | POST | Token | OpenResponses API | `src/gateway/server-request-context.ts` |

## Gateway Internal Methods

Accessed via WebSocket or HTTP fallback at `/gateway/*`:

| Method | Transport | Auth | Purpose |
|--------|-----------|------|---------|
| `chat` | WS/HTTP | Token | Chat completion with streaming |
| `agent_run` | WS/HTTP | Token | Full agent execution |
| `tool_call` | WS/HTTP | Token | Direct tool invocation |
| `session_subscribe` | WS | Token | Subscribe to session events |
| `session_unsubscribe` | WS | Token | Unsubscribe from session events |
| `config_reload` | WS/HTTP | Token | Trigger hot config reload |
| `channel_start` | WS/HTTP | Token | Start a channel |
| `channel_stop` | WS/HTTP | Token | Stop a channel |
| `channel_status` | WS/HTTP | Token | Get channel status |
| `plugin_enable` | WS/HTTP | Token | Enable a plugin |
| `plugin_disable` | WS/HTTP | Token | Disable a plugin |
| `plugin_list` | WS/HTTP | Token | List loaded plugins |
| `memory_search` | WS/HTTP | Token | Search memory vectors |
| `memory_add` | WS/HTTP | Token | Add to memory |
| `diagnostics` | WS/HTTP | Token | Run diagnostics |
| `approve_execution` | WS/HTTP | Token | Approve pending tool execution |

## Health & Observability

| Route | Method | Auth | Purpose | File |
|-------|--------|------|---------|------|
| `/healthz` | GET | None | Health check (liveness) | `src/gateway/server/health-state.ts` |
| `/readiness` | GET | None | Readiness probe | `src/gateway/server/readiness.ts` |
| `/metrics` | GET | None | Prometheus metrics | `extensions/diagnostics-prometheus/src/` |

## Channel Webhooks

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/webhook/:channelId` | POST | Signature/Secret | Generic channel webhook router |
| `/webhook/telegram` | POST | Telegram secret | Telegram bot webhook |
| `/webhook/slack` | POST | Slack signature | Slack events |
| `/webhook/msteams` | POST | Teams validation | MS Teams activities |
| `/webhook/googlechat` | POST | Google validation | Google Chat events |
| `/webhook/line` | POST | LINE signature | LINE webhook |
| `/webhook/zalo` | POST | Zalo secret | Zalo webhook |
| `/webhook/feishu` | POST | Feishu signature | Feishu/Lark events |
| `/webhook/mattermost` | POST | Mattermost token | Mattermost webhook |
| `/webhook/webhooks` | POST | Configured secret | Generic user webhooks |

## Static Content

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/control-ui/*` | GET | None (CORS-restricted) | React Control UI SPA |
| `/assets/*` | GET | None | Static assets (images, fonts) |
| `/control-ui` | GET | None | Redirect to `/control-ui/` |

## MCP (Model Context Protocol)

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/mcp/*` | Various | Loopback | MCP server endpoints |

## Canvas Host

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/canvas/*` | GET | Token | Canvas rendering endpoints |

## Call Graph Example: `/v1/chat/completions`

```
POST /v1/chat/completions
  |
  v
HTTP Server (hono/raw)
  |
  v
Auth middleware (token check)
  |
  v
Route handler in gateway request context
  |
  v
gatewayRequestContext.handleChatCompletion()
  |
  v
Agent runtime (src/agents/runtime/)
  |
  +-- Resolve model from model catalog
  +-- Build context from session history
  +-- Call LLM provider (extension)
  +-- Stream tokens back
  |
  v
SSE or WS streaming response
```

## Call Graph Example: Webhook Flow

```
POST /webhook/telegram
  |
  v
HTTP Server
  |
  v
Webhook router (src/channels/webhook-router.ts)
  |
  v
Channel plugin handler (extensions/telegram/src/)
  |
  v
Normalize message (src/channels/message-normalization.ts)
  |
  v
Dispatch to agent session
  |
  v
Agent generates reply
  |
  v
Outbound dispatch (src/channels/outbound-messaging.ts)
  |
  v
Telegram API call (sendMessage)
```

## Undocumented / Internal Routes

Assumed based on architecture but not directly observed in reviewed files:

| Route | Method | Auth | Likely Purpose |
|-------|--------|------|---------------|
| `/gateway/execute` | POST | Token | Execute arbitrary code/tool |
| `/gateway/sandbox/*` | Various | Token | Sandbox execution endpoints |
| `/gateway/files/*` | GET/POST | Token | File upload/download |
| `/gateway/voice/*` | POST | Token | Voice/audio processing |
| `/gateway/canvas/*` | GET/POST | Token | Canvas state management |
| `/api/v1/*` | Various | Token | Alternative API prefix |

These are inferred from:
- Plugin gateway handler registration (`pluginRegistry.gatewayHandlers`)
- Control UI feature set (files, voice, canvas)
- Agent runtime capabilities (sandbox, tool execution)

## Plugin-Registered Routes

Plugins can register additional HTTP routes and gateway methods:

```typescript
// Plugin manifest (conceptual)
{
  "gatewayHandlers": {
    "my_method": "./handlers/my-method.js"
  },
  "httpRoutes": [
    { "path": "/my-plugin/*", "handler": "./routes/handler.js" }
  ]
}
```

- Indexed in `pluginRouteRegistry`
- Mounted dynamically on gateway startup
- Not statically analyzable from core source alone

## Key Files

- `src/gateway/server-request-context.ts` — Core request routing
- `src/gateway/server-runtime-state.ts` — HTTP server setup, route registration
- `src/gateway/server-aux-handlers.ts` — Auxiliary handler registration
- `src/channels/webhook-router.ts` — Webhook dispatch
- `src/gateway/mcp-http.ts` — MCP routing
- `src/gateway/server/health-state.ts` — Health endpoint
- `src/gateway/server/readiness.ts` — Readiness endpoint

---

*Evidence: `src/gateway/server-request-context.ts`, `src/gateway/server-runtime-state.ts`, `src/gateway/server-aux-handlers.ts`, `src/channels/webhook-router.ts`, `src/gateway/mcp-http.ts`, `src/gateway/server/health-state.ts`, `src/gateway/server/readiness.ts`.*
