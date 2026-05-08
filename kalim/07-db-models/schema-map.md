# Schema Map

## No Formal SQL Schema

OpenClaw uses **file-based JSON storage** rather than a relational database, so there is no formal SQL schema. This document maps the data structures as they appear in code.

## Core Data Types

### 1. Configuration (`openclaw.json`)

```typescript
// From src/config/config.ts (inferred)
type OpenClawConfig = {
  gateway?: {
    auth?: {
      mode?: "token" | "password" | "trusted-proxy" | "none";
      token?: string;           // 256-bit hex
      password?: string;          // bcrypt hash or plaintext
      rateLimit?: {
        windowMs?: number;
        maxRequests?: number;
      };
      trustedProxy?: {
        userHeader: string;
        requiredHeaders?: string[];
        allowUsers?: string[];
      };
      allowTailscale?: boolean;
    };
    bind?: "loopback" | "lan" | "tailnet" | "auto";
    port?: number;
    tls?: {
      enabled: boolean;
      cert?: string;            // path or PEM
      key?: string;             // path or PEM
    };
    controlUi?: {
      enabled: boolean;
      allowedOrigins?: string[];
    };
    http?: {
      endpoints?: {
        chatCompletions?: { enabled: boolean };
        responses?: { enabled: boolean };
      };
    };
  };

  agents?: {
    defaults?: {
      model?: string;
      provider?: string;
      temperature?: number;
      maxTokens?: number;
      sandbox?: boolean;
      tools?: string[];
      skills?: string[];
      systemPrompt?: string;
    };
    planner?: {
      model?: string;
      provider?: string;
    };
  };

  channels?: Record<string, {
    enabled: boolean;
    // channel-specific config (varies by extension)
    botToken?: string;
    webhookUrl?: string;
    sessionBinding?: "channel" | "thread" | "user";
  }>;

  providers?: Record<string, {
    apiKey?: string;            // or {env:...} or {file:...}
    baseUrl?: string;
    timeout?: number;
    // provider-specific config
  }>;

  memory?: {
    enabled: boolean;
    engine?: "sqlite-vec" | "lancedb";
    embeddingModel?: string;
    embeddingProvider?: string;
    dimensions?: number;
    similarityThreshold?: number;
  };

  skills?: {
    enabled?: string[];
    autoDiscover?: boolean;
    directories?: string[];
  };

  cron?: {
    enabled?: boolean;
    jobs?: Array<{
      name: string;
      schedule: string;
      command: string;
    }>;
  };

  env?: Record<string, string>;  // embedded env vars
};
```

### 2. Session (`sessions/{key}.json`)

```typescript
// From src/sessions/session-store.ts (inferred)
type Session = {
  key: string;                  // composite: "{channel}:{sender}:{thread?}"
  channelId: string;            // telegram, whatsapp, slack, ...
  senderId: string;             // user ID in channel namespace
  threadId?: string;            // for threaded channels
  platform: string;             // channel platform name
  displayName?: string;          // cached sender display name
  messages: Array<{
    id: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string | Array<ContentPart>;
    timestamp: string;          // ISO 8601
    metadata?: Record<string, any>;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
  }>;
  metadata: {
    createdAt: string;
    lastUpdated: string;
    messageCount: number;
    // extension-specific metadata
  };
  pendingToolCalls?: Array<{
    id: string;
    tool: string;
    args: any;
    status: "pending" | "approved" | "rejected" | "executing";
  }>;
  agentState?: {
    currentSkill?: string;
    contextVariables?: Record<string, any>;
  };
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "audio"; audio_url: string }
  | { type: "file"; file_url: string };

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;          // JSON string
  };
};

type ToolResult = {
  toolCallId: string;
  output: string;
  error?: boolean;
};
```

### 3. Message Envelope (Internal)

```typescript
// From src/channels/message-normalization.ts (inferred)
type NormalizedMessage = {
  id: string;                   // unique message ID
  channelId: string;
  senderId: string;
  senderName?: string;
  threadId?: string;
  replyTo?: string;             // message ID being replied to
  timestamp: Date;
  content: {
    text?: string;
    media?: Array<{
      type: "image" | "audio" | "video" | "file";
      url?: string;             // local path or remote URL
      mimeType?: string;
      size?: number;
      caption?: string;
    }>;
    location?: { lat: number; lon: number };
    contact?: { name: string; phone?: string };
  };
  commands?: Array<{
    name: string;
    args: string[];
    botCommand: boolean;
  }>;
  isForwarded?: boolean;
  isEdited?: boolean;
  raw: any;                     // original channel-specific payload
};
```

### 4. Agent Runtime State

```typescript
// From src/agents/runtime/ (inferred)
type AgentRunState = {
  runId: string;
  sessionKey: string;
  status: "idle" | "planning" | "executing" | "streaming" | "paused" | "completed" | "error";
  model: string;
  provider: string;
  messages: Message[];
  plan?: {
    steps: Array<{
      id: string;
      description: string;
      tool?: string;
      status: "pending" | "running" | "completed" | "failed";
    }>;
  };
  tools: Tool[];
  skills: string[];
  sandboxEnabled: boolean;
  maxIterations: number;
  currentIteration: number;
  startTime: string;
  endTime?: string;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
};
```

### 5. Plugin Registry Entry

```typescript
// From src/plugins/runtime/types.ts (inferred)
type PluginRegistryEntry = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  manifest: {
    channels?: string[];
    providers?: string[];
    tools?: string[];
    skills?: string[];
    gatewayHandlers?: Record<string, string>;
    httpRoutes?: Array<{
      path: string;
      method: string;
      handler: string;
    }>;
    hooks?: string[];
  };
  runtime?: {
    channel?: ChannelRuntimeFactory;
    provider?: ProviderRuntimeFactory;
    tools?: ToolFactory[];
    gatewayHandlers?: Record<string, GatewayMethodHandler>;
  };
  configSchema?: ZodSchema;
  errors?: string[];
};
```

### 6. Memory Vector Record

```typescript
// From extensions/memory-core/ (inferred — SQLite-vec)
type MemoryVector = {
  id: string;                   // UUID
  content: string;               // text content
  embedding: Buffer;             // float32[] serialized
  metadata: {
    source?: string;             // session key, file path, etc.
    type?: "message" | "file" | "knowledge" | "webpage";
    timestamp: string;
    channelId?: string;
    sessionKey?: string;
    tags?: string[];
  };
  timestamp: string;            // ISO 8601
  similarity?: number;           // populated at query time
};

// SQLite-vec table schema (inferred):
// CREATE TABLE memories (
//   id TEXT PRIMARY KEY,
//   content TEXT NOT NULL,
//   embedding BLOB NOT NULL,   -- vec_float32() type
//   metadata TEXT,              -- JSON
//   timestamp TEXT
// );
// CREATE VIRTUAL TABLE memory_search USING vec0(embedding float32[{dimensions}]);
```

### 7. Cron Job

```typescript
// From src/cron/ (inferred)
type CronJob = {
  id: string;
  name: string;
  schedule: string;               // cron expression or natural language
  command: string;                // shell command or gateway method
  enabled: boolean;
  lastRun?: string;
  lastResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  nextRun?: string;
  runCount: number;
  failCount: number;
};
```

### 8. Diagnostics Event

```typescript
// From src/infra/diagnostic-events.ts (inferred)
type DiagnosticEvent = {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "fatal";
  category: "startup" | "channel" | "agent" | "tool" | "config" | "system";
  message: string;
  details?: Record<string, any>;
  stackTrace?: string;
  sessionKey?: string;
  runId?: string;
  channelId?: string;
  pluginId?: string;
};
```

### 9. Gateway Client (WebSocket)

```typescript
// From src/gateway/server-runtime-state.ts (inferred)
type GatewayClient = {
  id: string;                    // UUID
  ws: WebSocket;
  auth: GatewayAuthResult;
  ip: string;
  origin?: string;
  userAgent?: string;
  connectedAt: Date;
  subscribedSessions: Set<string>;
  lastActivity: Date;
  isBrowserOrigin: boolean;
};
```

## Data Relationships

```
[Config]
  |
  +-- gateway.auth → Auth settings
  +-- channels.{id} → Channel configs
  +-- providers.{id} → Provider API keys
  +-- agents.defaults → Default agent settings
  +-- memory → Memory engine config

[Session] (many)
  |
  +-- channelId → [Config].channels
  +-- senderId → Channel-specific user
  +-- messages (many) → Conversation history
  +-- pendingToolCalls → Tool execution queue
  +-- agentState → Runtime state

[AgentRun] (many per session)
  |
  +-- sessionKey → [Session]
  +-- model → [Config].agents.defaults.model
  +-- provider → [Config].providers
  +-- tools → [PluginRegistry]
  +-- skills → [Config].skills

[MemoryVector] (many)
  |
  +-- sessionKey → [Session] (optional)
  +-- channelId → [Config].channels (optional)
  +-- embedding → float32[] (dimensions from config)

[PluginRegistryEntry] (many)
  |
  +-- manifest.channels → [Config].channels (activation)
  +-- manifest.providers → [Config].providers (activation)
  +-- manifest.tools → Agent runtime tool list
  +-- manifest.skills → [Config].skills

[CronJob] (many)
  |
  +-- command → Gateway method or shell
```

## No Foreign Keys, No ACID Transactions

Since storage is file-based JSON:
- **No foreign key constraints**
- **No ACID transactions** across multiple files
- **No schema migrations**
- Data integrity maintained by:
  - Single-process access (no concurrent writes)
  - Atomic file writes (rename after write)
  - Zod schema validation on read
  - Graceful degradation on missing references

## Key Files

- `src/config/config.ts` — Config types
- `src/config/schema.ts` — Zod validation schema
- `src/sessions/session-store.ts` — Session types
- `src/channels/message-normalization.ts` — Message types
- `src/agents/runtime/` — Agent runtime types
- `src/plugins/runtime/types.ts` — Plugin types
- `extensions/memory-core/` — Vector memory schema
- `extensions/memory-lancedb/` — LanceDB schema

---

*Evidence: `src/config/config.ts`, `src/config/schema.ts`, `src/sessions/session-store.ts`, `src/channels/message-normalization.ts`, `src/agents/runtime/`, `src/plugins/runtime/types.ts`, `extensions/memory-core/`, `extensions/memory-lancedb/`.*
