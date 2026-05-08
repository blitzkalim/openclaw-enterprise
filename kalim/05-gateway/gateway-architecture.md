# Gateway Architecture

## Overview

The OpenClaw Gateway is the **central control plane** — a single Node.js HTTP/WebSocket server that:
- Accepts AI chat completions (OpenAI-compatible API)
- Hosts the Control UI (React-based web interface)
- Manages WebSocket connections for real-time streaming
- Routes channel webhooks and outbound messages
- Provides health/readiness endpoints
- Serves as the plugin runtime host

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                          │
│  (single Node.js process, port 18789 default)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │  HTTP API   │  │  WebSocket  │  │    Control UI      │  │
│  │  (hono/raw) │  │   Server    │  │   (React SPA)      │  │
│  │             │  │             │  │   /control-ui/*    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬─────────┘  │
│         │                │                      │            │
│         └────────────────┼──────────────────────┘            │
│                          │                                   │
│         ┌────────────────┴──────────────────────┐            │
│         │         Gateway Runtime State          │            │
│         │  (runtimeState: GatewayRuntimeState)   │            │
│         └────────────────┬──────────────────────┘            │
│                          │                                   │
│    ┌─────────────────────┼─────────────────────┐              │
│    │                     │                     │              │
│    v                     v                     v              │
│ ┌──────────┐    ┌──────────────┐    ┌──────────────┐       │
│ │  Auth    │    │  Request     │    │  Channel     │       │
│ │  Layer   │───▶│  Context     │───▶│  Manager     │       │
│ │          │    │  Factory     │    │              │       │
│ └──────────┘    └──────────────┘    └──────┬───────┘       │
│                                              │                │
│    ┌─────────────────────────────────────────┘                │
│    │                                                          │
│    v                                                          │
│ ┌────────────────────────────────────────────────────────────┐│
│ │              Plugin Registry & Route Table                  ││
│ │  (pluginRegistry: PluginRegistry)                           ││
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    ││
│ │  │ Channels │  │ Providers│  │  Tools   │  │  Skills  │    ││
│ │  │          │  │          │  │          │  │          │    ││
│ │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Agent Runtime (src/agents/)                 ││
│  │  Planner → Model Catalog → Provider Transport → Stream    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Config Reloader (hot reload)                 ││
│  │  File watch → Validate → Apply → Restart channels        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Gateway Runtime State

From `src/gateway/server-runtime-state.ts`:

```typescript
type GatewayRuntimeState = {
  // Network
  httpServer: HttpServer;
  wsServer: WsServer;
  controlUiServer?: ControlUiServer;
  canvasHost?: CanvasHost;

  // Auth & Rate Limiting
  rateLimiters: GatewayAuthRateLimiters;
  authResult?: GatewayAuthResult;

  // Plugin Registry
  pluginRegistry: PluginRegistry;
  pluginRouteRegistry: PluginRouteRegistry;

  // Session & Chat
  dedupeRegistry: DedupeRegistry;
  chatRunState: ChatRunState;
  abortControllers: Map<string, AbortController>;
  sessionEventSubscribers: Map<...>;
  toolEventRecipients: Map<...>;

  // Services
  channelManager: ChannelManager;
  healthState: HealthState;
  readiness: ReadinessChecker;

  // Diagnostics
  diagnosticEventFlags: DiagnosticEventFlags;
  startupTrace?: StartupTrace;
};
```

## Network Binding

### Bind Modes (`src/gateway/server-runtime-config.ts`)

| Mode | Behavior | Security |
|------|----------|----------|
| `loopback` | Bind to 127.0.0.1 only | Safest |
| `lan` | Bind to all LAN interfaces (0.0.0.0) | Needs auth |
| `tailnet` | Bind to Tailscale interface | Tailscale auth |
| `auto` | Detect best interface | Context-dependent |

### Default
- `lan` mode (exposes to local network)
- Port `18789` (HTTP/WS)
- Port `18790` (bridge in Docker)

### TLS
- Optional TLS via `gateway.tls.enabled`
- Certificate resolution via `src/gateway/server/tls.ts`
- HSTS header added when TLS active

## WebSocket Architecture

From `src/gateway/server-ws-runtime.ts`:

### Connection Lifecycle

```
Client WS Connect
  |
  v
Auth handshake (token/password/Tailscale)
  |
  v
Rate limit check
  |
  v
Register in runtimeState.wsClients
  |
  v
Send welcome / session info
  |
  v
Message dispatch loop
  +-- Gateway method routing
  +-- Session event streaming
  +-- Chat token streaming
  +-- Tool event broadcasts
  |
  v
Connection close → cleanup registry
```

### WS Message Types

Gateway methods (from `src/gateway/server-request-context.ts` and plugin registry):
- `chat` — OpenAI-compatible chat completion
- `agent_run` — Agent execution with streaming
- `tool_call` — Direct tool execution
- `session_subscribe` / `session_unsubscribe` — Session event streaming
- `config_reload` — Trigger config reload
- `channel_start` / `channel_stop` — Channel lifecycle
- Plugin-registered custom methods

## Control UI

From `src/gateway/server.impl.ts` and `ui/`:

- Optional bundled React application
- Served at `/control-ui/*` path
- Static assets from `ui/dist/`
- CORS restricted to `gateway.controlUi.allowedOrigins`
- Connects back to gateway via WebSocket for real-time chat
- Supports canvas rendering for visual outputs

## Channel Manager

From `src/gateway/server-channels.ts`:

```typescript
type ChannelManager = {
  startChannels(): Promise<void>;
  stopChannels(): Promise<void>;
  restartChannels(): Promise<void>;
  getChannel(id: string): ChannelRuntime | undefined;
  // ...
};
```

- Loads channel plugins from extension registry
- Starts/stops channels based on config
- Manages webhook route registration
- Routes outbound messages to correct channel
- Handles channel health/readiness

## Plugin Registry

From `src/plugins/runtime/runtime-channel.ts` and `src/gateway/server-runtime-state.ts`:

- Index of all loaded plugins
- Maps channel IDs → channel runtime factories
- Maps provider IDs → provider runtime factories
- Maps tool IDs → tool handlers
- Maps gateway method IDs → method handlers
- Plugin hooks: `gateway_start`, `gateway_stop`, `config_change`, etc.

## Health & Readiness

From `src/gateway/server/health-state.ts` and `src/gateway/server/readiness.ts`:

```
/healthz
  → { status: "ok", version, uptime }

/readiness
  → { ready: boolean, channels: { [id]: boolean }, plugins: { [id]: boolean } }
```

- Health: always returns OK once HTTP server is listening
- Readiness: reflects channel and plugin startup completion
- Docker compose uses `/healthz` for healthcheck

## Startup Trace

From `src/gateway/server.impl.ts`:

Optional performance tracing:
```
startupTrace.mark("config_loaded")
startupTrace.mark("plugins_bootstrapped")
startupTrace.mark("channels_ready")
startupTrace.mark("ready")
```

Enabled via `OPENCLAW_GATEWAY_STARTUP_TRACE` env var.

## Key Files

- `src/gateway/server.impl.ts` — Full gateway lifecycle
- `src/gateway/server-runtime-state.ts` — Runtime state factory
- `src/gateway/server-request-context.ts` — Request context
- `src/gateway/server-ws-runtime.ts` — WebSocket handlers
- `src/gateway/server-channels.ts` — Channel manager
- `src/gateway/server-startup.ts` — Early & post-attach runtime
- `src/gateway/server-runtime-services.ts` — Service activation
- `src/gateway/server-aux-handlers.ts` — Auxiliary handlers
- `src/gateway/server-reload-handlers.ts` — Config reload
- `src/gateway/server/tls.ts` — TLS setup
- `src/gateway/server/health-state.ts` — Health check
- `src/gateway/server/readiness.ts` — Readiness check
- `src/gateway/net.ts` — Network utilities
- `src/gateway/origin-check.ts` — Origin validation

---

*Evidence: `src/gateway/server.impl.ts`, `src/gateway/server-runtime-state.ts`, `src/gateway/server-ws-runtime.ts`, `src/gateway/server-channels.ts`, `src/gateway/server-request-context.ts`.*
