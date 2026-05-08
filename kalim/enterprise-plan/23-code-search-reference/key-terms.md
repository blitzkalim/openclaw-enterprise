# Code Search Reference

## Purpose
Quick reference for critical code search terms and locations.

## Findings

## Authentication & Security

| Term | Key Files |
|------|-----------|
| `OPENCLAW_GATEWAY_TOKEN` | `src/gateway/auth.ts`, `src/gateway/credentials.ts`, `.env.example` |
| `authorizeHttpGatewayConnect` | `src/gateway/auth.ts` |
| `password` | `src/gateway/startup-auth.ts`, `src/gateway/credentials.ts` |
| `deviceToken` | `src/gateway/auth.ts`, `src/gateway/startup-auth.ts` |
| `bootstrapToken` | `src/gateway/auth.ts`, `src/gateway/startup-auth.ts` |
| `rateLimit` | `src/gateway/rate-limit.ts` |
| `ssrf` | `src/security/ssrf.ts` |
| `sandbox` | `src/agents/sandbox/` |
| `trustedProxy` | `src/gateway/auth.ts` |
| `tailscale` | `src/gateway/auth.ts` |

## Gateway & Server

| Term | Key Files |
|------|-----------|
| `server.impl` | `src/gateway/server.impl.ts` |
| `server-http` | `src/gateway/server-http.ts` |
| `server-ws-runtime` | `src/gateway/server-ws-runtime.ts` |
| `voiceclaw-realtime` | `src/gateway/voiceclaw-realtime/` |
| `health` | `src/gateway/health.ts` |
| `managed-image-attachments` | `src/gateway/managed-image-attachments.ts` |

## Configuration

| Term | Key Files |
|------|-----------|
| `config.ts` | `src/config/config.ts` |
| `io.ts` | `src/config/io.ts` |
| `schema.base` | `src/config/schema.base.generated.ts` |
| `JSON5` | `src/config/` |
| `runtimeSnapshot` | `src/config/` |
| `wizardState` | `src/config/` |

## Agents & LLM

| Term | Key Files |
|------|-----------|
| `agent` | `src/agents/` |
| `openai-transport-stream` | `src/agents/openai-transport-stream.ts` |
| `anthropic-transport-stream` | `src/agents/anthropic-transport-stream.ts` |
| `openai-ws-stream` | `src/agents/openai-ws-stream.ts` |
| `subagent` | `src/agents/orchestration/` |
| `nodeInvocation` | `src/agents/` |
| `systemPrompt` | `src/agents/` |
| `thinking` | `src/agents/` |
| `apply-patch` | `src/agents/apply-patch.ts` |

## Channels

| Term | Key Files |
|------|-----------|
| `whatsapp` | `extensions/whatsapp/` |
| `baileys` | `extensions/whatsapp/`, `test/mocks/baileys.ts` |
| `telegram` | `extensions/telegram/` |
| `discord` | `extensions/discord/` |
| `slack` | `extensions/slack/` |
| `sendMessage` | Channel-specific implementations |
| `normalizeMessage` | `src/channels/` |
| `deliveryQueue` | `src/channels/delivery/` |

## Plugins & Extensions

| Term | Key Files |
|------|-----------|
| `plugin-sdk` | `packages/plugin-sdk/src/` |
| `openclaw.plugin.json` | Extension manifests |
| `api.ts` | Extension API surface |
| `runtime-api.ts` | Extension runtime API |
| `install` | `src/extensions/install/` |
| `loader` | `src/plugins/` |

## Database & Storage

| Term | Key Files |
|------|-----------|
| `sqlite` | `src/tasks/task-registry.store.sqlite.ts`, `src/proxy-capture/store.sqlite.ts` |
| `lancedb` | `extensions/memory-lancedb/` |
| `media/store` | `src/media/store.ts` |
| `fs-bridge` | `src/agents/sandbox/fs-bridge.ts` |
| `task-registry` | `src/tasks/` |

## Cron & Jobs

| Term | Key Files |
|------|-----------|
| `cron/service` | `src/cron/service/` |
| `task-registry.maintenance` | `src/tasks/task-registry.maintenance.ts` |
| `sweeper` | `src/tasks/`, `src/cron/` |

## Observability

| Term | Key Files |
|------|-----------|
| `otel` | `src/infra/telemetry.ts` (if exists), `.env.example` |
| `logging` | `src/logging/` |
| `system-events` | `src/infra/system-events.ts` |

## Testing

| Term | Key Files |
|------|-----------|
| `vitest` | `vitest.config.ts` |
| `test:changed` | `package.json` scripts |
| `extension-import-boundaries` | `test/extension-import-boundaries.test.ts` |
| `architecture-smells` | `test/architecture-smells.test.ts` |

## Docker & Deploy

| Term | Key Files |
|------|-----------|
| `docker-compose` | `docker-compose.yml` |
| `Dockerfile` | `Dockerfile` |
| `fly.toml` | `fly.toml` |
| `render.yaml` | `render.yaml` |

## UI

| Term | Key Files |
|------|-----------|
| `main.tsx` | `ui/src/main.tsx` |
| `vite.config` | `ui/vite.config.ts` |
| `chat/` | `ui/src/chat/` |
| `canvas/` | `ui/src/canvas/` |

## Common Search Patterns

```bash
# Find auth logic
grep -r "OPENCLAW_GATEWAY_TOKEN" src/ extensions/ --include="*.ts"

# Find all HTTP routes
grep -r "router\.(get|post|put|delete)" src/gateway/ --include="*.ts"

# Find WebSocket message handlers
grep -r "ws\|websocket" src/gateway/ --include="*.ts" -l

# Find all SQLite usage
grep -r "sqlite\|better-sqlite3" src/ extensions/ --include="*.ts"

# Find all LLM provider integrations
grep -r "openai\|anthropic\|gemini\|claude" src/agents/ --include="*.ts"

# Find extension manifests
find extensions/ -name "openclaw.plugin.json"

# Find all test files
find . -name "*.test.ts" -not -path "*/node_modules/*"

# Find environment variable definitions
grep -r "OPENCLAW_" src/ extensions/ --include="*.ts" | head -50

# Find sandbox / security boundaries
grep -r "sandbox\|ssrf\|rateLimit" src/ --include="*.ts" -l
```

## Evidence
- Files listed above
- Search results from previous audit phases

## Notes
- Use these terms for targeted code exploration
- Combine with ripgrep or grep for precise searches
- Many critical paths span multiple files
- Extension code is as important as core for understanding behavior
