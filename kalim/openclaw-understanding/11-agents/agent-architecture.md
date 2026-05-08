# Agent Architecture

## Overview

OpenClaw's agent system (`src/agents/`, 1,492 items) is the **AI runtime core**. It orchestrates LLM calls, tool execution, planning, and memory retrieval to produce intelligent responses across all channels.

## Architecture Diagram

```
Inbound Message / API Request
  |
  v
Agent Runtime (src/agents/runtime/)
  |
  +-- Session loading (history, context)
  +-- Memory retrieval (relevant past conversations)
  +-- Skill resolution (what can the agent do)
  +-- Tool definitions (what tools are available)
  |
  v
Planner (src/agents/planner/) [Optional]
  |
  +-- Decide approach: direct reply, tool use, multi-step
  +-- Generate execution plan
  |
  v
LLM Call
  |
  +-- Model selection (from model catalog)
  +-- Provider transport (OpenAI, Anthropic, Gemini, etc.)
  +-- Streaming response (tokens)
  |
  v
Response Parsing
  |
  +-- Plain text → direct reply
  +-- Tool calls → execute tools
  +-- Plan steps → execute plan
  |
  v
Tool Execution Loop (if needed)
  |
  +-- Validate arguments (Zod schema)
  +-- Execute tool handler
  +-- Capture output / error
  +-- Append result to conversation
  +-- Re-prompt LLM with results
  |
  v
Final Response
  |
  +-- Stream to user (token by token)
  +-- Save to session history
  +-- Index to memory (embeddings)
```

## Agent Runtime State

From `src/agents/runtime/` (inferred):

```typescript
type AgentRuntime = {
  // Session
  sessionKey: string;
  messages: Message[];
  systemPrompt?: string;

  // Configuration
  model: string;
  provider: string;
  temperature: number;
  maxTokens?: number;
  tools: Tool[];
  skills: string[];
  sandboxEnabled: boolean;

  // Execution
  status: AgentRunStatus;
  abortController: AbortController;
  maxIterations: number;
  currentIteration: number;

  // Streaming
  streamHandler?: StreamHandler;
  tokenBuffer: string;

  // Results
  toolResults: ToolResult[];
  plan?: ExecutionPlan;
};
```

## Model Catalog

From `src/model-catalog/`:

```typescript
type ModelEntry = {
  id: string;                   // e.g., "gpt-5.4", "claude-sonnet-4.6"
  name: string;                 // Human-readable name
  provider: string;             // openai, anthropic, google, ...
  contextWindow: number;
  maxOutputTokens: number;
  vision: boolean;              // Supports image input
  audio: boolean;               // Supports audio input
  functionCalling: boolean;       // Supports tool calls
  streaming: boolean;
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
  };
};
```

Models discovered dynamically from provider extensions.

## Provider Transport

From provider extensions (`extensions/openai/src/`, `extensions/anthropic/src/`, etc.):

```typescript
type ProviderTransport = {
  chatCompletion(params: ChatCompletionParams): AsyncIterable<TokenChunk>;
  embeddings?(params: EmbeddingParams): Promise<number[]>;
  transcription?(params: TranscriptionParams): Promise<string>;
};
```

Provider selection:
```
Config: agents.defaults.provider = "openai"
Model: agents.defaults.model = "gpt-5.4"
  |
  v
Lookup model in catalog → provider = "openai"
  |
  v
Load OpenAI provider extension
  |
  v
Call provider transport with API key from config/env
```

## Context Engine

From `src/context-engine/`:

```typescript
type ContextBuilder = {
  // Build conversation context for LLM
  buildContext({
    sessionMessages,
    systemPrompt,
    memoryResults,
    toolDefinitions,
    skills,
    maxTokens,
  }): Message[];
};
```

Context building strategies:
1. **Full history** — All messages (if within context window)
2. **Summarization** — Summarize old messages, keep recent full
3. **Window** — Sliding window of last N messages
4. **Memory injection** — Inject relevant memory chunks into system prompt

## Tool System

From `src/agents/tools/`:

```typescript
type Tool = {
  name: string;
  description: string;
  parameters: ZodSchema;          // JSON Schema for validation
  handler: ToolHandler;           // Async function
  requiresApproval?: boolean;     // Ask user before executing
  sandboxed?: boolean;            // Run in sandbox environment
};

type ToolHandler = (args: any, context: ToolContext) => Promise<ToolResult>;

type ToolContext = {
  sessionKey: string;
  channelId: string;
  chatId: string;
  senderId: string;
  runtime: RuntimeEnv;
  // ...
};
```

### Built-in Tools

| Tool | Purpose | Provider |
|------|---------|----------|
| `web_search` | Search the web | Brave, Perplexity, Tavily, SearXNG, DuckDuckGo |
| `file_read` | Read a file | Local filesystem |
| `file_write` | Write a file | Local filesystem |
| `memory_search` | Search vector memory | Memory extension |
| `memory_add` | Add to memory | Memory extension |
| `browser_navigate` | Navigate browser | Browser extension |
| `browser_screenshot` | Take screenshot | Browser extension |
| `browser_click` | Click element | Browser extension |
| `code_execute` | Run code | Code interpreter (sandboxed) |
| `image_generate` | Generate image | DALL-E, Stable Diffusion |
| `send_message` | Send cross-channel message | Outbound messaging |
| `tts_speak` | Text-to-speech | ElevenLabs, Azure |
| `stt_transcribe` | Speech-to-text | Deepgram, Whisper |

### Tool Execution Flow

```
LLM returns tool_calls
  |
  v
For each tool_call:
  |
  +-- Validate arguments against Zod schema
  +-- Check if requiresApproval
  +-- If approval needed:
  |     - Send approval request to user
  |     - Wait for approve/reject
  |     - If rejected: return error to LLM
  +-- If sandboxed: execute in sandbox
  +-- Execute handler
  +-- Capture output or error
  +-- Format as tool_result message
  |
  v
Append tool_results to messages
  |
  v
Re-prompt LLM with results
  |
  v
LLM generates final response
```

## Approval System

From `src/gateway/server-aux-handlers.ts`:

```typescript
// Pending execution queue
type PendingExecution = {
  id: string;
  toolName: string;
  args: any;
  sessionKey: string;
  requestTime: Date;
  status: "pending" | "approved" | "rejected";
};

// User receives:
"Tool 'code_execute' wants to run:
```bash
rm -rf /
```
Approve? [Yes] [No]"
```

Approvals sent via:
- Control UI (web interface)
- WebSocket to connected clients
- Channel reply (if interactive channel)

## Planner

From `src/agents/planner/`:

```typescript
type ExecutionPlan = {
  steps: Array<{
    id: string;
    description: string;
    tool?: string;
    dependencies: string[];       // Step IDs this depends on
    status: "pending" | "running" | "completed" | "failed";
    result?: any;
  }>;
  status: "planning" | "executing" | "completed" | "failed";
};
```

Planner modes:
1. **Direct** — No planning, single LLM call
2. **Simple** — LLM decides if tool needed, single tool call max
3. **Advanced** — Multi-step plan with dependencies

## Streaming

From agent runtime streaming:

```typescript
// SSE or WebSocket streaming
async function* streamTokens(providerResponse): AsyncGenerator<TokenChunk> {
  for await (const chunk of providerResponse) {
    yield {
      type: "token",
      content: chunk.content,
    };
  }

  yield {
    type: "done",
    usage: { promptTokens, completionTokens },
  };
}
```

Tokens streamed through:
1. Gateway WebSocket to connected clients
2. Channel-specific reply (if non-streaming channel)
3. Control UI real-time display

## Memory Integration

```
Before LLM call:
  |
  v
Query memory with user message
  |
  v
Get top-k relevant memory chunks
  |
  v
Inject into system prompt or prepend to messages:
  "Relevant context from past conversations:
  [memory chunk 1]
  [memory chunk 2]"
  |
  v
After LLM response:
  |
  v
Generate embedding of conversation
  |
  v
Store in vector memory for future retrieval
```

## Sandbox

From `src/agents/tools/` sandboxed execution:

```typescript
type SandboxConfig = {
  enabled: boolean;
  timeout: number;                // seconds
  memoryLimit: number;            // MB
  network: "none" | "limited" | "full";
  filesystem: "readonly" | "readwrite" | "none";
  allowedCommands?: string[];
};
```

Sandbox likely uses:
- Docker container (if available)
- Deno/Node.js sandbox (subprocess with restrictions)
- WASM sandbox (for code execution)

## Configuration

```json
{
  "agents": {
    "defaults": {
      "model": "gpt-5.4",
      "provider": "openai",
      "temperature": 0.7,
      "maxTokens": 4096,
      "sandbox": false,
      "tools": ["web_search", "file_read", "memory_search"],
      "skills": ["general", "coding"],
      "maxIterations": 10,
      "systemPrompt": "You are OpenClaw, a helpful AI assistant..."
    },
    "planner": {
      "model": "gpt-5.4",
      "provider": "openai",
      "mode": "simple"
    }
  }
}
```

## Key Files

- `src/agents/runtime/` — Agent runtime core
- `src/agents/planner/` — Planning subsystem
- `src/agents/tools/` — Tool definitions and handlers
- `src/agents/skills/` — Skill execution
- `src/model-catalog/` — Model discovery and catalog
- `src/context-engine/` — Context building
- `extensions/openai/src/` — OpenAI provider transport
- `extensions/anthropic/src/` — Anthropic provider transport
- `extensions/google/src/` — Google/Gemini provider transport

---

*Evidence: `src/agents/` directory structure, `src/model-catalog/`, `src/context-engine/`, `src/gateway/server-request-context.ts`, provider extension architecture.*
