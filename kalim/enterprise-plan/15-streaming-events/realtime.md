# Realtime Streaming

## Purpose
Document all realtime / WebSocket / SSE streaming mechanisms.

## Findings

### SSE (Server-Sent Events)

**Primary Streaming Mechanism**
- Used for: LLM streaming responses, chat completions
- Transport: HTTP SSE (`text/event-stream`)
- File: `src/agents/openai-transport-stream.ts`
- Format: OpenAI-compatible SSE chunks

```
LLM API call
  -> SSE response stream
    -> parse SSE chunks
      -> extract delta text
        -> forward to client via SSE
          -> Gateway HTTP response
```

### WebSocket Streaming

**OpenAI Realtime API**
- File: `src/agents/openai-ws-stream.ts`
- File: `src/agents/openai-ws-connection.ts`
- Bidirectional audio streaming for voice conversations
- Binary WebSocket messages (audio frames)
- Events: `session.update`, `input_audio_buffer.append`, `response.audio.delta`

**Gateway WebSocket**
- File: `src/gateway/server-ws-runtime.ts`
- General-purpose WebSocket for Control UI and clients
- JSON message protocol
- Methods: `subscribe`, `call`, `cancel`

**VoiceClaw Realtime**
- File: `src/gateway/voiceclaw-realtime/upgrade.ts`
- Dedicated WebSocket for real-time voice
- Integrates STT + LLM + TTS pipeline
- Bidirectional audio

### Streaming Protocols

| Protocol | Use Case | Direction | Files |
|----------|----------|-----------|-------|
| SSE | Text streaming (LLM responses) | Server->Client | `src/agents/*-transport-stream.ts` |
| WS JSON | Gateway control / UI | Bidirectional | `src/gateway/server-ws-runtime.ts` |
| WS Binary | Voice/audio realtime | Bidirectional | `src/agents/openai-ws-stream.ts` |
| WS Binary | VoiceClaw | Bidirectional | `src/gateway/voiceclaw-realtime/` |

### Streaming Response Parsing

- `src/agents/openai-transport-stream.ts` — OpenAI SSE parsing
- `src/agents/anthropic-transport-stream.ts` — Anthropic SSE parsing
- `src/agents/anthropic-vertex-stream.ts` — Google/Gemini SSE parsing
- Chunk aggregation and delta extraction
- Tool use detection during stream

### Client Consumption

1. **Browser (Control UI)**
   - WebSocket connection to gateway
   - SSE fallback for streaming endpoints
   - Real-time message rendering

2. **Native Apps**
   - WebSocket for real-time updates
   - SSE for LLM streaming

3. **CLI**
   - SSE consumed as chunked HTTP
   - Terminal rendering of streaming text

### Backpressure

- No explicit backpressure mechanism
- Node.js stream backpressure applies at TCP level
- Large streams may buffer in memory
- Cancellation supported via abort signals

## Evidence
- `src/agents/openai-transport-stream.ts` — OpenAI SSE
- `src/agents/anthropic-transport-stream.ts` — Anthropic SSE
- `src/agents/openai-ws-stream.ts` — OpenAI WS
- `src/gateway/server-ws-runtime.ts` — Gateway WS
- `src/gateway/voiceclaw-realtime/upgrade.ts` — VoiceClaw

## Notes
- SSE is the dominant streaming pattern for text
- WebSocket used for binary audio and control messages
- No gRPC or MQTT detected
- Streaming is synchronous per-request — no persistent publish/subscribe
