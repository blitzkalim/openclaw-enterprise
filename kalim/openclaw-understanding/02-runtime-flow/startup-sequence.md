# Startup Sequence

## Overview

OpenClaw startup follows a strict sequence from env loading through gateway binding. All evidence traced from `src/entry.ts` and `src/gateway/server.impl.ts`.

## Sequence Diagram

```
Process Launch
  |
  v
entry.ts
  |
  +-- normalizeEnv()
  +-- enableCompileCache() (best-effort)
  +-- shouldForceReadOnlyAuthStore() → OPENCLAW_AUTH_STORE_READONLY
  +-- normalizeWindowsArgv()
  |
  v
runMainOrRootHelp()
  |
  v
cli/run-main.ts → runCli()
  |
  v
Commander subcommand dispatch
  |
  v
Gateway mode: gateway/server.impl.ts
  |
  +-- bootstrapGatewayNetworkRuntime()
  +-- loadGatewayStartupConfigSnapshot()
  +-- prepareGatewayStartupConfig()
  +-- resolveGatewayAuth()
  +-- resolveGatewayRuntimeConfig()
  +-- createGatewayRuntimeState() → HTTP server, WS server
  +-- startGatewayEarlyRuntime() → Bonjour, health checks, dedupe cleanup
  +-- startGatewayEventSubscriptions() → session events, chat events
  +-- startGatewayRuntimeServices() → channels, plugins
  +-- attachGatewayWsHandlers() → WS auth, message routing
  +-- startListening() → bind port, accept connections
  +-- startGatewayPostAttachRuntime() → channels start, sidecars ready
  +-- activateGatewayScheduledServices() → cron, heartbeat
  +-- startManagedGatewayConfigReloader() → hot config reload
  +-- ready
```

## Detailed Stages

### Stage 1: Entry Point (`src/entry.ts`)

```typescript
// entry.ts lines 46-131
process.title = "openclaw";
ensureOpenClawExecMarkerOnProcess();
installProcessWarningFilter();
normalizeEnv();
// ... argv parsing, container target, profile env
// ... runMainOrRootHelp() → runCli()
```

Key actions:
- Sets process title
- Marks process as OpenClaw exec
- Normalizes environment variables
- Parses CLI arguments (profiles, containers)
- Invokes `runCli()` from `cli/run-main.ts`

### Stage 2: CLI Bootstrap (`src/cli/run-main.ts`)

Commander-based CLI with subcommands:
- `gateway` — start gateway server
- `config` — config management
- `doctor` — health checks
- `wizard` / `onboard` — setup wizard
- `agent` — agent runtime modes
- `proxy` — proxy capture
- And many more

### Stage 3: Gateway Startup (`src/gateway/server.impl.ts`)

#### 3a. Pre-initialization (lines 295-310)
- `bootstrapGatewayNetworkRuntime()` — network initialization
- Set `OPENCLAW_GATEWAY_PORT` env var
- Log accepted env options (`OPENCLAW_RAW_STREAM`, `OPENCLAW_RAW_STREAM_PATH`)
- Create startup trace (optional performance tracing)

#### 3b. Config Loading (lines 312-408)
- `loadGatewayStartupConfigSnapshot()` — read `openclaw.json` snapshot
- `prepareGatewayStartupConfig()` — resolve auth, activate runtime secrets
- `applyConfigOverrides()` — apply CLI overrides
- `maybeSeedControlUiAllowedOriginsAtStartup()` — seed CORS origins
- Generate or persist gateway auth token if missing
- Set up config reload infrastructure

#### 3c. Runtime State Creation (lines 454-614)
- `resolveGatewayRuntimeConfig()` — resolve bind host, TLS, auth, endpoints
- `createGatewayRuntimeState()` — create:
  - HTTP server (hono-based or raw Node)
  - WebSocket server
  - Control UI server (if enabled)
  - Canvas host (if enabled)
  - Dedupe registry
  - Chat run state, abort controllers
  - Plugin route registry
  - Health/readiness state

#### 3d. Channel Manager (lines 545-553)
- `createChannelManager()` — manages channel plugin lifecycle
- Gets runtime config with auto-enabled plugins
- Resolves channel runtime via lazy import

#### 3e. Early Runtime (lines 701-745)
- `startGatewayEarlyRuntime()`:
  - Bonjour/mDNS advertising (if not container)
  - Health interval
  - Dedupe cleanup timer
  - Media cleanup timer
  - Skills refresh timer
  - Update check timer
  - Heartbeat runner

#### 3f. Event Subscriptions (lines 747-762)
- `startGatewayEventSubscriptions()`:
  - Session event subscribers
  - Message subscribers
  - Chat run state management
  - Tool event recipients

#### 3g. Runtime Services (lines 764-773)
- `startGatewayRuntimeServices()`:
  - Plugin services activation
  - Channel readiness monitoring

#### 3h. Auxiliary Handlers (lines 775-784)
- `createGatewayAuxHandlers()`:
  - Execution approval manager
  - Plugin approval manager
  - Extra gateway handlers

#### 3i. WebSocket Handlers (lines 874-896)
- `attachGatewayWsHandlers()`:
  - Auth on WS connect (token/password/tailscale/trusted-proxy)
  - Rate limiting
  - Message routing to gateway methods
  - Plugin gateway handlers

#### 3j. Listen & Post-Attach (lines 897-937)
- `await startListening()` — bind to port, start accepting
- `startGatewayPostAttachRuntime()`:
  - Start channels (if not deferred)
  - Plugin services
  - Sidecars ready signal
  - Tailscale setup
  - Control UI origin seeding

#### 3k. Scheduled Services (lines 940-948)
- `activateGatewayScheduledServices()`:
  - Cron job scheduler
  - Heartbeat runner
  - Update checker

#### 3l. Config Reloader (lines 951-989)
- `startManagedGatewayConfigReloader()`:
  - Watch config file for changes
  - Hot reload without restart
  - Validate new config before applying
  - Broadcast config change events

### Stage 4: Post-Startup

After `startupTrace.mark("ready")`, the gateway is fully operational:
- HTTP endpoints active (`/healthz`, `/v1/chat/completions`, etc.)
- WebSocket accepting connections
- Channels connected and polling/webhook listening
- Cron jobs scheduled
- Config hot-reload watching

## Startup Failure Handling

If any stage throws:
```typescript
// server.impl.ts lines 692-995
await closeOnStartupFailure();
throw err;
```

`closeOnStartupFailure()` runs:
1. `runClosePrelude()` — stop diagnostics, clear timers
2. `createCloseHandler()` — close WSS, HTTP server, channels, plugins

## Key Files

- `src/entry.ts` — Entry point
- `src/cli/run-main.ts` — CLI dispatch
- `src/gateway/server.impl.ts` — Gateway full lifecycle
- `src/gateway/server-startup.ts` — Early & post-attach runtime
- `src/gateway/server-runtime-state.ts` — Runtime state factory
- `src/gateway/server-channels.ts` — Channel lifecycle
- `src/config/config.ts` — Config loading
- `src/infra/env.ts` — Env normalization

---

*Evidence: direct code trace from `src/entry.ts`, `src/gateway/server.impl.ts`, and related files.*
