# All Environment Variables Found in Codebase

## Gateway Auth & Paths

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | `.env.example`, `src/gateway/auth.ts`, `src/gateway/auth-resolve.ts`, `src/secrets/runtime-gateway-auth-surfaces.ts` | auto-generated | Yes (if binding beyond loopback) | **HIGH** | Gateway shared secret auth token |
| `OPENCLAW_GATEWAY_PASSWORD` | `.env.example`, `src/gateway/auth.ts` | — | No | **HIGH** | Alternative password auth |
| `OPENCLAW_STATE_DIR` | `.env.example`, `src/infra/env.ts` | `~/.openclaw` | No | Low | Runtime state directory |
| `OPENCLAW_CONFIG_PATH` | `.env.example` | `~/.openclaw/openclaw.json` | No | Low | Config file path |
| `OPENCLAW_HOME` | `.env.example` | `~` | No | Low | Home directory override |
| `OPENCLAW_LOAD_SHELL_ENV` | `.env.example` | — | No | Low | Import missing keys from shell profile |
| `OPENCLAW_SHELL_ENV_TIMEOUT_MS` | `.env.example` | `15000` | No | Low | Shell env import timeout |

## Model Provider API Keys

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `OPENAI_API_KEY` | `.env.example` | — | At least one provider | **HIGH** | OpenAI API key |
| `ANTHROPIC_API_KEY` | `.env.example` | — | No | **HIGH** | Anthropic API key |
| `GEMINI_API_KEY` | `.env.example` | — | No | **HIGH** | Google Gemini API key |
| `OPENROUTER_API_KEY` | `.env.example` | — | No | **HIGH** | OpenRouter API key |
| `OPENCLAW_LIVE_OPENAI_KEY` | `.env.example` | — | No | **HIGH** | Live OpenAI key (likely for tests) |
| `OPENCLAW_LIVE_ANTHROPIC_KEY` | `.env.example` | — | No | **HIGH** | Live Anthropic key |
| `OPENCLAW_LIVE_GEMINI_KEY` | `.env.example` | — | No | **HIGH** | Live Gemini key |
| `OPENAI_API_KEY_1` | `.env.example` | — | No | **HIGH** | Additional OpenAI key slot |
| `ANTHROPIC_API_KEY_1` | `.env.example` | — | No | **HIGH** | Additional Anthropic key slot |
| `GEMINI_API_KEY_1` | `.env.example` | — | No | **HIGH** | Additional Gemini key slot |
| `GOOGLE_API_KEY` | `.env.example` | — | No | **HIGH** | Google API key |
| `OPENAI_API_KEYS` | `.env.example` | — | No | **HIGH** | Comma-separated OpenAI keys |
| `ANTHROPIC_API_KEYS` | `.env.example` | — | No | **HIGH** | Comma-separated Anthropic keys |
| `GEMINI_API_KEYS` | `.env.example` | — | No | **HIGH** | Comma-separated Gemini keys |
| `ZAI_API_KEY` | `.env.example` | — | No | **HIGH** | Z.ai API key |
| `AI_GATEWAY_API_KEY` | `.env.example` | — | No | **HIGH** | AI Gateway API key |
| `TOKENHUB_API_KEY` | `.env.example` | — | No | **HIGH** | TokenHub API key |
| `LKEAP_API_KEY` | `.env.example` | — | No | **HIGH** | LKEAP API key |
| `MINIMAX_API_KEY` | `.env.example` | — | No | **HIGH** | MiniMax API key |
| `SYNTHETIC_API_KEY` | `.env.example` | — | No | **HIGH** | Synthetic provider key |

## Channel Tokens

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | `.env.example`, `extensions/telegram/` | — | If Telegram enabled | **HIGH** | Telegram Bot API token |
| `DISCORD_BOT_TOKEN` | `.env.example`, `extensions/discord/` | — | If Discord enabled | **HIGH** | Discord bot token |
| `SLACK_BOT_TOKEN` | `.env.example`, `extensions/slack/` | — | If Slack enabled | **HIGH** | Slack bot token (xoxb-) |
| `SLACK_APP_TOKEN` | `.env.example`, `extensions/slack/` | — | If Slack enabled | **HIGH** | Slack app token (xapp-) |
| `MATTERMOST_BOT_TOKEN` | `.env.example` | — | No | **HIGH** | Mattermost bot token |
| `MATTERMOST_URL` | `.env.example` | — | No | Low | Mattermost server URL |
| `ZALO_BOT_TOKEN` | `.env.example` | — | No | **HIGH** | Zalo bot token |
| `OPENCLAW_TWITCH_ACCESS_TOKEN` | `.env.example` | — | No | **HIGH** | Twitch OAuth token |

## Tools & Media

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `BRAVE_API_KEY` | `.env.example`, `extensions/brave/` | — | No | **HIGH** | Brave Search API key |
| `PERPLEXITY_API_KEY` | `.env.example`, `extensions/perplexity/` | — | No | **HIGH** | Perplexity API key |
| `FIRECRAWL_API_KEY` | `.env.example`, `extensions/firecrawl/` | — | No | **HIGH** | Firecrawl API key |
| `ELEVENLABS_API_KEY` | `.env.example`, `extensions/elevenlabs/` | — | No | **HIGH** | ElevenLabs TTS key |
| `XI_API_KEY` | `.env.example` | — | No | **HIGH** | ElevenLabs alias |
| `INWORLD_API_KEY` | `.env.example` | — | No | **HIGH** | Inworld API key |
| `DEEPGRAM_API_KEY` | `.env.example`, `extensions/deepgram/` | — | No | **HIGH** | Deepgram STT key |

## Gateway Runtime

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `OPENCLAW_GATEWAY_PORT` | `src/gateway/server.impl.ts`, `docker-compose.yml` | `18789` | No | Low | Gateway HTTP/WS port |
| `OPENCLAW_BRIDGE_PORT` | `docker-compose.yml` | `18790` | No | Low | Bridge port |
| `OPENCLAW_GATEWAY_BIND` | `docker-compose.yml` | `lan` | No | Low | Bind mode (loopback/lan/tailnet/auto) |
| `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS` | `docker-compose.yml` | — | No | Medium | Allow insecure private WS |
| `OPENCLAW_DISABLE_BONJOUR` | `docker-compose.yml` | — | No | Low | Disable Bonjour/mDNS |
| `OPENCLAW_RAW_STREAM` | `src/gateway/server.impl.ts` | — | No | Low | Raw stream logging |
| `OPENCLAW_RAW_STREAM_PATH` | `src/gateway/server.impl.ts` | — | No | Low | Raw stream log path |
| `OPENCLAW_GATEWAY_STARTUP_TRACE` | `src/gateway/server.impl.ts` | — | No | Low | Enable startup performance tracing |
| `OPENCLAW_SKIP_CHANNELS` | `package.json` scripts | — | No | Low | Skip channel startup |
| `OPENCLAW_TEST_MINIMAL_GATEWAY` | `src/gateway/server.impl.ts` | — | No | Low | Minimal gateway for tests |

## OpenTelemetry / Observability

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `docker-compose.yml` | — | No | Low | OTLP endpoint |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `docker-compose.yml` | — | No | Low | Traces endpoint |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | `docker-compose.yml` | — | No | Low | Metrics endpoint |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | `docker-compose.yml` | — | No | Low | Logs endpoint |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `docker-compose.yml` | `http/protobuf` | No | Low | OTLP protocol |
| `OTEL_SERVICE_NAME` | `docker-compose.yml` | — | No | Low | OTel service name |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `docker-compose.yml` | — | No | Low | Semantic convention opt-in |
| `OPENCLAW_OTEL_PRELOADED` | `docker-compose.yml` | — | No | Low | OTel preloaded flag |

## Claude / AI Session

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `CLAUDE_AI_SESSION_KEY` | `docker-compose.yml` | — | No | **HIGH** | Claude AI session key |
| `CLAUDE_WEB_SESSION_KEY` | `docker-compose.yml` | — | No | **HIGH** | Claude web session key |
| `CLAUDE_WEB_COOKIE` | `docker-compose.yml` | — | No | **HIGH** | Claude web cookie |

## Docker / Container

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `OPENCLAW_IMAGE` | `docker-compose.yml` | `openclaw:local` | No | Low | Docker image name |
| `OPENCLAW_CONFIG_DIR` | `docker-compose.yml` | — | Yes (Docker) | Medium | Config mount path |
| `OPENCLAW_WORKSPACE_DIR` | `docker-compose.yml` | — | No | Low | Workspace mount path |
| `OPENCLAW_TZ` | `docker-compose.yml` | `UTC` | No | Low | Timezone |
| `DOCKER_GID` | `docker-compose.yml` | `999` | No | Low | Docker group GID |

## Test / CI

| Variable | File(s) | Default | Required | Sensitivity | Purpose |
|----------|---------|---------|----------|-------------|---------|
| `OPENCLAW_LIVE_TEST` | `package.json` scripts | — | No | Low | Enable live tests |
| `OPENCLAW_LIVE_ANDROID_NODE` | `package.json` scripts | — | No | Low | Android node live test |
| `NODE_DISABLE_COMPILE_CACHE` | `src/entry.ts` | — | No | Low | Disable compile cache |
| `OPENCLAW_AUTH_STORE_READONLY` | `src/entry.ts` | — | No | Low | Read-only auth store |
| `NO_COLOR` | `src/entry.ts` | — | No | Low | Disable colors |
| `FORCE_COLOR` | `src/entry.ts` | — | No | Low | Force colors |

## Assumption: Additional Provider Keys

Many provider extensions likely define their own env vars. The above covers root `.env.example` and docker-compose. Extensions like `extensions/openai/src/`, `extensions/anthropic/src/`, etc. resolve keys via the secret provider system.

---

*Evidence: `.env.example`, `docker-compose.yml`, `src/entry.ts`, `src/gateway/server.impl.ts`, `src/infra/env.ts`.*
