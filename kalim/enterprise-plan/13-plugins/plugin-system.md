# Plugin System

## Purpose
How plugins are loaded, activated, and sandboxed.

## Findings

### Plugin Types

1. **Channel Plugins** — messaging channels (WhatsApp, Telegram, etc.)
2. **Provider Plugins** — LLM providers (OpenAI, Anthropic, etc.)
3. **Tool Plugins** — additional tools/skills
4. **Diagnostics Plugins** — monitoring (OTEL, Prometheus)
5. **Integration Plugins** — external service connectors

### Plugin Manifest

Each extension declares capabilities in `package.json`:

```json
{
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "channel": { "id": "telegram", "label": "Telegram" },
    "install": { "npmSpec": "@openclaw/telegram" },
    "bundle": { "stageRuntimeDependencies": true }
  }
}
```

### Loading Pipeline

```
Scan extensions/*/
  -> read package.json openclaw block
    -> validate manifest
      -> resolve dependencies
        -> stage runtime dependencies (if bundled)
          -> import() extension entry point
            -> register with plugin runtime
              -> activate channel/provider/tool handlers
```

### Plugin Runtime

- `src/plugins/runtime/runtime-registry-loader.ts` — registry loader
- `src/plugins/runtime/runtime-channel.ts` — channel runtime
- `src/plugins/runtime/runtime-tasks.ts` — task runtime
- `src/plugins/runtime/runtime-config.ts` — config runtime
- `src/plugins/runtime/runtime-events.ts` — event runtime

### Plugin SDK Contract

- `packages/plugin-sdk/` — published SDK package
- `src/plugins/contracts/plugin-sdk-subpaths.ts` — subpath validation
- Plugins access core only via SDK exports
- No direct `src/` imports allowed for extensions

### Bundled vs Installed

1. **Bundled** — in `extensions/*/` directory, ship with repo
   - Staged at build time
   - Runtime dependencies bundled

2. **Installed** — via `npm install` or `openclaw install`
   - Discovered from `node_modules/`
   - `src/plugins/installed-plugin-index-records.ts` — index tracking

### Activation Order

1. Config plugins (from `openclaw.json`)
2. Bundled extensions
3. Installed npm packages
4. Runtime-discovered plugins

### Plugin Lifecycle

```
load -> setup -> activate -> running -> deactivate -> unload
```

- `setupEntry` called during wizard/onboarding
- `extensions` entry called at runtime activation
- Hooks: `onConfigChange`, `onShutdown`, `onHealthCheck`

## Evidence
- `src/plugins/runtime/` — runtime implementations
- `src/plugins/loader.ts` — plugin loader
- `src/plugins/runtime/runtime-registry-loader.ts` — registry
- `packages/plugin-sdk/` — SDK package
- `extensions/*/package.json` — manifests

## Notes
- Plugins run in same Node.js process (no true isolation)
- Plugin crash can bring down entire gateway
- Native addons (matrix-sdk-crypto) require platform-specific builds
- Plugin activation order matters for channel dependencies
