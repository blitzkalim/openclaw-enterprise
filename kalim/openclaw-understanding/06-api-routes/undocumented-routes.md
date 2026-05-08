# Undocumented & Internal Routes

## Observation

The OpenClaw codebase does not use a traditional Express/Fastify/Hono router with explicit route declarations. Instead, routes are dynamically registered through:

1. **Plugin route registry** — plugins declare HTTP routes in their manifest
2. **WebSocket method dispatch** — JSON-RPC-like method routing
3. **Static file serving** — React SPA catch-all

This means many "routes" are not visible in a single route definition file but are scattered across plugin handlers.

## Inferred Internal Routes

Based on architecture, capabilities, and plugin handler patterns, the following routes likely exist but are not directly observed in core files reviewed:

### File/Media Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/files/upload` | POST | Upload handler | `src/media/` exists, media handling in agent runtime |
| `/files/:id` | GET | File download | `src/media/` MIME handling |
| `/files/:id` | DELETE | File delete | Media cleanup logic |
| `/canvas/render` | GET/POST | Canvas host | `src/canvas-host/` exists |
| `/canvas/state` | GET/POST | Canvas state | Canvas feature in UI |

### Voice/Audio Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/voice/tts` | POST | Text-to-speech | `src/tts/` exists, ElevenLabs/Azure extensions |
| `/voice/stt` | POST | Speech-to-text | `src/realtime-transcription/`, Deepgram extension |
| `/voice/stream` | WS | Real-time voice | `src/realtime-voice/` exists |

### Memory Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/memory/search` | POST | Vector search | `src/memory-host-sdk/`, `extensions/memory-core/` |
| `/memory/add` | POST | Add memory | Memory core extension |
| `/memory/delete` | POST | Delete memory | Memory management |
| `/memory/summary` | GET | Memory summary | Context engine uses memory |

### Agent/Session Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/sessions` | GET | List sessions | `src/sessions/session-store.ts` |
| `/sessions/:id` | GET | Get session | Session persistence |
| `/sessions/:id` | DELETE | Delete session | Session cleanup |
| `/sessions/:id/messages` | GET | Session messages | Conversation history |
| `/agents` | GET | List agents | `src/agents/` runtime |
| `/agents/:id/run` | POST | Run agent | Agent execution |

### Plugin Management Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/plugins` | GET | List plugins | Plugin registry |
| `/plugins/:id/enable` | POST | Enable plugin | `src/plugins/runtime/` |
| `/plugins/:id/disable` | POST | Disable plugin | Plugin lifecycle |
| `/plugins/:id/config` | GET/POST | Plugin config | Config per plugin |

### Diagnostics/Debug Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/diagnostics` | GET | Run diagnostics | `src/infra/diagnostic-events.ts` |
| `/diagnostics/status` | GET | Diagnostic status | Health subsystem |
| `/logs` | GET | Stream logs | `src/logging/` subsystem |
| `/trace` | GET | OpenTelemetry traces | `extensions/diagnostics-otel/` |

### Device/Pairing Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/pair` | POST | Initiate pairing | `src/pairing/` exists |
| `/pair/verify` | POST | Verify pairing code | Device pairing feature |
| `/devices` | GET | List paired devices | `src/pairing/` |

### Wizard/Onboarding Routes

| Route | Method | Likely Handler | Evidence |
|-------|--------|-------------|----------|
| `/wizard/status` | GET | Wizard status | `src/wizard/` exists |
| `/wizard/step` | POST | Advance wizard | Onboarding flow |

## WS Method Registry (Undocumented)

Plugins register WebSocket methods dynamically. Known methods from architecture:

| Method | Source | Purpose |
|--------|--------|---------|
| `browser_navigate` | Browser extension | Navigate browser |
| `browser_screenshot` | Browser extension | Take screenshot |
| `browser_click` | Browser extension | Click element |
| `browser_type` | Browser extension | Type text |
| `code_execute` | Code interpreter | Run code |
| `file_read` | File tool | Read file |
| `file_write` | File tool | Write file |
| `web_search` | Web search extension | Search web |
| `memory_recall` | Memory extension | Recall memories |
| `image_generate` | Image gen extension | Generate image |
| `video_generate` | Video gen extension | Generate video |
| `music_generate` | Music gen extension | Generate music |
| `tts_speak` | TTS extension | Text-to-speech |
| `stt_transcribe` | STT extension | Speech-to-text |

## Route Discovery Method

To find all routes programmatically:

```bash
# Search for route patterns in extensions
grep -r "route\|path\|handler" extensions/*/src/ --include="*.ts" | grep -i "get\|post\|put\|delete\|ws\|websocket"

# Search for gateway method registrations
grep -r "registerGatewayMethod\|gatewayHandlers\|gatewayMethod" extensions/ src/ --include="*.ts"

# Search for HTTP server route registration
grep -r "app\.get\|app\.post\|app\.use\|router\." src/gateway/ --include="*.ts"
```

## Static Asset Catch-All

The Control UI is served as a React SPA with a catch-all route:

```
GET /control-ui/* → Serve index.html (SPA routing)
```

This means any path under `/control-ui/` that doesn't match a static file falls through to the React router.

## No Traditional REST API Docs

OpenClaw does not expose a traditional REST API with OpenAPI/Swagger documentation. The primary API surfaces are:
1. **OpenAI-compatible** (`/v1/*`) — externally documented by OpenAI
2. **WebSocket methods** — internal, dynamic, plugin-extensible
3. **Plugin routes** — extension-defined, no central registry in core

## Recommendation

For full route inventory:
- Run gateway with `OPENCLAW_GATEWAY_STARTUP_TRACE=1` to log plugin registrations
- Inspect `pluginRouteRegistry` at runtime
- Scan all extension manifests for `gatewayHandlers` and `httpRoutes`

---

*Evidence: Architecture inference from `src/gateway/server-request-context.ts`, `src/gateway/server-runtime-state.ts`, `src/plugins/runtime/`, extension directory structure, and AGENTS.md plugin architecture rules.*
