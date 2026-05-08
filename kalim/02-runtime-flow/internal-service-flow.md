# Internal Service Flow

## Module Dependency Architecture

OpenClaw uses a layered module architecture within the single Node.js process. Extensions cross into core only via the Plugin SDK.

```
Extensions (plugins)
  |
  v
Plugin SDK (`packages/plugin-sdk/` + `src/plugin-sdk/`)
  |
  v
Core (`src/`)
  |
  +-- Gateway (`src/gateway/`)
  +-- Agents (`src/agents/`)
  +-- Channels (`src/channels/`)
  +-- Config (`src/config/`)
  +-- Plugins (`src/plugins/`)
  +-- Infra (`src/infra/`)
  +-- Logging (`src/logging/`)
  +-- Security (`src/security/`)
  +-- ...
  |
  v
Node.js Runtime
```

## Core Module Call Graph

### Config → Gateway
```
src/config/config.ts
  +-- resolveGatewayRuntimeConfig() in gateway/server.impl.ts
  +-- getRuntimeConfig() used everywhere
```

### Gateway → Channels
```
src/gateway/server.impl.ts
  +-- createChannelManager() → src/gateway/server-channels.ts
  +-- channelManager.startChannels() → per-channel plugin runtime
  +-- channel plugin runtime → src/plugins/runtime/runtime-channel.ts
```

### Gateway → Agents
```
src/gateway/server-request-context.ts
  +-- gateway methods route to agent runtime
  +-- chat completions → src/agents/ runtime
  +-- tool execution → src/agents/tools/
```

### Agents → Memory
```
src/agents/ (planner, runtime, tools)
  +-- memory queries → src/memory-host-sdk/ or extension memory-core
  +-- embeddings → provider extension
```

### Agents → LLM Providers
```
src/agents/runtime/
  +-- model selection → src/model-catalog/
  +-- provider transport → extension provider (openai, anthropic, etc.)
  +-- streaming response back through gateway WS
```

### Channels → Inbound Message → Agents
```
Channel Extension (telegram, whatsapp, etc.)
  +-- receives webhook/poll message
  +-- normalizes to internal envelope
  +-- dispatches via channel runtime
  +-- gateway routes to agent session
  +-- agent generates reply
  +-- reply dispatched back to channel
  +-- channel sends outbound message
```

## Dependency Flow Rules (from AGENTS.md)

1. **Core stays extension-agnostic** — no bundled extension IDs in core
2. **Extensions cross into core only via `openclaw/plugin-sdk/*`**
3. **Extension prod code: no core `src/**` imports** — only SDK facade, generic contracts
4. **Core tests: no deep plugin internals** — use `api.ts`, SDK facade, generic contracts
5. **Extension-owned behavior stays extension-owned** — repair, detection, onboarding, auth/provider defaults

## Key Internal APIs

### Plugin SDK Exports (from `package.json` exports)
The root `openclaw` package exports ~200+ plugin-sdk subpaths:
- `openclaw/plugin-sdk/runtime` — runtime helpers
- `openclaw/plugin-sdk/agent-runtime` — agent runtime contracts
- `openclaw/plugin-sdk/channel-runtime` — channel runtime contracts
- `openclaw/plugin-sdk/gateway-runtime` — gateway runtime contracts
- `openclaw/plugin-sdk/config-runtime` — config runtime contracts
- `openclaw/plugin-sdk/logging-core` — logging contracts
- `openclaw/plugin-sdk/memory-core` — memory contracts
- ...and many more

### Runtime Environment (`src/runtime.ts`)
Defines `RuntimeEnv` — the dependency container passed throughout:
- logger
- config
- session store
- plugin registry
- channel runtime
- ...

### CLI Dependency Container (`src/cli/deps.ts`)
`createDefaultDeps()` creates the default runtime env for CLI commands and gateway startup.

## Extension-to-Core Communication

Extensions register capabilities via:
1. **Manifest** (`openclaw.manifest.json` or similar) — declares channels, providers, tools, gateway methods
2. **Plugin entry point** — exports runtime factories
3. **Hooks** — `gateway_start`, `gateway_stop`, `config_change`, etc.

## Gateway Method Registration

```
Extension defines gateway methods in manifest
  |
  v
Plugin registry indexes methods
  |
  v
Gateway runtime creates method routing table
  |
  v
WS message → method dispatch → extension handler
```

## Config Reload Flow

```
Config file changed on disk
  |
  v
startManagedGatewayConfigReloader() detects change
  |
  v
Read new config snapshot
  |
  v
Validate against schema
  |
  v
Apply to runtime (hot reload)
  |
  v
Restart affected channels
  |
  v
Broadcast config_change event to connected clients
```

## Session Binding Flow

```
Inbound message arrives
  |
  v
Channel extracts sender ID, chat ID
  |
  v
Session key resolved (configurable: channel+user, thread, etc.)
  |
  v
Session store loaded (JSON file or memory)
  |
  v
Agent context built with session history
  |
  v
Reply generated → session updated → stored
```

---

*Evidence: `src/gateway/server.impl.ts`, `src/runtime.ts`, `src/cli/deps.ts`, `package.json` exports, `AGENTS.md` architecture rules.*
