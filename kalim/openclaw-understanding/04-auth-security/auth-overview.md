# Authentication & Security Overview

## Auth Surfaces

OpenClaw has multiple authentication surfaces with different security levels:

| Surface | Protocol | Auth Methods | Notes |
|---------|----------|--------------|-------|
| Gateway HTTP API | HTTP | token, password, tailscale, trusted-proxy, none | Main control plane |
| Gateway WebSocket | WS | token, password, tailscale, trusted-proxy, none | Bidirectional streaming |
| Control UI (browser) | HTTP/WS | token, password | Origin-restricted |
| Native apps | WS/HTTP | token | Device pairing optional |
| Channel webhooks | HTTP | signature-based (per-channel) | No gateway auth |
| CLI commands | stdio | — | Local process only |

## Gateway Auth Modes

From `src/gateway/auth.ts` and `src/gateway/auth-resolve.ts`:

### 1. Token Mode (`mode: "token"`)

- Single shared secret (`OPENCLAW_GATEWAY_TOKEN` or `gateway.auth.token`)
- Passed via `?token=...` query param or `Authorization: Bearer <token>` header
- Compared using constant-time comparison (`safeEqualSecret`) in `src/security/secret-equal.ts`
- Auto-generated on first start if not set (written to config file)
- Refuses to start if set to documented example placeholder

### 2. Password Mode (`mode: "password"`)

- Uses `OPENCLAW_GATEWAY_PASSWORD` or `gateway.auth.password`
- Compared using bcrypt or constant-time string comparison
- Lower security than token (brute-forceable)

### 3. Tailscale Mode (`mode: "tailscale"`)

- Uses Tailscale `whois` integration (`src/infra/tailscale.ts`)
- Requires Tailscale daemon running on host
- Extracts user identity from Tailscale connection
- No shared secret needed — identity is network-level
- Config: `gateway.auth.allowTailscale: true` (can combine with token mode)

### 4. Trusted Proxy Mode (`mode: "trusted-proxy"`)

- For reverse proxies (nginx, Cloudflare, etc.)
- Trusts `X-Forwarded-User` or configured header from specific proxy IPs
- Config required: `gateway.auth.trustedProxy.userHeader`
- Optional: `gateway.auth.trustedProxy.allowUsers` whitelist
- Mutually exclusive with shared token mode

### 5. No Auth (`mode: "none"`)

- No authentication required
- **DANGEROUS** — only for localhost/development
- Automatically set in some container profiles

### 6. Device Token / Bootstrap Token

- Device pairing tokens for initial setup
- Short-lived tokens generated during onboarding
- Used by native apps to connect

## Auth Resolution Flow

```
Incoming request
  |
  v
resolveGatewayAuth({ auth, tailscale, trustedProxy, ... })
  |
  +-- Token present? → verify with safeEqualSecret()
  +-- Password present? → verify with compare()
  +-- Tailscale allow? + Tailscale whois? → accept
  +-- Trusted proxy? + proxy IP + user header? → accept
  +-- Bootstrap token? → verify
  |
  v
Return GatewayAuthResult { method, user, reason, rateLimited }
```

From `src/gateway/auth.ts` lines 100-299.

## Tailscale Integration Detail

```typescript
// src/gateway/auth.ts ~160-200
resolveTailscaleClientIp(req)
hasTailscaleProxyHeaders(req)
isTailscaleProxyRequest(req, allowTailscale)
resolveVerifiedTailscaleUser(tailscale, req)
```

- Uses `tailscale.whois()` to verify connecting identity
- Checks `X-Forwarded-*` headers for Tailscale proxy evidence
- Validates loopback/proxy IP match

## Trusted Proxy Detail

```typescript
// src/gateway/auth.ts ~200-299
authorizeTrustedProxy({ trustedProxy, req, clientIp })
```

- Extracts user from configured header
- Validates proxy IP is in trusted range
- Optional user whitelist (`allowUsers`)

## Rate Limiting

From `src/gateway/auth-rate-limit.ts`:

```typescript
createGatewayAuthRateLimiters({ config, isBrowserOriginWS })
```

- Global rate limiter for all auth attempts
- Separate stricter rate limiter for browser-origin WS connections
- Configurable per `gateway.auth.rateLimit`
- Memory-based (no Redis required)

## Secret Comparison

From `src/security/secret-equal.ts`:

```typescript
safeEqualSecret(a: string, b: string): boolean
```

- Constant-time comparison to prevent timing attacks
- Used for token and password verification

## Config Validation

From `src/gateway/auth.ts`:

```typescript
assertGatewayAuthConfigured(auth)
```

- Validates auth mode is one of allowed values
- Checks mutual exclusivity (token + trusted-proxy conflict)
- Ensures required fields present for chosen mode
- Throws descriptive errors on misconfiguration

## Key Files

- `src/gateway/auth.ts` — Core auth resolution logic
- `src/gateway/auth-resolve.ts` — Shared effective auth resolution
- `src/gateway/auth-rate-limit.ts` — Auth rate limiting
- `src/security/secret-equal.ts` — Constant-time comparison
- `src/infra/tailscale.ts` — Tailscale whois integration
- `src/gateway/server-runtime-config.ts` — Auth config resolution
- `src/secrets/runtime-gateway-auth-surfaces.ts` — Auth surface secrets

---

*Evidence: `src/gateway/auth.ts`, `src/gateway/auth-resolve.ts`, `src/gateway/auth-rate-limit.ts`, `src/security/secret-equal.ts`, `src/infra/tailscale.ts`, `src/secrets/runtime-gateway-auth-surfaces.ts`.*
