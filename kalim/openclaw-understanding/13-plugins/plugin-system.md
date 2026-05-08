# Plugin System

## Overview

OpenClaw uses an **extension-first** architecture. Core delegates to plugins via the Plugin SDK (`packages/plugin-sdk/`). Extensions live in `extensions/*/`.

## Core-Extension Boundary (per AGENTS.md)

1. Core is extension-agnostic — no bundled IDs in core
2. Extensions cross into core only via `openclaw/plugin-sdk/*`
3. Extension prod code: no core `src/**` imports — only SDK facade
4. Extension-owned behavior stays extension-owned

## Plugin Lifecycle

```
Gateway Startup
  |
  v
Scan extensions (bundled + npm-installed)
  |
  v
Read manifests → validate against SDK schema
  |
  v
Register in PluginRegistry
  +-- channels → ChannelRuntimeFactory
  +-- providers → ProviderTransportFactory
  +-- tools → ToolFactory
  +-- gatewayHandlers → GatewayMethodHandler
  +-- hooks → HookHandler[]
  |
  v
Filter by config enabled
  |
  v
gateway_start hook per enabled plugin
```

## Manifest Format (inferred)

```typescript
type ExtensionManifest = {
  id: string;
  name: string;
  version: string;
  type: "channel" | "provider" | "tool" | "diagnostic" | "memory" | "voice";
  entry: string;
  exports?: {
    channels?: string[];
    providers?: string[];
    tools?: string[];
    skills?: string[];
    gatewayHandlers?: Record<string, string>;
    httpRoutes?: Array<{ path: string; method: string; handler: string }>;
    hooks?: string[];
  };
  configSchema?: any;
  dependencies?: { core?: string; extensions?: string[] };
};
```

## Plugin Registry

```typescript
type PluginRegistry = {
  extensions: Map<string, ExtensionEntry>;
  channels: Map<string, ChannelRuntimeFactory>;
  providers: Map<string, ProviderTransportFactory>;
  tools: Map<string, ToolFactory>;
  skills: Map<string, SkillFactory>;
  gatewayHandlers: Map<string, GatewayMethodHandler>;
  httpRoutes: Map<string, HttpRouteHandler>;
  hooks: Map<string, HookHandler[]>;
  loadErrors: Array<{ extensionId: string; error: string }>;
};
```

## Hook System

| Hook | When |
|------|------|
| `gateway_start` | Gateway startup |
| `gateway_stop` | Shutdown |
| `config_change` | Hot reload |
| `channel_start/stop` | Channel lifecycle |
| `session_create/delete` | Session lifecycle |
| `agent_start/complete` | Agent run |
| `message_inbound/outbound` | Message |
| `diagnostic` | Diagnostics |

## Auto-Enable

Plugins auto-enabled based on env vars:
- `TELEGRAM_BOT_TOKEN` → telegram
- `OPENAI_API_KEY` → openai
- `ANTHROPIC_API_KEY` → anthropic
- etc.

From `src/config/plugin-auto-enable.ts`.

## Plugin Security Note

**No sandbox observed.** Extensions run in same Node.js process with full access to:
- All secrets and config
- All sessions and messages
- File system, network, memory

Malicious plugin = full system compromise.

## Key Files

- `src/plugins/runtime/runtime-channel.ts` — Channel runtime factory
- `src/plugins/runtime/types.ts` — Plugin runtime types
- `src/plugins/hook-runner-global.ts` — Global hook runner
- `src/plugins/bundled-runtime-deps-activity.ts` — Bundled vs dynamic tracking
- `src/extensionAPI.ts` — Extension API surface
- `packages/plugin-sdk/` — Published SDK
- `src/config/plugin-auto-enable.ts` — Auto-enable logic

---

*Evidence: `src/plugins/` directory, `packages/plugin-sdk/`, `src/config/plugin-auto-enable.ts`, `AGENTS.md` architecture rules.*
