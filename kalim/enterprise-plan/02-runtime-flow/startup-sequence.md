# Startup Sequence

## Purpose
Trace the exact order of initialization from process start to fully operational Gateway.

## Findings

### Phase 1: Environment Resolution
```
process.env → dotenv load (./.env, ~/.openclaw/.env) → shell env fallback
```
- `src/infra/dotenv.ts` loads `.env` files
- `src/infra/shell-env.ts` optionally imports shell profile variables
- `src/config/env-vars.ts` applies explicit env overrides from config

### Phase 2: Config Loading
```
~/.openclaw/openclaw.json → JSON5 parse → schema validation → runtime snapshot
```
- `src/config/io.ts`: `readConfigFileSnapshot()`, `parseConfigJson5()`
- `src/config/validation.ts`: `validateConfigObjectWithPlugins()`
- `src/config/runtime-snapshot.ts`: materializes runtime config with overrides
- Includes config recovery from `lastKnownGood` if current config is corrupt

### Phase 3: Bootstrap
```
ensureOpenClawCliOnPath() → runtime environment setup → logger initialization
```
- `src/gateway/server.impl.ts:100` — `ensureOpenClawCliOnPath()`
- Subsystem loggers created (`gateway`, `channels`, `canvas`, `discovery`, etc.)

### Phase 4: Gateway Auth Resolution
```
OPENCLAW_GATEWAY_TOKEN / OPENCLAW_GATEWAY_PASSWORD → resolveGatewayAuth() → resolved auth mode
```
- `src/gateway/startup-auth.ts`: `ensureGatewayStartupAuth()`
- Auto-generates token if none configured (persisted to config if requested)
- Supports token, password, tailscale, trusted-proxy, device-token, bootstrap-token

### Phase 5: Plugin Bootstrap
```
prepareGatewayPluginBootstrap() → load plugin manifests → resolve bundled runtime deps
```
- `src/gateway/server-startup-plugins.ts`
- Scans `extensions/*/` and installed npm packages for `openclaw` manifest
- Stages runtime dependencies for bundled plugins

### Phase 6: Model Catalog Load
```
loadGatewayModelCatalog() → provider auth profiles → model availability
```
- `src/gateway/server-model-catalog.ts`
- Loads available models from configured providers (OpenAI, Anthropic, Google, etc.)

### Phase 7: Network Runtime
```
bootstrapGatewayNetworkRuntime() → HTTP server + WebSocket server → bind port
```
- `src/gateway/server-network-runtime.ts`
- Creates Node.js HTTP/HTTPS server
- Attaches WebSocket upgrade handler
- Default port: 18789 (gateway), 18790 (bridge)

### Phase 8: Channel Activation
```
getChannelRuntime() → createRuntimeChannel() → activate channel plugins
```
- `src/gateway/server.impl.ts:121` — lazy-loaded channel runtime
- Channels (WhatsApp, Telegram, Discord, etc.) connect to their respective APIs

### Phase 9: Cron & Scheduled Services
```
buildGatewayCronService() → activateGatewayScheduledServices()
```
- `src/gateway/server-cron.ts`
- Loads persisted cron jobs from store
- Starts timer-based job scheduler

### Phase 10: Event Subscriptions & Ready State
```
startGatewayEventSubscriptions() → health checks → readiness probe
```
- `src/gateway/server-runtime-subscriptions.ts`
- Subscribes to internal event bus
- `/healthz` and `/ready` endpoints become responsive

## Evidence
- `src/gateway/server.impl.ts` — main orchestration
- `src/gateway/server-startup.ts` — early runtime phases
- `src/gateway/server-startup-config.ts` — config-specific startup
- `src/config/io.ts` — config I/O pipeline

## Notes
- Startup can be traced with `OPENCLAW_GATEWAY_STARTUP_TRACE=1`
- Event loop delay monitoring is enabled during startup trace
- Failed config reads attempt recovery from `lastKnownGood` snapshot
