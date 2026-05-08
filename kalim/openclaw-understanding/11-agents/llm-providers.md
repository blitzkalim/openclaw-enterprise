# LLM Providers

## Supported Providers

OpenClaw supports 20+ LLM providers through extension plugins. Each provider implements a standard transport interface.

| Provider | Extension | API Type | Key Config | Streaming | Vision | Tools | Notes |
|----------|-----------|----------|------------|-----------|--------|-------|-------|
| OpenAI | `extensions/openai/` | REST | `OPENAI_API_KEY` | Yes | Yes | Yes | GPT-4o, o1, o3, GPT-5 |
| Anthropic | `extensions/anthropic/` | REST | `ANTHROPIC_API_KEY` | Yes | Yes | Yes | Claude Sonnet, Opus, Haiku |
| Google / Gemini | `extensions/google/` | REST | `GEMINI_API_KEY` | Yes | Yes | Yes | Gemini 2.5 Pro, Flash |
| DeepSeek | `extensions/deepseek/` | REST | `DEEPSEEK_API_KEY` | Yes | No | Yes | DeepSeek V3, R1 |
| Mistral | `extensions/mistral/` | REST | `MISTRAL_API_KEY` | Yes | No | Yes | Mistral Large, Medium |
| xAI / Grok | `extensions/xai/` | REST | `XAI_API_KEY` | Yes | No | Yes | Grok 2, Grok 3 |
| Qwen | `extensions/qwen/` | REST | `QWEN_API_KEY` | Yes | Yes | Yes | Qwen 2.5, QwQ |
| Moonshot | `extensions/moonshot/` | REST | `MOONSHOT_API_KEY` | Yes | No | Yes | Kimi K1.5 |
| Z.ai | `extensions/zai/` | REST | `ZAI_API_KEY` | Yes | No | Yes | Z.ai models |
| BytePlus | `extensions/byteplus/` | REST | `BYTEPLUS_API_KEY` | Yes | No | Yes | BytePlus models |
| MiniMax | `extensions/minimax/` | REST | `MINIMAX_API_KEY` | Yes | No | Yes | MiniMax models |
| Together AI | `extensions/together/` | REST | `TOGETHER_API_KEY` | Yes | No | Yes | Together platform |
| Fireworks | `extensions/fireworks/` | REST | `FIREWORKS_API_KEY` | Yes | No | Yes | Fireworks AI |
| Groq | `extensions/groq/` | REST | `GROQ_API_KEY` | Yes | No | Yes | Ultra-fast inference |
| OpenRouter | `extensions/openrouter/` | REST | `OPENROUTER_API_KEY` | Yes | Yes | Yes | Multi-provider router |
| AI Gateway | `extensions/ai-gateway/` | REST | `AI_GATEWAY_API_KEY` | Yes | No | Yes | Aggregator |
| TokenHub | `extensions/tokenhub/` | REST | `TOKENHUB_API_KEY` | Yes | No | Yes | Aggregator |
| LKEAP | `extensions/lkeap/` | REST | `LKEAP_API_KEY` | Yes | No | Yes | LKEAP platform |
| Ollama | `extensions/ollama/` | Local HTTP | None (local) | Yes | Yes | Yes | Local models |
| LM Studio | `extensions/lmstudio/` | Local HTTP | None (local) | Yes | Yes | Yes | Local models |
| Synthetic | `extensions/synthetic/` | Mock | `SYNTHETIC_API_KEY` | Yes | No | No | Testing/development |

## Provider Transport Interface

Each provider extension implements:

```typescript
// Standard provider transport (inferred from architecture)
interface ProviderTransport {
  // Chat completion (streaming)
  chatCompletion(params: ChatCompletionParams): AsyncIterable<ChatChunk>;

  // Embeddings
  embeddings?(params: EmbeddingParams): Promise<number[]>;

  // Transcription (STT)
  transcription?(params: TranscriptionParams): Promise<string>;

  // Image generation
  imageGeneration?(params: ImageGenParams): Promise<string>;
}

interface ChatCompletionParams {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | { type: "function", function: { name: string } };
  stream?: boolean;
  abortSignal?: AbortSignal;
}

interface ChatChunk {
  type: "token" | "tool_call" | "usage" | "done";
  content?: string;
  toolCall?: ToolCall;
  usage?: { promptTokens: number; completionTokens: number };
}
```

## Model Catalog Integration

From `src/model-catalog/`:

```typescript
// Models registered by provider extensions
const modelCatalog = [
  { id: "gpt-5.4", name: "GPT-5.4", provider: "openai", contextWindow: 128000, vision: true, tools: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", contextWindow: 200000, vision: true, tools: true },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", contextWindow: 1000000, vision: true, tools: true },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "deepseek", contextWindow: 64000, vision: false, tools: true },
  // ... many more
];
```

Model selection:
```
User request or config default
  |
  v
resolveModel(modelId) → { provider, capabilities }
  |
  v
Load provider extension
  |
  v
Call provider.chatCompletion()
```

## API Key Resolution

From `src/secrets/resolution.ts`:

```typescript
// Provider API keys resolved from:
// 1. Config: providers.openai.apiKey = "{env:OPENAI_API_KEY}"
// 2. Env var: OPENAI_API_KEY=...
// 3. Secret provider: "{provider:1password,key:openai}"

function resolveProviderApiKey(providerId: string): string {
  const config = getConfig();
  const spec = config.providers?.[providerId]?.apiKey;
  if (!spec) throw new Error(`No API key configured for ${providerId}`);
  return resolveSecret(spec);
}
```

## OpenAI-Compatible Endpoint

Gateway exposes `/v1/chat/completions` as OpenAI-compatible:

```typescript
// Internally routes to configured/default provider
// Supports all standard OpenAI parameters
// Returns SSE stream or JSON

POST /v1/chat/completions
Authorization: Bearer <gateway_token>

Body: {
  "model": "gpt-5.4",
  "messages": [...],
  "stream": true,
  "tools": [...]
}
```

This allows existing OpenAI SDK clients to use OpenClaw gateway.

## Provider Fallback

```typescript
// If primary provider fails:
// 1. Retry with same provider (exponential backoff)
// 2. If max retries: try fallback provider (if configured)
// 3. If no fallback: return error to user

const fallbackChain = config.agents.fallbacks ?? [config.agents.defaults.provider];
```

## Local Provider Support

### Ollama

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "llama3.1"
    }
  }
}
```

### LM Studio

```json
{
  "providers": {
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1",
      "defaultModel": "local-model"
    }
  }
}
```

Local providers require no API key — they use local HTTP endpoints.

## Multi-Key Support

From `.env.example`:

```
# Multiple keys for load balancing / failover
OPENAI_API_KEY=...
OPENAI_API_KEY_1=...
ANTHROPIC_API_KEY=...
ANTHROPIC_API_KEY_1=...
GEMINI_API_KEY=...
GEMINI_API_KEY_1=...
```

Multiple keys may be used for:
- Load balancing across keys
- Failover when rate limited
- Regional routing

## Provider Rate Limiting

Each provider may return rate limit errors (429). OpenClaw handling:
1. Read `Retry-After` header
2. Exponential backoff
3. Switch to fallback key/provider
4. Surface rate limit to user (optional)

## Streaming Implementation

```typescript
// Provider streaming (inferred)
async function* streamChatCompletion(provider, params) {
  const response = await fetch(provider.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...params, stream: true }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }
        const parsed = JSON.parse(data);
        yield {
          type: "token",
          content: parsed.choices[0]?.delta?.content,
        };
      }
    }
  }
}
```

## Key Files

- `extensions/openai/src/` — OpenAI provider
- `extensions/anthropic/src/` — Anthropic provider
- `extensions/google/src/` — Google/Gemini provider
- `extensions/deepseek/src/` — DeepSeek provider
- `extensions/ollama/src/` — Ollama local provider
- `extensions/lmstudio/src/` — LM Studio local provider
- `src/model-catalog/` — Model catalog
- `src/secrets/resolution.ts` — API key resolution

---

*Evidence: `.env.example`, `extensions/` directory listing, `src/model-catalog/`, `src/secrets/resolution.ts`, `README.md` supported providers, `src/gateway/server-request-context.ts` OpenAI-compatible endpoint.*
