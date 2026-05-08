# OpenClaw Deep Audit — Master Navigation

## Project Identity

- **Name:** OpenClaw
- **Version:** 2026.4.26
- **Repository:** https://github.com/openclaw/openclaw
- **License:** MIT
- **Description:** Multi-channel AI gateway with extensible messaging integrations — a personal AI assistant you run on your own devices.

## Detected Stack

- **Runtime:** Node.js 22+ (ESM, strict TypeScript)
- **Package Manager:** pnpm (monorepo workspace)
- **Build:** Custom scripts (tsdown, esbuild), `pnpm build`
- **Test:** Vitest
- **Format:** oxfmt (not Prettier)
- **Lint:** oxlint
- **Docker:** Dockerfile + docker-compose.yml
- **Platforms:** macOS, iOS, Android, Linux, Windows (WSL2)

## Monorepo Structure

- Root package (`openclaw`) + `ui/` + `packages/*` + `extensions/*`
- `src/` — Core TypeScript source
- `apps/` — Native apps (Android, iOS, macOS)
- `extensions/` — Plugin extensions (100+ channels/providers)
- `docs/` — Mint-based documentation site
- `test/` — Shared test utilities

## Major Services / Subsystems

| Subsystem | Location | Role |
|-----------|----------|------|
| Gateway | `src/gateway/` | HTTP/WebSocket control plane, auth, routing |
| Agents | `src/agents/` | AI agent runtime, tool calling, LLM orchestration |
| Channels | `src/channels/` + `extensions/*/src/` | Multi-channel messaging ingress/egress |
| Plugins | `src/plugins/` + `extensions/*/src/` | Plugin lifecycle, registry, runtime |
| Config | `src/config/` | Typed config loader, schema, reload |
| CLI | `src/cli/` | Commander-based CLI (`openclaw` command) |
| Skills | `skills/` + `src/agents/skills/` | Skill definitions and execution |
| UI | `ui/` | Frontend (likely React/Vite based) |
| Memory | `src/memory-host-sdk/` + `extensions/memory-core/` | Vector memory, embeddings, search |
| TTS/STT | `src/tts/`, `src/realtime-voice/` | Voice synthesis / transcription |
| Media | `src/media/`, `src/media-generation/` | File/media handling |
| Security | `src/security/`, `src/secrets/` | Auth, secrets, rate-limiting |
| Observability | `src/logging/`, `src/infra/diagnostic-events.js` | Logging, OTel, Prometheus |

## Quick Links to Generated Reports

| Section | Folder | Key Files |
|---------|--------|-----------|
| 01 — Repo Map | `/kalim/01-repo-map/` | `tree.md`, `important-files.md`, `architecture-detected.md` |
| 02 — Runtime Flow | `/kalim/02-runtime-flow/` | `startup-sequence.md`, `request-lifecycle.md`, `internal-service-flow.md` |
| 03 — Config & Env | `/kalim/03-config-env/` | `all-env-vars.md`, `config-system.md` |
| 04 — Auth & Security | `/kalim/04-auth-security/` | `auth-overview.md`, `tokens-and-sessions.md`, `middleware.md`, `permissions.md`, `security-findings.md` |
| 05 — Gateway | `/kalim/05-gateway/` | `gateway-architecture.md`, `gateway-token-deep-dive.md`, `external-ingress.md` |
| 06 — API Routes | `/kalim/06-api-routes/` | `route-map.md`, `controllers-handlers.md`, `undocumented-routes.md` |
| 07 — DB Models | `/kalim/07-db-models/` | `db-stack.md`, `schema-map.md`, `relationships.md`, `migrations.md` |
| 08 — Channels | `/kalim/08-channels/` | `supported-channels.md`, `message-normalization.md`, `outbound-messaging.md` |
| 09 — WhatsApp | `/kalim/09-whatsapp/` | `whatsapp-current-state.md`, `webhook-flow.md`, `auth-signature.md`, `media-flow.md` |
| 10 — Telegram | `/kalim/10-telegram/` | `telegram-current-state.md`, `webhook-or-polling.md`, `command-flow.md` |
| 11 — Agents | `/kalim/11-agents/` | `agent-architecture.md`, `orchestration.md`, `llm-providers.md` |
| 12 — Skills | `/kalim/12-skills/` | `skills-system.md`, `built-in-skills.md` |
| 13 — Plugins | `/kalim/13-plugins/` | `plugin-system.md`, `available-plugins.md`, `plugin-security.md` |
| 14 — Workers & Jobs | `/kalim/14-workers-jobs/` | `queues.md`, `background-jobs.md` |
| 15 — Streaming & Events | `/kalim/15-streaming-events/` | `realtime.md`, `bidirectional-flow.md` |
| 16 — Storage & Files | `/kalim/16-storage-files/` | `uploads.md`, `blob-storage.md`, `temp-files.md` |
| 17 — UI Frontend | `/kalim/17-ui-frontend/` | `frontend-stack.md`, `pages-features.md`, `auth-ui.md` |
| 18 — DevOps & Deploy | `/kalim/18-devops-deploy/` | `docker.md`, `k8s.md`, `production-deploy.md`, `scaling.md` |
| 19 — Testing & Quality | `/kalim/19-testing-quality/` | `tests.md`, `code-health.md` |
| 20 — Observability | `/kalim/20-observability/` | `logging.md`, `metrics.md`, `tracing.md` |
| 21 — Dependencies | `/kalim/21-dependencies/` | `dependency-audit.md`, `risky-dependencies.md` |
| 22 — Risks & Gaps | `/kalim/22-risks-gaps/` | `architecture-risks.md`, `multi-tenant-readiness.md` |
| 23 — Code Search Ref | `/kalim/23-code-search-reference/` | `grep-index.md` |
| 24 — Executive Summary | `/kalim/24-executive-summary/` | `final-summary.md` |

## Audit Methodology

- All findings derived from direct file inspection, code tracing, and config reading.
- Where inference is required, marked with `Assumption:`.
- File paths cited in `@path:line` format per AGENTS.md rules.

---

*Generated by deep audit of OpenClaw enterprise repository.*
