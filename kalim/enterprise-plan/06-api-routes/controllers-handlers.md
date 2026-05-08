# Controllers & Handlers

## Purpose
Each handler + purpose.

## Findings

### OpenAI API Handlers

1. **`src/gateway/openai-http.ts`**
   - `POST /v1/chat/completions` — Chat completions with streaming
   - `GET /v1/models` — Model catalog listing
   - Converts internal agent runtime to OpenAI-compatible response format
   - Supports SSE streaming for real-time token delivery

2. **`src/gateway/openresponses-http.ts`**
   - `POST /v1/responses` — OpenAI responses API
   - Newer OpenAI API format support

3. **`src/gateway/embeddings-http.ts`**
   - `POST /v1/embeddings` — Text embedding generation
   - Delegates to configured embedding provider

### Gateway RPC Handler

4. **`src/gateway/call.ts`**
   - `POST /gateway/call` — Generic RPC dispatch
   - Resolves method name from request body
   - Routes to `server-methods/*.ts` implementations
   - Error handling and response formatting

5. **`src/gateway/server-methods/channels.ts`**
   - Channel list, status, send message, configure
   - Methods: `channels.list`, `channels.status`, `channels.send`, etc.

6. **`src/gateway/server-methods/cron.ts`**
   - Cron job CRUD and execution
   - Methods: `cron.list`, `cron.create`, `cron.delete`, `cron.run`, etc.

7. **`src/gateway/server-methods/devices.ts`**
   - Device pairing and node management
   - Methods: `devices.list`, `devices.pair`, `devices.revoke`, etc.

8. **`src/gateway/server-methods/models.ts`**
   - Model catalog and auth status
   - Methods: `models.list`, `models.authStatus`, etc.

9. **`src/gateway/server-methods/sessions.ts`**
   - Session history and management
   - Methods: `sessions.list`, `sessions.history`, `sessions.kill`, etc.

10. **`src/gateway/server-methods/tools.ts`**
    - Tool listing and invocation
    - Methods: `tools.list`, `tools.invoke`, etc.

### Session Handlers

11. **`src/gateway/sessions-history-http.ts`**
    - `GET /sessions/history/:sessionKey` — Retrieve conversation history
    - Supports pagination and filtering

12. **`src/gateway/session-kill-http.ts`**
    - `POST /sessions/kill/:sessionKey` — Abort active agent run
    - Signals cancellation to running LLM stream

### Tool Handler

13. **`src/gateway/tools-invoke-http.ts`**
    - `POST /tools/invoke/:toolName` — Direct tool execution
    - Bypasses agent runtime for direct tool calls
    - Used by external integrations

### Canvas / UI Handlers

14. **`src/canvas-host/server.ts`**
    - Canvas host server for live UI rendering
    - Serves agent-driven visual workspaces
    - WebSocket integration for real-time updates

15. **`src/canvas-host/a2ui.ts`**
    - A2UI surface handler
    - `handleA2uiHttpRequest()` — serves A2UI bundle

### Media Handler

16. **`src/gateway/managed-image-attachments.ts`**
    - Serves images attached to messages
    - Time-limited access (configurable TTL)
    - File-based storage under `~/.openclaw/media/`

### Realtime Handler

17. **`src/gateway/voiceclaw-realtime/upgrade.ts`**
    - WebSocket upgrade for VoiceClaw realtime
    - Bidirectional audio streaming
    - Integrates with STT/TTS providers

### Health Handlers

18. **`src/gateway/server/health-state.ts`**
    - `/healthz` — Liveness check
    - `/readyz` — Readiness check
    - Internal state: presence version, health cache

## Evidence
- `src/gateway/server-http.ts` — route-to-handler mapping
- `src/gateway/server-methods-list.ts` — method registry
- `src/gateway/call.ts` — RPC dispatch
- `src/gateway/openai-http.ts` — OpenAI compatibility
- `src/canvas-host/server.ts` — Canvas host
- `src/gateway/tools-invoke-http.ts` — tool invocation

## Notes
- Handlers use lazy imports (`*.runtime.ts`) to reduce startup time
- Most handlers validate auth via `authorizeHttpGatewayConnect()`
- OpenAI handlers convert internal formats to OpenAI spec for compatibility
- Canvas uses WebSocket for real-time bidirectional communication
