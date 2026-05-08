# Security Middleware

## Gateway Middleware Stack

From `src/gateway/server-runtime-state.ts` and `src/gateway/server.impl.ts`:

```
Request
  |
  v
HTTP Server (hono or raw Node)
  |
  v
1. CORS / Origin Check
  +-- controlUi.allowedOrigins matching
  +-- Browser origin validation
  +-- Rejects unknown origins for Control UI
  |
  v
2. HSTS (if TLS enabled)
  +-- Strict-Transport-Security header
  |
  v
3. Auth Resolution
  +-- Extract token/password from headers/query
  +-- Tailscale whois check
  +-- Trusted proxy validation
  +-- Rate limit check
  |
  v
4. Request Context
  +-- Create GatewayRequestContext
  +-- Attach auth result, client info, session
  |
  v
5. Route Handler
```

## Origin Check

From `src/gateway/origin-check.ts`:

```typescript
function checkOrigin({ origin, allowedOrigins, mode })
```

- `allowedOrigins`: array of allowed origin patterns
- Supports exact match and wildcard patterns
- Different rules for Control UI vs API endpoints
- Browser-origin WS gets stricter rate limiting

## IP / Network Checks

From `src/gateway/net.ts`:

```typescript
isLoopback(ip)
isLan(ip)
isTailnet(ip)
resolveClientIp(req, trustProxy)
```

- Loopback requests may bypass some auth checks
- LAN binding exposes to local network
- `trustProxy` controls X-Forwarded-For parsing
- Tailscale IPs identified for special handling

## Rate Limiting

From `src/gateway/auth-rate-limit.ts`:

```typescript
createGatewayAuthRateLimiters({ config, isBrowserOriginWS })
  → { rateLimiter, browserRateLimiter }
```

- Memory-based token bucket (no external dependency)
- Per-IP tracking
- Separate stricter limits for browser-origin WS
- Configurable window and max requests
- Returns 429 on exceeded limits

## HSTS

From `src/gateway/server-runtime-state.ts` or TLS module:

- Enabled only when TLS is active
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

## Content Security Policy

Assumption (not directly observed in reviewed files):
- Control UI likely serves with CSP headers
- Static assets served from bundled UI build

## No CSRF Tokens

- Gateway API is primarily stateless token auth
- No traditional session cookie CSRF protection needed
- Control UI may have its own CSRF protection (not in reviewed core files)

## No Input Sanitization Middleware (General)

- Individual route handlers responsible for validation
- Config schema uses Zod for structured validation
- No global XSS/sanitization middleware observed

## Key Files

- `src/gateway/server-runtime-state.ts` — HTTP server setup, middleware order
- `src/gateway/origin-check.ts` — Origin validation
- `src/gateway/net.ts` — IP/network utilities
- `src/gateway/auth-rate-limit.ts` — Rate limiting
- `src/gateway/server-request-context.ts` — Request context
- `src/gateway/server/tls.ts` — TLS / HSTS

---

*Evidence: `src/gateway/server-runtime-state.ts`, `src/gateway/origin-check.ts`, `src/gateway/net.ts`, `src/gateway/auth-rate-limit.ts`, `src/gateway/server-request-context.ts`.*
