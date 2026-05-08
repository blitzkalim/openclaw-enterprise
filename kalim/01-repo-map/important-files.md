# Top 100 Important Files

## Entry Points & CLI

| File | Why It Matters |
|------|--------------|
| `src/entry.ts` | Main CLI entry — argv parsing, respawn logic, runs `runCli` |
| `src/index.ts` | Legacy entry — library exports + error handlers |
| `openclaw.mjs` | Published CLI binary wrapper |
| `src/cli/run-main.ts` | Commander program setup, subcommand registration |
| `src/cli/deps.ts` | Default CLI dependency container |

## Gateway

| File | Why It Matters |
|------|--------------|
| `src/gateway/server.impl.ts` | Gateway HTTP/WebSocket server implementation — full lifecycle |
| `src/gateway/auth.ts` | Gateway auth resolution (token, password, tailscale, trusted-proxy) |
| `src/gateway/auth-resolve.ts` | Effective shared gateway auth resolution |
| `src/gateway/auth-rate-limit.ts` | Auth rate limiting |
| `src/gateway/server-runtime-state.ts` | Gateway runtime state (clients, WSS, dedupe, chat runs) |
| `src/gateway/server-request-context.ts` | Request context for gateway handlers |
| `src/gateway/server-channels.ts` | Channel manager (start/stop channels) |
| `src/gateway/server-ws-runtime.ts` | WebSocket handler attachment |
| `src/gateway/server-startup.ts` | Gateway early & post-attach runtime |
| `src/gateway/server-runtime-services.ts` | Gateway runtime services activation |
| `src/gateway/server-aux-handlers.ts` | Auxiliary gateway handlers (approval, exec) |
| `src/gateway/server-model-catalog.ts` | Model catalog loading for gateway |
| `src/gateway/server-reload-handlers.ts` | Config reload on gateway |
| `src/gateway/mcp-http.ts` | MCP loopback server |
| `src/gateway/server/tls.ts` | Gateway TLS runtime |
| `src/gateway/server/health-state.ts` | Health/presence state |
| `src/gateway/server/readiness.ts` | Readiness checker |

## Config System

| File | Why It Matters |
|------|--------------|
| `src/config/config.ts` | Core config types, loading, snapshots, overrides |
| `src/config/schema.ts` | Config schema (Zod-based) |
| `src/config/io.ts` | Config file I/O (read/write) |
| `src/config/sessions.ts` | Session key resolution from config |
| `src/config/plugin-auto-enable.ts` | Auto-enable plugins based on env |

## Agents & AI Runtime

| File | Why It Matters |
|------|--------------|
| `src/agents/` (1,492 items) | Agent runtime, planner, tool calling, streaming |
| `src/agents/runtime/` | Agent runtime core |
| `src/agents/planner/` | Agent planning / orchestration |
| `src/agents/skills/` | Skill execution within agents |
| `src/agents/tools/` | Tool definitions and handlers |
| `src/model-catalog/` | LLM provider model catalog |
| `src/context-engine/` | Context engine for conversations |

## Channels

| File | Why It Matters |
|------|--------------|
| `src/channels/plugins/index.ts` | Channel plugin registry |
| `src/channels/message-normalization.ts` | Inbound message normalization |
| `src/channels/outbound-messaging.ts` | Outbound reply dispatch |
| `src/channels/webhook-router.ts` | Webhook route dispatch |

## Plugins

| File | Why It Matters |
|------|--------------|
| `src/plugins/runtime/runtime-channel.ts` | Channel runtime factory |
| `src/plugins/runtime/types.ts` | Plugin runtime types |
| `src/plugins/hook-runner-global.ts` | Global plugin hook runner |
| `src/plugins/bundled-runtime-deps-activity.ts` | Bundled plugin runtime deps |
| `src/extensionAPI.ts` | Extension API surface |
| `packages/plugin-sdk/` | Published plugin SDK |

## Security & Auth

| File | Why It Matters |
|------|--------------|
| `src/security/secret-equal.ts` | Constant-time secret comparison |
| `src/secrets/runtime.ts` | Secrets runtime snapshot |
| `src/secrets/resolution.ts` | Secret resolution from providers |
| `src/infra/env.ts` | Environment normalization |
| `src/infra/tailscale.ts` | Tailscale whois integration |

## Infrastructure

| File | Why It Matters |
|------|--------------|
| `src/infra/` (665 items) | Core infrastructure utilities |
| `src/infra/env.ts` | Environment variable normalization |
| `src/infra/errors.ts` | Error formatting |
| `src/infra/restart.ts` | SIGUSR1 restart policy |
| `src/infra/fatal-error-hooks.ts` | Fatal error hooks |
| `src/infra/system-events.ts` | System event queue |
| `src/infra/diagnostic-events.ts` | Diagnostic event flags |
| `src/infra/is-main.ts` | Main module detection |
| `src/infra/openclaw-exec-env.ts` | CLI exec marker |
| `src/infra/path-env.ts` | PATH environment setup |
| `src/infra/tailscale.ts` | Tailscale integration |
| `src/infra/voicewake-routing.ts` | Voice wake routing |

## Logging & Observability

| File | Why It Matters |
|------|--------------|
| `src/logger.ts` | Core logger |
| `src/logging/` (57 items) | Logging subsystem |
| `src/logging/subsystem.ts` | Subsystem logger factory |
| `src/logging/diagnostic.ts` | Diagnostic heartbeat |
| `extensions/diagnostics-otel/` | OpenTelemetry extension |
| `extensions/diagnostics-prometheus/` | Prometheus extension |

## Media & Voice

| File | Why It Matters |
|------|--------------|
| `src/media/` (72 items) | Media handling |
| `src/tts/` (17 items) | Text-to-speech |
| `src/realtime-voice/` (11 items) | Real-time voice |
| `src/realtime-transcription/` (4 items) | Real-time STT |
| `src/video-generation/` (14 items) | Video generation |
| `src/image-generation/` (10 items) | Image generation |
| `src/music-generation/` (10 items) | Music generation |
| `src/media-understanding/` (68 items) | Media understanding (vision) |

## Memory

| File | Why It Matters |
|------|--------------|
| `src/memory-host-sdk/` (72 items) | Memory host SDK |
| `extensions/memory-core/` (125 items) | Vector memory core |
| `extensions/memory-lancedb/` (13 items) | LanceDB backend |
| `extensions/memory-wiki/` (62 items) | Wiki memory |

## Cron & Tasks

| File | Why It Matters |
|------|--------------|
| `src/cron/` (163 items) | Cron scheduling |
| `src/tasks/` (51 items) | Background task registry |
| `src/tasks/task-registry.maintenance.ts` | Task registry maintenance |

## Sessions & State

| File | Why It Matters |
|------|--------------|
| `src/sessions/` (18 items) | Session store |
| `src/sessions/session-store.ts` | Session persistence |
| `src/sessions/session-binding.ts` | Session binding |

## Web & Network

| File | Why It Matters |
|------|--------------|
| `src/web/` (2 items) | Web utilities |
| `src/web-fetch/` (3 items) | Web fetch providers |
| `src/web-search/` (3 items) | Web search providers |
| `src/gateway/net.ts` | Network utilities (IP, proxy, loopback) |
| `src/gateway/origin-check.ts` | Browser origin verification |

## Build & Scripts

| File | Why It Matters |
|------|--------------|
| `package.json` | Root manifest, 1,800+ lines of exports |
| `pnpm-workspace.yaml` | Workspace definition |
| `tsconfig.json` | Root TypeScript config |
| `vitest.config.ts` | Test config |
| `Dockerfile` | Container build |
| `docker-compose.yml` | Compose stack |
| `scripts/build-all.mjs` | Build orchestration |
| `scripts/run-node.mjs` | Dev runner |
| `scripts/tsdown-build.mjs` | tsdown build |
| `knip.config.ts` | Dead code config |

## Documentation

| File | Why It Matters |
|------|--------------|
| `docs/` (520 items) | Mint-based docs site |
| `README.md` | Project README (86KB) |
| `AGENTS.md` | AI agent rules for this repo |
| `VISION.md` | Project vision |
| `CHANGELOG.md` | Release changelog (1.4MB) |

## Extensions (Key Channels)

| File | Why It Matters |
|------|--------------|
| `extensions/whatsapp/src/` | WhatsApp Baileys integration |
| `extensions/telegram/src/` | Telegram Bot API integration |
| `extensions/discord/src/` | Discord bot integration |
| `extensions/slack/src/` | Slack bot integration |
| `extensions/signal/src/` | Signal integration |
| `extensions/imessage/src/` | iMessage (macOS) |
| `extensions/matrix/src/` | Matrix protocol |
| `extensions/msteams/src/` | MS Teams |
| `extensions/googlechat/src/` | Google Chat |
| `extensions/line/src/` | LINE |
| `extensions/zalo/src/` | Zalo |
| `extensions/feishu/src/` | Feishu/Lark |
| `extensions/mattermost/src/` | Mattermost |
| `extensions/irc/src/` | IRC |
| `extensions/nostr/src/` | Nostr |
| `extensions/twitch/src/` | Twitch |
| `extensions/nextcloud-talk/src/` | Nextcloud Talk |
| `extensions/qqbot/src/` | QQ Bot |
| `extensions/webhooks/src/` | Generic webhooks |

## Extensions (Key Providers)

| File | Why It Matters |
|------|--------------|
| `extensions/openai/src/` | OpenAI provider |
| `extensions/anthropic/src/` | Anthropic provider |
| `extensions/google/src/` | Google/Gemini provider |
| `extensions/deepseek/src/` | DeepSeek provider |
| `extensions/mistral/src/` | Mistral provider |
| `extensions/ollama/src/` | Ollama local provider |
| `extensions/lmstudio/src/` | LM Studio provider |
| `extensions/together/src/` | Together AI |
| `extensions/fireworks/src/` | Fireworks AI |
| `extensions/groq/src/` | Groq |
| `extensions/xai/src/` | xAI (Grok) |
| `extensions/qwen/src/` | Qwen |
| `extensions/moonshot/src/` | Moonshot |
| `extensions/openrouter/src/` | OpenRouter |
| `extensions/byteplus/src/` | BytePlus |
| `extensions/minimax/src/` | MiniMax |
| `extensions/zai/src/` | Z.ai |
| `extensions/synthetic/src/` | Synthetic provider |
| `extensions/azure-speech/src/` | Azure Speech |
| `extensions/elevenlabs/src/` | ElevenLabs TTS |
| `extensions/deepgram/src/` | Deepgram STT |
| `extensions/brave/src/` | Brave Search |
| `extensions/perplexity/src/` | Perplexity |
| `extensions/firecrawl/src/` | Firecrawl |
| `extensions/tavily/src/` | Tavily |
| `extensions/searxng/src/` | SearXNG |
| `extensions/duckduckgo/src/` | DuckDuckGo |
