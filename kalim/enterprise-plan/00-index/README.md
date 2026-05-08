# OpenClaw Enterprise Audit — Index

## Project

- **Name**: OpenClaw
- **Version**: 2026.4.26
- **Repository**: https://github.com/openclaw/openclaw
- **License**: MIT

## Detected Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 24 (recommended) or Node.js 22.14+ |
| Language | TypeScript (ESM, strict) |
| Package Manager | pnpm (workspace monorepo) |
| Bundler | tsx (dev), Rolldown (build) |
| UI | Lit (Web Components) + Vite |
| Native Apps | Swift (iOS/macOS), Kotlin (Android) |
| Testing | Vitest |
| Linting | oxlint + oxfmt |
| Container | Docker (bookworm-slim) |
| Config | JSON5 / JSON + dotenv |

## Repo Structure Type

**Modular Monolith with Plugin Extension Model**

- Single-process Gateway (Node.js)
- 100+ extensions loaded as plugins at runtime
- Core is extension-agnostic; plugins cross into core only via `openclaw/plugin-sdk/*`
- Native apps are thin clients connecting to the Gateway

## Major Services / Modules

1. **Gateway** (`src/gateway/`) — HTTP/WebSocket server, auth, routing, health
2. **Agents** (`src/agents/`) — AI agent runtime, orchestration, tool execution
3. **Channels** (`src/channels/`) — Multi-channel message normalization & routing
4. **Config** (`src/config/`) — Typed config system with schema validation
5. **Plugins** (`src/plugins/`) — Plugin runtime, registry, activation
6. **Cron** (`src/cron/`) — Job scheduling & execution
7. **Tasks** (`src/tasks/`) — Background task registry
8. **Security** (`src/security/`) — DM policies, SSRF, sandboxing
9. **CLI** (`src/cli/`, `src/commands/`) — Commander-based CLI
10. **Auto-reply** (`src/auto-reply/`) — Message dispatch & deduplication

## Quick Links to Generated Reports

| Section | Path |
|---------|------|
| Repo Map | `../01-repo-map/` |
| Runtime Flow | `../02-runtime-flow/` |
| Config & Env | `../03-config-env/` |
| Auth & Security | `../04-auth-security/` |
| Gateway | `../05-gateway/` |
| API Routes | `../06-api-routes/` |
| DB Models | `../07-db-models/` |
| Channels | `../08-channels/` |
| WhatsApp | `../09-whatsapp/` |
| Telegram | `../10-telegram/` |
| Agents | `../11-agents/` |
| Skills | `../12-skills/` |
| Plugins | `../13-plugins/` |
| Workers & Jobs | `../14-workers-jobs/` |
| Streaming & Events | `../15-streaming-events/` |
| Storage & Files | `../16-storage-files/` |
| UI Frontend | `../17-ui-frontend/` |
| DevOps & Deploy | `../18-devops-deploy/` |
| Testing & Quality | `../19-testing-quality/` |
| Observability | `../20-observability/` |
| Dependencies | `../21-dependencies/` |
| Risks & Gaps | `../22-risks-gaps/` |
| Code Search Reference | `../23-code-search-reference/` |
| Executive Summary | `../24-executive-summary/` |

## Audit Timestamp

2026-04-27 UTC+05:30
