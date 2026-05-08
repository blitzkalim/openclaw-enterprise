# Config System

## Overview

OpenClaw uses a **typed, file-based configuration system** centered around `openclaw.json` (default location `~/.openclaw/openclaw.json`). Config supports hot-reloading, schema validation, and multi-source resolution.

## Config Sources (Precedence: highest → lowest)

From `.env.example` lines 8-12:

1. **Process environment variables** — existing non-empty vars are NOT overridden by dotenv
2. **`./.env`** — local dotenv file
3. **`~/.openclaw/.env`** — global dotenv file
4. **`openclaw.json` `env` block** — config-embedded env vars

Note: direct config keys (e.g. `gateway.auth.token`, channel tokens) are resolved **separately** from env loading and often take precedence over env fallbacks.

## Config File

### Default Path
- `~/.openclaw/openclaw.json` (configurable via `OPENCLAW_CONFIG_PATH`)
- JSON format with comments allowed (likely parsed with relaxed JSON parser)

### Key Sections (inferred from codebase)

Based on evidence from `src/config/config.ts`, `src/gateway/server.impl.ts`, and related files:

```jsonc
{
  "gateway": {
    "auth": {
      "mode": "token",        // token | password | trusted-proxy | none
      "token": "...",         // or env: OPENCLAW_GATEWAY_TOKEN
      "password": "...",      // or env: OPENCLAW_GATEWAY_PASSWORD
      "rateLimit": { ... },
      "trustedProxy": { ... },
      "allowTailscale": false
    },
    "bind": "lan",            // loopback | lan | tailnet | auto
    "port": 18789,
    "tls": { "enabled": false, ... },
    "controlUi": {
      "enabled": true,
      "allowedOrigins": ["..."]
    },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": false },
        "responses": { "enabled": false }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "...",
      "provider": "...",
      "sandbox": false,
      "tools": ["..."]
    }
  },
  "channels": {
    "telegram": { "enabled": true, "botToken": "..." },
    "whatsapp": { "enabled": true, ... },
    // ... per-channel config
  },
  "providers": {
    "openai": { "apiKey": "..." },
    // ... per-provider config
  },
  "memory": {
    "enabled": true,
    "engine": "...",
    "embeddingModel": "..."
  },
  "skills": {
    "enabled": ["..."],
    "autoDiscover": true
  },
  "cron": { ... },
  "env": {
    // embedded env vars
  }
}
```

## Config Loading Architecture

### 1. Snapshot Loading (`src/config/config.ts`)

```typescript
// loadGatewayStartupConfigSnapshot() in server.impl.ts
readConfigFileSnapshot() → ConfigSnapshot
```

- Reads file from disk
- Computes hash for change detection
- Returns `{ snapshot, hash, path, sourceConfig }`

### 2. Runtime Config Resolution (`src/gateway/server-runtime-config.ts`)

```typescript
resolveGatewayRuntimeConfig({
  cfg,           // loaded config
  port,          // CLI override
  bind,          // CLI override
  host,          // CLI override
  controlUiEnabled,
  openAiChatCompletionsEnabled,
  openResponsesEnabled,
  auth,          // CLI override
  tailscale,     // CLI override
}) → ResolvedRuntimeConfig
```

Merges file config with CLI flags and env vars.

### 3. Config Overrides (`src/config/config.ts`)

```typescript
applyConfigOverrides(configSnapshot.config) → OpenClawConfig
```

Applies runtime env-based overrides to the loaded config.

### 4. Hot Reload (`src/gateway/server-reload-handlers.ts`)

```typescript
startManagedGatewayConfigReloader({
  initialConfig,
  watchPath,
  readSnapshot,
  // ... callbacks for state updates
}) → ConfigReloader
```

- Watches config file for changes (fs watch or polling)
- Reads new snapshot, validates
- If valid: applies hot reload, restarts affected channels
- If invalid: recovers from last-known-good backup
- Broadcasts `config_change` event to WS clients

### 5. Last-Known-Good Backup

```typescript
promoteConfigSnapshotToLastKnownGood(snapshot)
recoverConfigFromLastKnownGood()
```

- On successful config load, promotes to backup
- On failed reload, falls back to last-known-good
- Prevents gateway crash from bad config edits

## Config Schema

### Typed with Zod

From `src/config/schema.ts` — config is validated with Zod schema.

Key types (from `src/config/config.ts` and related):

```typescript
type OpenClawConfig = {
  gateway?: GatewayConfig;
  agents?: AgentsConfig;
  channels?: Record<string, ChannelConfig>;
  providers?: Record<string, ProviderConfig>;
  memory?: MemoryConfig;
  skills?: SkillsConfig;
  cron?: CronConfig;
  env?: Record<string, string>;
};

type GatewayConfig = {
  auth?: GatewayAuthConfig;
  bind?: GatewayBindMode;
  port?: number;
  tls?: GatewayTlsConfig;
  controlUi?: ControlUiConfig;
  http?: GatewayHttpConfig;
};

type GatewayAuthConfig = {
  mode?: "token" | "password" | "trusted-proxy" | "none";
  token?: string;
  password?: string;
  rateLimit?: AuthRateLimitConfig;
  trustedProxy?: GatewayTrustedProxyConfig;
  allowTailscale?: boolean;
};

type GatewayTrustedProxyConfig = {
  userHeader: string;
  requiredHeaders?: string[];
  allowUsers?: string[];
};
```

## Config Write Protection

- Config writes go through `replaceConfigFile()` with atomic replacement
- Internal write hash tracking prevents reload loops
- `registerConfigWriteListener()` allows other systems to react to writes

## Wizard / Onboarding Config

The `openclaw onboard` wizard (`src/wizard/setup.ts`) generates initial config interactively:
- Detects channels to enable
- Prompts for API keys
- Generates gateway token
- Sets up allowed origins for Control UI

## Key Files

- `src/config/config.ts` — Core config types, loading, snapshots
- `src/config/schema.ts` — Zod validation schema
- `src/config/io.ts` — File I/O (read/write/replace)
- `src/config/sessions.ts` — Session key resolution from config
- `src/config/plugin-auto-enable.ts` — Auto-enable plugins based on env
- `src/gateway/server-runtime-config.ts` — Runtime config resolution
- `src/gateway/server-reload-handlers.ts` — Hot reload logic
- `src/wizard/setup.ts` — Onboarding wizard

---

*Evidence: `src/config/config.ts`, `src/gateway/server.impl.ts`, `src/gateway/server-runtime-config.ts`, `.env.example`, `src/wizard/`.*
