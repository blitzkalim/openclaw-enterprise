# Gateway Architecture

## Purpose
Explain the actual role of the Gateway in OpenClaw.

## Findings

### Core Role
The Gateway is the **single control plane** for the entire OpenClaw system. It is a Node.js HTTP/WebSocket server that:
- Receives inbound messages from channels (WhatsApp, Telegram, Discord, etc.)
- Routes messages to AI agents
- Streams LLM responses back to channels
- Serves the Control UI (web-based admin interface)
- Provides an OpenAI-compatible API (`/v1/chat/completions`)
- Manages cron jobs, sessions, device pairing, and tool execution
- Hosts Canvas (live UI rendering surface)

### Server Implementation
- File: `src/gateway/server.impl.ts` (1,013 lines)
- Creates HTTP/HTTPS server via Node.js `http`/`https` modules
- Integrates WebSocket server (`ws` library)
- No Express/Koa/Hono — custom request routing
- Supports TLS via `src/gateway/server/tls.ts`

### Key Subsystems

1. **HTTP Request Handler** (`src/gateway/server-http.ts`)
   - Route matching and dispatch
   - Auth validation per-route
   - Plugin HTTP route integration
   - Static file serving for Control UI

2. **WebSocket Runtime** (`src/gateway/server-ws-runtime.ts`)
   - WS upgrade handling
   - Connection auth handshake
   - Message routing to gateway methods
   - Real-time streaming to clients

3. **Gateway Methods** (`src/gateway/server-methods-list.ts` + `src/gateway/server-methods/*.ts`)
   - RPC-style method registry
   - Methods: channels, cron, devices, models, sessions, tools, etc.
   - Called via HTTP POST or WebSocket messages

4. **Health & Readiness**
   - `/healthz` — liveness probe
   - `/readyz` — readiness probe
   - Internal health state: `src/gateway/server/health-state.ts`

5. **Model Catalog** (`src/gateway/server-model-catalog.ts`)
   - Loads available models from configured providers
   - Auth profile resolution
   - Model availability caching

6. **Cron Service** (`src/gateway/server-cron.ts`)
   - Integrates `src/cron/` subsystem
   - Scheduled job execution

7. **Channel Manager** (`src/gateway/server-channels.ts`)
   - Activates/deactivates channel plugins
   - Channel health monitoring

8. **Config Reloader** (`src/gateway/server-reload-handlers.ts`)
   - Hot-reloads services on config change
   - Graceful service restart

### Network Binding
- Default port: **18789** (gateway)
- Bridge port: **18790**
- Bind modes: `loopback`, `lan`, `tailscale`, `host`, `0.0.0.0`
- Bonjour/mDNS auto-discovery (can be disabled)
- Tailscale integration for zero-trust access

### Threading Model
- Single Node.js event loop
- No clustering or worker threads for HTTP handling
- CPU-intensive tasks (image generation, etc.) may spawn child processes
- Sandbox backends run in separate processes/containers

## Evidence
- `src/gateway/server.impl.ts` — server implementation
- `src/gateway/server-http.ts` — HTTP routing
- `src/gateway/server-methods-list.ts` — method registry
- `src/gateway/server-channels.ts` — channel management
- `src/gateway/server-cron.ts` — cron integration
- `src/gateway/server/health-state.ts` — health tracking

## Notes
- Gateway is the only long-running server process
- Everything else runs inside this process (plugins, agents, cron)
- No load balancing or horizontal scaling built in
- Designed for single-user personal deployment
