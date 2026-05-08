# Repository Folder Tree & Purposes

## Root Level

| Path | Type | Purpose |
|------|------|---------|
| `src/` | Core source | Main TypeScript ESM codebase (~7,359 items) |
| `extensions/` | Extensions | 100+ plugin extensions (~5,760 items) |
| `apps/` | Native apps | Android (Kotlin), iOS (Swift), macOS (Swift) |
| `packages/` | Shared packages | `plugin-sdk/`, `plugin-package-contract/`, `memory-host-sdk/` |
| `ui/` | Frontend | UI package (~338 items) |
| `docs/` | Documentation | Mint-based docs site (~520 items) |
| `test/` | Test utilities | Shared test helpers, fixtures |
| `scripts/` | Build scripts | Custom build, lint, format, check scripts |
| `skills/` | Skills definitions | Built-in skill catalog (~72 items) |
| `qa/` | QA infrastructure | QA lab, test lanes |
| `.github/` | CI/CD | GitHub Actions workflows, issue templates |

## `src/` Core Subdirectories

| Path | Items | Purpose |
|------|-------|---------|
| `src/acp/` | 66 | Agent Communication Protocol (ACP) |
| `src/agents/` | 1,492 | AI agent runtime, tools, orchestration, planner |
| `src/auto-reply/` | 485 | Auto-reply dispatcher, deduplication |
| `src/bootstrap/` | 4 | Bootstrap initialization |
| `src/canvas-host/` | 7 | Canvas host server (live UI rendering) |
| `src/channels/` | 284 | Channel plugin registry, normalization, routing |
| `src/cli/` | 389 | Commander CLI, argument parsing, profiles |
| `src/commands/` | 588 | CLI command implementations (`gateway`, `config`, `doctor`, etc.) |
| `src/config/` | 322 | Typed config system, schema, reload, overrides |
| `src/context-engine/` | 7 | Context engine for agent conversations |
| `src/crestodian/` | 23 | Config crestodian / migration helpers |
| `src/cron/` | 163 | Cron scheduling, job registry |
| `src/daemon/` | 64 | Systemd/launchd daemon management |
| `src/flows/` | 18 | Flow orchestration |
| `src/gateway/` | 620 | Gateway HTTP/WebSocket server, auth, routing, health |
| `src/hooks/` | 61 | Plugin hooks lifecycle |
| `src/i18n/` | 1 | Internationalization |
| `src/image-generation/` | 10 | Image generation orchestration |
| `src/infra/` | 665 | Infrastructure utilities (env, paths, errors, restart, etc.) |
| `src/interactive/` | 2 | Interactive TUI elements |
| `src/logging/` | 57 | Structured logging subsystem |
| `src/markdown/` | 16 | Markdown processing |
| `src/mcp/` | 12 | Model Context Protocol (MCP) integration |
| `src/media/` | 72 | Media handling, MIME, storage |
| `src/media-generation/` | 6 | Media generation orchestration |
| `src/media-understanding/` | 68 | Media understanding / vision models |
| `src/memory-host-sdk/` | 72 | Memory host SDK bindings |
| `src/model-catalog/` | 17 | Model provider catalog |
| `src/music-generation/` | 10 | Music generation orchestration |
| `src/node-host/` | 16 | Node.js host runtime |
| `src/pairing/` | 13 | Device pairing |
| `src/plugin-sdk/` | 464 | Plugin SDK internal bindings |
| `src/plugins/` | 500 | Plugin runtime, registry, activation |
| `src/process/` | 33 | Process management, child process bridge |
| `src/proxy-capture/` | 15 | Proxy capture for debugging |
| `src/realtime-transcription/` | 4 | Real-time speech-to-text |
| `src/realtime-voice/` | 11 | Real-time voice conversation |
| `src/routing/` | 15 | Message routing |
| `src/runtime.ts` | — | Main runtime environment definition |
| `src/secrets/` | 113 | Secrets resolution, vault, runtime snapshots |
| `src/security/` | 79 | Security utilities (safe-equal, SSRF, etc.) |
| `src/sessions/` | 18 | Session store, binding, key resolution |
| `src/shared/` | 109 | Shared utilities |
| `src/status/` | 9 | Status reporting |
| `src/tasks/` | 51 | Background task registry |
| `src/terminal/` | 21 | Terminal/TUI utilities |
| `src/test-helpers/` | 9 | Test helpers |
| `src/test-utils/` | 44 | Test utilities |
| `src/trajectory/` | 8 | Trajectory / conversation history |
| `src/tts/` | 17 | Text-to-speech |
| `src/tui/` | 55 | Terminal UI (gateway chat, etc.) |
| `src/types/` | 10 | Core type definitions |
| `src/utils/` | 41 | General utilities |
| `src/video-generation/` | 14 | Video generation orchestration |
| `src/web/` | 2 | Web utilities |
| `src/web-fetch/` | 3 | Web fetch providers |
| `src/web-search/` | 3 | Web search providers |
| `src/wizard/` | 21 | Onboarding wizard |

## `extensions/` Notable Subdirectories

| Path | Purpose |
|------|---------|
| `extensions/whatsapp/` | WhatsApp channel (Baileys-based) |
| `extensions/telegram/` | Telegram channel (Bot API) |
| `extensions/discord/` | Discord channel |
| `extensions/slack/` | Slack channel |
| `extensions/signal/` | Signal channel |
| `extensions/imessage/` | iMessage channel (macOS) |
| `extensions/matrix/` | Matrix channel |
| `extensions/msteams/` | Microsoft Teams |
| `extensions/googlechat/` | Google Chat |
| `extensions/line/` | LINE channel |
| `extensions/zalo/` | Zalo channel |
| `extensions/feishu/` | Feishu/Lark |
| `extensions/mattermost/` | Mattermost |
| `extensions/irc/` | IRC |
| `extensions/nostr/` | Nostr |
| `extensions/twitch/` | Twitch |
| `extensions/nextcloud-talk/` | Nextcloud Talk |
| `extensions/qqbot/` | QQ Bot |
| `extensions/telegram/` | Telegram |
| `extensions/webhooks/` | Generic webhooks ingress |
| `extensions/openai/` | OpenAI provider |
| `extensions/anthropic/` | Anthropic provider |
| `extensions/google/` | Google/Gemini provider |
| `extensions/deepseek/` | DeepSeek provider |
| `extensions/mistral/` | Mistral provider |
| `extensions/ollama/` | Ollama local provider |
| `extensions/lmstudio/` | LM Studio local provider |
| `extensions/memory-core/` | Vector memory / embeddings |
| `extensions/memory-lancedb/` | LanceDB memory backend |
| `extensions/browser/` | Browser automation (CDP) |
| `extensions/elevenlabs/` | ElevenLabs TTS |
| `extensions/azure-speech/` | Azure Speech |
| `extensions/deepgram/` | Deepgram STT |
| `extensions/brave/` | Brave Search |
| `extensions/perplexity/` | Perplexity search |
| `extensions/firecrawl/` | Firecrawl web extraction |
| `extensions/diagnostics-otel/` | OpenTelemetry diagnostics |
| `extensions/diagnostics-prometheus/` | Prometheus metrics |
| `extensions/codex/` | OpenAI Codex integration |
| `extensions/github-copilot/` | GitHub Copilot proxy |
| `extensions/copilot-proxy/` | Copilot proxy |
| `extensions/device-pair/` | Device pairing |
| `extensions/bluebubbles/` | BlueBubbles (iMessage bridge) |
| `extensions/test-support/` | Test support utilities |
| `extensions/qa-*` | QA/testing infrastructure |

## `apps/` Native Applications

| Path | Platform | Stack |
|------|----------|-------|
| `apps/android/` | Android | Kotlin + Gradle |
| `apps/ios/` | iOS | Swift + XcodeGen |
| `apps/macos/` | macOS | Swift + XcodeGen |
| `apps/macos-mlx-tts/` | macOS TTS | MLX-based |
| `apps/shared/` | Shared | OpenClawKit (Swift shared code) |

## `packages/` Shared Packages

| Path | Purpose |
|------|---------|
| `packages/plugin-sdk/` | Plugin SDK package (published) |
| `packages/plugin-package-contract/` | Plugin package contract types |
| `packages/memory-host-sdk/` | Memory host SDK |

---

*Evidence from direct directory listing of root, src/, extensions/, apps/, packages/.*
