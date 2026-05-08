# Streaming Events

## SSE / WebSocket Streaming

OpenClaw supports **real-time streaming** of agent responses via Server-Sent Events (SSE) and WebSocket.

## Streaming Endpoints

| Endpoint | Protocol | Auth |
|----------|----------|------|
| `GET /v1/chat/completions` | SSE | Gateway token |
| `WS /gateway` | WebSocket | Gateway token / cookie |
| `WS /` | WebSocket (root) | Gateway token |

## SSE Chat Completions

```
GET /v1/chat/completions?stream=true
Authorization: Bearer <token>

Response: text/event-stream

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}

data: [DONE]
```

OpenAI-compatible format for tool/library compatibility.

## WebSocket Streaming

```
Client connects WS /gateway
  |
  v
Send auth message: { method: "authenticate", params: { token } }
  |
  v
Subscribe to session: { method: "subscribe", params: { sessionKey } }
  |
  v
Agent run starts
  |
  v
Server pushes tokens:
  { type: "token", content: "The", sessionKey }
  { type: "token", content: " weather", sessionKey }
  ...
  { type: "done", usage: { promptTokens: 10, completionTokens: 20 }, sessionKey }
```

## Event Types

| Event | Source | Payload |
|-------|--------|---------|
| `token` | Agent runtime | `{ content: string, sessionKey }` |
| `tool_call` | Agent runtime | `{ toolCall: {...}, sessionKey }` |
| `tool_result` | Tool handler | `{ result: any, sessionKey }` |
| `done` | Agent runtime | `{ usage, sessionKey }` |
| `error` | Any | `{ error: string, sessionKey }` |
| `abort` | User | `{ sessionKey }` |
| `config_change` | Config loader | `{ key, value }` |
| `channel_status` | Channel manager | `{ channelId, status }` |
| `diagnostic` | Diagnostics | `{ level, message, context }` |
| `typing` | Channel | `{ channelId, chatId, state }` |
| `approval_request` | Tool system | `{ executionId, toolName, args }` |
| `approval_result` | User | `{ executionId, approved }` |

## Token Batching

To reduce WS overhead, tokens may be batched:

```typescript
// Send tokens in small buffers (e.g., every 50ms or 10 chars)
let buffer = "";
const flushInterval = setInterval(() => {
  if (buffer) {
    ws.send(JSON.stringify({ type: "token", content: buffer }));
    buffer = "";
  }
}, 50);
```

## Stream Routing

```
Agent runtime generates token
  |
  v
Stream handler
  |
  +-- SSE client: write event-stream chunk
  +-- WS client: send JSON message
  +-- Channel: update typing indicator
  |
  v
Flush to network
```

## Backpressure

If client is slow:
- WS: messages queue in memory (risk of memory growth)
- SSE: TCP backpressure applies
- No explicit backpressure handler observed

## Connection Recovery

```
Client disconnects
  |
  v
Server detects (WS close event)
  |
  v
Cancel stream for that client only
  |
  v
Other clients continue receiving
  |
  v
Client reconnects
  |
  v
Re-authenticate + re-subscribe
  |
  v
Resume from current state (not from beginning)
```

## Key Files

- `src/gateway/server-ws-runtime.ts` — WS stream handling
- `src/gateway/server-request-context.ts` — SSE response
- `src/agents/runtime/` — Token generation
- `src/channels/outbound-messaging.ts` — Typing indicators

---

*Evidence: `src/gateway/server-ws-runtime.ts`, `src/gateway/server-request-context.ts`, WebSocket and SSE patterns in gateway.*
