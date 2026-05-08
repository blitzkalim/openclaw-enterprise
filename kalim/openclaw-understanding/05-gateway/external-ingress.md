# External Ingress

## Network Ingress Points

### 1. Gateway HTTP/WS Port (Primary)

**Port:** 18789 (default, configurable via `OPENCLAW_GATEWAY_PORT`)
**Protocol:** HTTP + WebSocket upgrade
**Bind:** Configurable (`loopback`, `lan`, `tailnet`, `auto`)

```
Internet / LAN / Tailscale
  |
  v
[Firewall / Router]
  |
  v
OpenClaw Gateway :18789
  |
  +-- HTTP API (/healthz, /v1/*, /gateway/*, /webhook/*)
  +-- WS (/ — upgraded from HTTP)
  +-- Control UI (/control-ui/*)
  +-- Static Assets (/assets/*)
```

### 2. Docker Compose Ports

From `docker-compose.yml`:
```yaml
ports:
  - "${OPENCLAW_GATEWAY_PORT:-18789}:18789"
  - "${OPENCLAW_BRIDGE_PORT:-18790}:18790"
```

- Host port mapping for gateway and bridge
- Bridge port likely for CLI-to-gateway communication within container network

### 3. Webhooks (Inbound from External Services)

Channels receive webhooks from external services:

| Channel | Webhook Path | Source |
|---------|-------------|--------|
| Telegram | `/webhook/telegram` or polling | Telegram Bot API |
| Discord | WebSocket (not HTTP webhook) | Discord Gateway |
| Slack | `/webhook/slack` | Slack Events API |
| WhatsApp | WebSocket (Baileys) | WhatsApp servers |
| Signal | Local socket / REST | Signal CLI / signald |
| MS Teams | `/webhook/msteams` | Teams Bot Framework |
| Google Chat | `/webhook/googlechat` | Google Chat API |
| Line | `/webhook/line` | LINE Messaging API |
| Zalo | `/webhook/zalo` | Zalo API |
| Feishu | `/webhook/feishu` | Feishu/Lark |
| Mattermost | `/webhook/mattermost` | Mattermost |
| Twitch | WebSocket / webhook | Twitch IRC/Eventsub |
| Nostr | WebSocket | Nostr relays |
| IRC | TCP socket | IRC servers |
| Webhooks (generic) | `/webhook/:channelId` | User-configured |

### 4. mDNS / Bonjour Discovery

From `src/gateway/server-startup.ts`:

```typescript
// Bonjour advertising for local network discovery
if (!isContainer && !OPENCLAW_DISABLE_BONJOUR) {
  advertiseGatewayOnLan({ port, host });
}
```

- Advertises `_openclaw._tcp` service on local network
- Allows native apps to auto-discover gateway
- Can be disabled with `OPENCLAW_DISABLE_BONJOUR`

### 5. Tailscale

From `src/infra/tailscale.ts`:

- Gateway can bind to Tailscale interface (`tailnet` mode)
- Tailscale provides encrypted mesh networking
- Auth via Tailscale identity (no shared token needed)
- Automatic NAT traversal

### 6. Reverse Proxy Ingress

Common production setup (inferred from architecture):

```
Internet
  |
  v
[Nginx / Caddy / Traefik / Cloudflare]
  |
  v
[TLS termination]
  |
  v
OpenClaw Gateway :18789 (loopback or tailnet)
  |
  +-- Auth: trusted-proxy mode (X-Forwarded-User)
  +-- Or: token mode (proxy passes through token)
```

## Protocol Support

### HTTP API

From `src/gateway/server-runtime-state.ts` and `src/gateway/server-request-context.ts`:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/healthz` | GET | None | Health check |
| `/readiness` | GET | None | Readiness probe |
| `/v1/chat/completions` | POST | Token | OpenAI-compatible chat |
| `/v1/responses` | POST | Token | OpenResponses API |
| `/gateway/*` | Various | Token | Internal gateway methods |
| `/webhook/:channelId` | POST | Signature | Channel webhooks |
| `/control-ui/*` | GET | None | Static React app |
| `/assets/*` | GET | None | Static assets |
| `/metrics` | GET | None | Prometheus metrics (if enabled) |

### WebSocket

From `src/gateway/server-ws-runtime.ts`:

**Path:** `/` (upgraded from HTTP)
**Subprotocols:** None required (or `openclaw`)
**Auth:** Query param `?token=` or header `Authorization: Bearer`
**Message format:** JSON-RPC-like (method + params)

### MCP (Model Context Protocol)

From `src/gateway/mcp-http.ts`:

- Loopback MCP server for local tool access
- HTTP endpoint for MCP clients
- Likely bound to loopback only

## Security Boundaries

| Layer | Control | Recommendation |
|-------|---------|---------------|
| Firewall | External | Only expose 18789 if needed |
| Bind mode | Gateway config | Use `loopback` or `tailnet` when possible |
| Auth | Gateway config | Always use `token` or `tailscale` |
| TLS | Gateway config / Reverse proxy | Enable TLS in production |
| CORS | Gateway config | Restrict `controlUi.allowedOrigins` |
| Rate limiting | Gateway config | Enable auth rate limiting |

## Cloud Deployment Patterns

### Single-Instance (VPS / Cloud VM)

```
[Cloud VM]
  +-- OpenClaw Gateway (Docker)
  +-- Nginx reverse proxy (TLS)
  +-- Domain + Let's Encrypt
```

### Home Server / NAS

```
[Home Network]
  +-- OpenClaw Gateway (Docker or native)
  +-- Tailscale for remote access
  +-- No public ports exposed
```

### Kubernetes (Inferred)

```yaml
# Conceptual — not observed in repo
apiVersion: v1
kind: Service
metadata:
  name: openclaw-gateway
spec:
  ports:
    - port: 18789
  selector:
    app: openclaw-gateway
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openclaw-gateway
spec:
  template:
    spec:
      containers:
        - name: gateway
          image: openclaw:latest
          ports:
            - containerPort: 18789
```

No K8s manifests observed in repo. Deployment would be custom.

## Key Files

- `src/gateway/server.impl.ts` — Server startup, port binding
- `src/gateway/server-runtime-config.ts` — Bind mode resolution
- `src/gateway/server-ws-runtime.ts` — WebSocket ingress
- `src/gateway/mcp-http.ts` — MCP ingress
- `src/gateway/net.ts` — Network interface resolution
- `docker-compose.yml` — Docker port mapping
- `src/infra/tailscale.ts` — Tailscale integration
- `src/gateway/server-startup.ts` — Bonjour/mDNS advertising

---

*Evidence: `src/gateway/server.impl.ts`, `src/gateway/server-runtime-config.ts`, `src/gateway/server-ws-runtime.ts`, `src/gateway/mcp-http.ts`, `src/gateway/net.ts`, `docker-compose.yml`, `src/infra/tailscale.ts`, `src/gateway/server-startup.ts`.*
