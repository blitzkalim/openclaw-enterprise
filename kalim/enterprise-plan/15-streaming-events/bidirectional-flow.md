# Bidirectional Streaming Flow

## Purpose
Trace client->server and server->client event flows.

## Findings

### WebSocket Message Protocol (Gateway)

```typescript
interface GatewayWsMessage {
  id: string;           // request correlation ID
  method: string;       // "subscribe" | "call" | "cancel"
  payload: unknown;     // method-specific payload
}
```

### Client -> Server Flows

1. **Message Send**
   ```
   Client (WebSocket)
     -> { method: "call", payload: { method: "channels.send", ... } }
       -> Gateway WS handler
         -> route to server-methods/channels.ts
           -> execute send
             -> reply { id, result }
   ```

2. **Session Subscribe**
   ```
   Client
     -> { method: "subscribe", payload: { sessionKey: "main" } }
       -> Gateway
         -> add client to session subscribers
         -> push new messages to client as they arrive
   ```

3. **Tool Invocation**
   ```
   Client
     -> { method: "call", payload: { method: "tools.invoke", toolName, params } }
       -> Gateway
         -> execute tool
           -> stream result back
   ```

4. **Cancel Run**
   ```
   Client
     -> { method: "call", payload: { method: "sessions.kill", sessionKey } }
       -> Gateway
         -> abort signal to active run
           -> stop LLM stream
   ```

### Server -> Client Flows

1. **LLM Streaming Response**
   ```
   Agent LLM call
     -> SSE chunk received
       -> parse delta
         -> push to subscribed WebSocket clients
           -> { id, delta: "...", done: false }
             -> final: { id, delta: "", done: true }
   ```

2. **Channel Message Notification**
   ```
   New message arrives (any channel)
     -> normalize message
       -> dispatch to agent
         -> if client subscribed to session
           -> push message update to WebSocket
   ```

3. **Status Updates**
   ```
   Gateway status change
     -> push to all connected clients
       -> { method: "status", payload: { healthy: true, channels: [...] } }
   ```

4. **Cron Execution Notification**
   ```
   Cron job completes
     -> push result to subscribed clients
       -> { method: "cron.update", payload: { jobId, status } }
   ```

### VoiceClaw Bidirectional Audio

```
Client (microphone)
  -> WebSocket binary audio frame
    -> Gateway VoiceClaw handler
      -> STT provider (Deepgram / Whisper)
        -> text transcript
          -> agent LLM call
            -> TTS provider (ElevenLabs / Azure)
              -> audio frame
                -> WebSocket binary audio frame
                  -> Client (speaker)
```

### Event Bus

- File: `src/infra/system-events.ts`
- Internal pub/sub for gateway components
- Not exposed to external clients directly
- WS subscriptions bridge internal events to clients

## Evidence
- `src/gateway/server-ws-runtime.ts` — WS runtime
- `src/gateway/server/ws-connection/message-handler.ts` — message handling
- `src/gateway/voiceclaw-realtime/upgrade.ts` — VoiceClaw
- `src/infra/system-events.ts` — event bus
- `src/agents/openai-ws-stream.ts` — OpenAI WS

## Notes
- WebSocket is the primary bidirectional transport
- SSE is unidirectional only (server->client)
- No GraphQL subscriptions or MQTT
- Event correlation via `id` field in WS messages
- Clients must handle reconnection on gateway restart
