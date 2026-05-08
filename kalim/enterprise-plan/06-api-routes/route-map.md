# Route Map

## Purpose
All routes grouped by module.

## Findings

### Health & Probe Routes

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/health` | GET | None | Liveness probe |
| `/healthz` | GET | None | Liveness probe |
| `/ready` | GET | None | Readiness probe |
| `/readyz` | GET | None | Readiness probe |

### OpenAI-Compatible API

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/v1/models` | GET | Token | List available models |
| `/v1/models/:model` | GET | Token | Get model info |
| `/v1/chat/completions` | POST | Token | Chat completions (streaming) |
| `/v1/responses` | POST | Token | OpenAI responses API |
| `/v1/embeddings` | POST | Token | Text embeddings |

### Gateway RPC

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/gateway/call` | POST | Token | Generic RPC method dispatch |
| `/gateway/chat` | POST | Token | Gateway chat endpoint |

### Canvas & UI

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/canvas/*` | GET/POST | Token | Canvas host server |
| `/a2ui/*` | GET/POST | Token | A2UI surface |
| `/` | GET | Token | Control UI redirect |
| `/control-ui/*` | GET | Token | Control UI static assets |

### Session Management

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/sessions/history/:sessionKey` | GET | Token | Session message history |
| `/sessions/kill/:sessionKey` | POST | Token | Kill active session run |

### Tool Invocation

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/tools/invoke/:toolName` | POST | Token | Invoke tool directly |

### Image Attachments

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/managed-image-attachments/*` | GET | Token | Serve managed images |

### VoiceClaw Realtime

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/voiceclaw/realtime` | GET | Token | VoiceClaw WebSocket upgrade |

### Plugin Webhooks

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/hooks/:channelId/*` | Various | Bypass | Channel webhook handlers |

### Device Pairing

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/devices/pair` | POST | Token | Initiate device pairing |
| `/devices/verify` | POST | Token/Pairing | Verify pairing code |

### Embeddings

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/embeddings` | POST | Token | Text embedding endpoint |

### TLS / Certificates

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/gateway/tls/*` | GET | Token | TLS certificate management |

### Agent Status

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/gateway/status` | GET | Token | Agent/gateway status |

## Evidence
- `src/gateway/server-http.ts` — HTTP route dispatch
- `src/gateway/server-methods-list.ts` — RPC method registry
- `src/channels/plugins/gateway-auth-bypass.js` — webhook bypass paths
- `src/canvas-host/a2ui.ts` — A2UI routes
- `src/gateway/voiceclaw-realtime/paths.ts` — VoiceClaw paths

## Notes
- Most routes require token auth except health probes and webhooks
- OpenAI-compatible routes enable using OpenClaw as a drop-in API replacement
- Plugin routes are dynamically registered based on loaded extensions
- Some routes have specialized auth (e.g., device pairing uses pairing tokens)
