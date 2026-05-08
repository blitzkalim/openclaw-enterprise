# External Ingress

## Purpose
How traffic reaches the Gateway from external sources.

## Findings

### Direct Access

1. **Loopback** (`127.0.0.1`, `::1`)
   - No auth required by default (`mode: none`)
   - Used for local CLI, local browser, IDE plugins
   - Safe for single-user local deployment

2. **LAN** (default binding mode)
   - Binds to all interfaces: `0.0.0.0` or LAN IP
   - Requires token or password auth
   - Bonjour/mDNS advertises the service
   - Local network devices can discover and connect

3. **Tailscale**
   - Integration with Tailscale mesh VPN
   - `tailscale whois` for identity-based auth
   - No token needed if Tailscale auth enabled
   - `x-forwarded-*` headers from Tailscale proxy

4. **Host / Public**
   - `--bind host` or `--bind 0.0.0.0`
   - Exposes gateway to internet
   - **Strongly discouraged without token auth**
   - No built-in TLS (requires reverse proxy)

### Reverse Proxy Support

1. **Trusted Proxy Headers**
   - `x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-host`
   - `x-real-ip` (opt-in only)
   - `src/gateway/net.ts` — proxy-aware IP resolution
   - Config: `gateway.auth.trustedProxy` (CIDR list)

2. **Origin Policy**
   - `src/gateway/origin-check.ts` — `checkBrowserOrigin()`
   - Allowed origins configurable for browser access
   - Host header origin fallback (opt-in)

### Docker Ingress

```
Internet / LAN
  → Docker host
    → openclaw-gateway container
      → port 18789 (gateway)
      → port 18790 (bridge)
```

- `docker-compose.yml` exposes ports 18789 and 18790
- `extra_hosts: host.docker.internal:host-gateway` for local model access
- Healthcheck: HTTP GET `http://127.0.0.1:18789/healthz`

### Cloud Deployment

- No native cloud deployment templates
- Docker image is the primary deployment artifact
- Can run on VPS, cloud VM, NAS, Raspberry Pi
- No Kubernetes manifests or Helm charts

### WebSocket Ingress

- WS endpoint: `ws://host:18789/ws` or `wss://host:18789/ws`
- Same auth as HTTP (token, password, or Tailscale)
- Used by:
  - Native apps (iOS, Android, macOS)
  - Browser Control UI
  - External clients

### Webhook Ingress (Channel)

- Each channel plugin can register webhook handlers
- Path pattern: `/hooks/<channel-id>/...`
- Auth bypass for known webhook paths
- Signature verification where supported (Discord, Slack, etc.)

## Evidence
- `src/gateway/server.impl.ts` — server binding
- `src/gateway/server-http.ts` — request ingress
- `src/gateway/net.ts` — proxy/IP resolution
- `src/gateway/origin-check.ts` — origin validation
- `docker-compose.yml` — Docker ingress
- `src/infra/tailscale.ts` — Tailscale integration

## Notes
- No CDN or WAF integration
- No DDoS protection built in
- Rate limiting only applies to auth failures, not general requests
- TLS termination recommended via reverse proxy (nginx, Caddy, Traefik)
