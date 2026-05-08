# LLM Providers

## Purpose
Catalog all supported LLM providers with auth models and streaming support.

## Findings

### Supported Providers

| Provider | Extension | Auth | Streaming | Models |
|----------|-----------|------|-----------|--------|
| OpenAI | `extensions/openai/` | API Key | SSE | GPT-4o, o3, o1, GPT-4, GPT-3.5 |
| Anthropic | `extensions/anthropic/` | API Key | SSE | Claude 4, 3.7, 3.5, 3 |
| Google (Gemini) | `extensions/google/` | API Key | SSE | Gemini 2.5, 2.0, 1.5 |
| DeepSeek | `extensions/deepseek/` | API Key | SSE | DeepSeek-V3, R1 |
| Mistral | `extensions/mistral/` | API Key | SSE | Mistral Large, Medium |
| OpenRouter | `extensions/openrouter/` | API Key | SSE | Aggregated models |
| Ollama | `extensions/ollama/` | None (local) | SSE | Local models |
| LM Studio | `extensions/lmstudio/` | None (local) | SSE | Local models |
| Azure OpenAI | `extensions/azure-openai/` | API Key + Endpoint | SSE | Azure-hosted models |
| Together | `extensions/together/` | API Key | SSE | Various |
| Fireworks | `extensions/fireworks/` | API Key | SSE | Various |
| Groq | `extensions/groq/` | API Key | SSE | Fast inference |
| Cohere | `extensions/cohere/` | API Key | SSE | Command models |
| ZAI | `extensions/zai/` | API Key | SSE | ZAI models |
| AI Gateway | `extensions/ai-gateway/` | API Key | SSE | Gateway models |
| TokenHub | `extensions/tokenhub/` | API Key | SSE | TokenHub models |
| LKEAP | `extensions/lkeap/` | API Key | SSE | LKEAP models |
| MiniMax | `extensions/minimax/` | API Key | SSE | MiniMax models |
| Synthetic | `extensions/synthetic/` | API Key | SSE | Synthetic models |

### Auth Model

- API keys stored in env vars or config `env.vars`
- `src/agents/auth-profiles/` — profile-based key management
- Multiple keys per provider with rotation
- `src/agents/provider-auth-aliases.ts` — provider ID resolution

### Streaming Implementation

| Provider | Transport | File |
|----------|-----------|------|
| OpenAI | SSE | `src/agents/openai-transport-stream.ts` |
| Anthropic | SSE | `src/agents/anthropic-transport-stream.ts` |
| Google | SSE | `src/agents/anthropic-vertex-stream.ts` |
| Ollama | SSE | `extensions/ollama/src/stream.ts` |
| All others | SSE | Provider-specific extensions |

### WebSocket Streaming

- `src/agents/openai-ws-stream.ts` — OpenAI WebSocket streaming
- `src/agents/openai-ws-connection.ts` — WS connection management
- Used for realtime API (voice, etc.)

### Model Catalog

- `src/gateway/server-model-catalog.ts` — loads available models
- Models declared in provider extension manifests
- Dynamic model list fetched from provider APIs when possible
- `src/agents/model-selection.ts` — model key resolution

### Fallback Chain

1. Explicit model requested (e.g., `openai/gpt-4o`)
2. Agent-specific default
3. Channel-specific default
4. Global default (`agents.defaults.model`)
5. Hardcoded default (`gpt-4o`)

### Provider Priority

- `src/agents/model-fallback.ts` — rotates on failure
- Auth profile with most remaining quota prioritized
- Rate-limited providers temporarily deprioritized
- Unavailable providers skipped automatically

## Evidence
- `extensions/*/package.json` — provider metadata
- `src/agents/model-selection.ts` — model resolution
- `src/agents/model-fallback.ts` — fallback logic
- `src/agents/auth-profiles/` — auth management
- `src/gateway/server-model-catalog.ts` — catalog loading

## Notes
- All providers use SSE for streaming (except WS realtime)
- Local providers (Ollama, LM Studio) require no API key
- Model availability checked at runtime (not hardcoded)
- Custom model aliases supported via config
