# Undocumented Routes

## Purpose
Routes found in code but not in public documentation.

## Findings

### Internal / Debug Routes

1. **`/gateway/probe`**
   - File: `src/gateway/probe-auth.test.ts`
   - Auth probe for testing connectivity
   - Returns auth method and user identity

2. **`/gateway/reload`**
   - File: `src/gateway/server.reload.test.ts`
   - Config reload trigger
   - Forces runtime services to re-read config

3. **`/gateway/diagnostics/*`**
   - File: `src/infra/diagnostic-trace-context.ts`
   - Diagnostic trace endpoints
   - Only active when diagnostics enabled

4. **`/test/*`**
   - Multiple test helper endpoints in `src/gateway/test-*.ts`
   - Only active in test/dev mode
   - Mock model responses, mock channels, etc.

### Plugin Internal Routes

5. **`/hooks/*` (all channel webhooks)**
   - Documented per-channel but no unified webhook docs
   - Each channel registers its own webhook sub-paths
   - WhatsApp: `/hooks/whatsapp/*`
   - Telegram: `/hooks/telegram/*`
   - Discord: `/hooks/discord/*`
   - Slack: `/hooks/slack/*`

6. **`/gateway/codex/*`**
   - File: `src/gateway/gateway-codex-harness.live.test.ts`
   - Codex integration endpoints
   - OpenAI Codex agent harness

7. **`/gateway/node-invoke/*`**
   - File: `src/gateway/server.node-invoke-approval-bypass.test.ts`
   - Node remote invocation
   - Cross-device command execution

### Session / Transcript Internal

8. **`/sessions/transcript-repair`**
   - File: `src/agents/session-transcript-repair.test.ts`
   - Transcript repair utilities
   - Internal maintenance endpoint

### TLS Management

9. **`/gateway/tls/certificates`**
   - File: `src/gateway/server/tls.ts`
   - TLS certificate listing/renewal
   - Self-signed cert generation

### Metrics / Observability

10. **`/metrics`** (if Prometheus extension loaded)
    - File: `extensions/diagnostics-prometheus/`
    - Prometheus metrics exposition
    - Only available when OTEL/Prometheus enabled

11. **`/gateway/audit`**
    - File: `src/config/io.audit.ts`
    - Config audit log access
    - Internal diagnostics

### WebSocket Internal

12. **`/ws` (WebSocket upgrade)**
    - Documented in protocol docs but not in API reference
    - Binary message protocol
    - Auth via query param or handshake message

## Evidence
- `src/gateway/server-http.ts` — route scanning
- `src/gateway/server-methods-list.ts` — method list
- `src/gateway/test-*.ts` — test endpoints
- `src/gateway/probe-auth.test.ts` — probe route
- `extensions/*/src/` — plugin route registration

## Notes
- Many undocumented routes are test-only or diagnostics-only
- Plugin routes are discovered at runtime based on loaded extensions
- Some routes require `OPENCLAW_DIAGNOSTICS` flags to be enabled
- Production deployments should not expose undocumented routes
