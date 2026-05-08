# Environment Variables Inventory

## Purpose
Catalog every environment variable found in the codebase with file paths, requirements, and sensitivity.

## Findings

### Gateway Auth

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `OPENCLAW_GATEWAY_TOKEN` | `.env.example`, `docker-compose.yml`, `src/gateway/credentials.ts` | Conditional | auto-generated | **Yes** | Primary gateway auth token |
| `OPENCLAW_GATEWAY_PASSWORD` | `.env.example`, `src/gateway/credentials.ts` | Conditional | — | **Yes** | Alternative password auth |
| `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS` | `docker-compose.yml` | No | — | No | Allow insecure private WebSocket |
| `OPENCLAW_DISABLE_BONJOUR` | `docker-compose.yml` | No | auto | No | Disable Bonjour/mDNS discovery |

### Model Provider API Keys

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `OPENAI_API_KEY` | `.env.example`, `src/agents/auth-profiles/` | Conditional | — | **Yes** | OpenAI API key |
| `ANTHROPIC_API_KEY` | `.env.example` | Conditional | — | **Yes** | Anthropic API key |
| `GEMINI_API_KEY` | `.env.example` | Conditional | — | **Yes** | Google Gemini API key |
| `OPENROUTER_API_KEY` | `.env.example` | Conditional | — | **Yes** | OpenRouter API key |
| `OPENCLAW_LIVE_OPENAI_KEY` | `.env.example` | Conditional | — | **Yes** | Live OpenAI key |
| `OPENCLAW_LIVE_ANTHROPIC_KEY` | `.env.example` | Conditional | — | **Yes** | Live Anthropic key |
| `OPENCLAW_LIVE_GEMINI_KEY` | `.env.example` | Conditional | — | **Yes** | Live Gemini key |
| `ZAI_API_KEY` | `.env.example` | No | — | **Yes** | ZAI provider key |
| `AI_GATEWAY_API_KEY` | `.env.example` | No | — | **Yes** | AI Gateway key |
| `TOKENHUB_API_KEY` | `.env.example` | No | — | **Yes** | TokenHub key |
| `LKEAP_API_KEY` | `.env.example` | No | — | **Yes** | LKEAP key |
| `MINIMAX_API_KEY` | `.env.example` | No | — | **Yes** | MiniMax key |
| `SYNTHETIC_API_KEY` | `.env.example` | No | — | **Yes** | Synthetic provider key |

### Channel Tokens

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `TELEGRAM_BOT_TOKEN` | `.env.example` | Conditional | — | **Yes** | Telegram Bot API token |
| `DISCORD_BOT_TOKEN` | `.env.example` | Conditional | — | **Yes** | Discord bot token |
| `SLACK_BOT_TOKEN` | `.env.example` | Conditional | — | **Yes** | Slack bot token (xoxb-) |
| `SLACK_APP_TOKEN` | `.env.example` | Conditional | — | **Yes** | Slack app token (xapp-) |
| `MATTERMOST_BOT_TOKEN` | `.env.example` | No | — | **Yes** | Mattermost bot token |
| `MATTERMOST_URL` | `.env.example` | No | — | No | Mattermost server URL |
| `ZALO_BOT_TOKEN` | `.env.example` | No | — | **Yes** | Zalo bot token |
| `OPENCLAW_TWITCH_ACCESS_TOKEN` | `.env.example` | No | — | **Yes** | Twitch OAuth token |

### Tool & Media Keys

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `BRAVE_API_KEY` | `.env.example` | No | — | **Yes** | Brave Search API |
| `PERPLEXITY_API_KEY` | `.env.example` | No | — | **Yes** | Perplexity API |
| `FIRECRAWL_API_KEY` | `.env.example` | No | — | **Yes** | Firecrawl API |
| `ELEVENLABS_API_KEY` | `.env.example` | No | — | **Yes** | ElevenLabs TTS |
| `XI_API_KEY` | `.env.example` | No | — | **Yes** | ElevenLabs alias |
| `INWORLD_API_KEY` | `.env.example` | No | — | **Yes** | Inworld AI |
| `DEEPGRAM_API_KEY` | `.env.example` | No | — | **Yes** | Deepgram STT |

### Path & Runtime

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `OPENCLAW_STATE_DIR` | `.env.example` | No | `~/.openclaw` | No | State directory |
| `OPENCLAW_CONFIG_PATH` | `.env.example` | No | `~/.openclaw/openclaw.json` | No | Config file path |
| `OPENCLAW_HOME` | `.env.example` | No | `~` | No | Home directory override |
| `OPENCLAW_LOAD_SHELL_ENV` | `.env.example` | No | — | No | Import shell env |
| `OPENCLAW_SHELL_ENV_TIMEOUT_MS` | `.env.example` | No | 15000 | No | Shell env timeout |
| `OPENCLAW_GATEWAY_PORT` | `docker-compose.yml` | No | 18789 | No | Gateway port |
| `OPENCLAW_BRIDGE_PORT` | `docker-compose.yml` | No | 18790 | No | Bridge port |
| `OPENCLAW_GATEWAY_BIND` | `docker-compose.yml` | No | `lan` | No | Bind interface |
| `OPENCLAW_IMAGE` | `docker-compose.yml` | No | `openclaw:local` | No | Docker image |
| `OPENCLAW_CONFIG_DIR` | `docker-compose.yml` | Yes | — | No | Config mount path |
| `OPENCLAW_WORKSPACE_DIR` | `docker-compose.yml` | Yes | — | No | Workspace mount path |
| `OPENCLAW_TZ` | `docker-compose.yml` | No | UTC | No | Timezone |

### OpenTelemetry

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `docker-compose.yml` | No | — | No | OTLP endpoint |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `docker-compose.yml` | No | — | No | Traces endpoint |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | `docker-compose.yml` | No | — | No | Metrics endpoint |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | `docker-compose.yml` | No | — | No | Logs endpoint |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `docker-compose.yml` | No | `http/protobuf` | No | OTLP protocol |
| `OTEL_SERVICE_NAME` | `docker-compose.yml` | No | — | No | Service name |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `docker-compose.yml` | No | — | No | Semantic convention opt-in |
| `OPENCLAW_OTEL_PRELOADED` | `docker-compose.yml` | No | — | No | Preload OTEL |

### Claude/Web Session Keys

| Variable | File Path | Required | Default | Sensitive | Purpose |
|----------|-----------|----------|---------|-----------|---------|
| `CLAUDE_AI_SESSION_KEY` | `docker-compose.yml` | No | — | **Yes** | Claude AI session |
| `CLAUDE_WEB_SESSION_KEY` | `docker-compose.yml` | No | — | **Yes** | Claude web session |
| `CLAUDE_WEB_COOKIE` | `docker-compose.yml` | No | — | **Yes** | Claude web cookie |

## Evidence
- `.env.example` — canonical env variable listing
- `docker-compose.yml` — runtime env mapping
- `src/gateway/credentials.ts` — credential resolution
- `src/infra/env.ts` — env utility functions
- `src/config/env-vars.ts` — config-level env injection

## Notes
- At least one model provider API key is required for agent functionality
- `OPENCLAW_GATEWAY_TOKEN` auto-generates on first start if absent
- Channel tokens are only required for enabled channels
- Secrets are resolved with precedence: process env > `.env` > `~/.openclaw/.env` > config `env.vars`
