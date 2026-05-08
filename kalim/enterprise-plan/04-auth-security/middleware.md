# Auth Middleware

## Purpose
Catalog all auth middleware with file paths.

## Findings

### HTTP Auth Middleware

1. **`authorizeHttpGatewayConnect()`**
   - File: `src/gateway/auth.ts`
   - Called by: `src/gateway/server-http.ts`
   - Validates: token, password, tailscale, trusted-proxy, device-token, bootstrap-token
   - Returns: `GatewayAuthResult` with method and user identity

2. **`isLocalDirectRequest()`**
   - File: `src/gateway/auth.ts`
   - Checks if request originates from loopback without forwarded headers
   - Used to bypass auth for local health checks

3. **Rate Limiting Middleware**
   - File: `src/gateway/auth-rate-limit.ts`
   - Scope: `AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET`
   - Tracks failed auth attempts per IP
   - Exponential backoff on repeated failures

### WebSocket Auth Middleware

1. **`resolveWsConnectionAuthContext()`**
   - File: `src/gateway/server/ws-connection/auth-context.ts`
   - Validates WebSocket handshake auth
   - Supports token, password, and device-token modes

2. **`handshakeAuthHelpers.ts`**
   - File: `src/gateway/server/ws-connection/handshake-auth-helpers.ts`
   - Validates handshake tokens
   - Enforces origin policy for browser WS connections

### Plugin Route Auth

1. **`resolvePluginRoutePathContext()`**
   - File: `src/gateway/server/plugins-http/path-context.ts`
   - Determines if a plugin HTTP route needs gateway auth
   - Some plugin routes (webhooks) declare auth bypass

2. **`isProtectedPluginRoutePathFromContext()`**
   - Same file — checks if route is protected

### CORS & Security Headers

1. **`setDefaultSecurityHeaders()`**
   - File: `src/gateway/http-common.ts`
   - Sets: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.

2. **Origin Check**
   - File: `src/gateway/origin-check.ts`
   - `checkBrowserOrigin()` validates browser origin against allowlist

### Control UI Auth

1. **Control UI Route Handler**
   - File: `src/gateway/server.auth.control-ui.suite.ts`
   - Specialized auth for serving the Control UI static assets
   - Allows browser-based tokenless login from trusted origins

## Evidence
- `src/gateway/auth.ts` — core auth validation
- `src/gateway/server-http.ts` — HTTP middleware chain
- `src/gateway/server/ws-connection/auth-context.ts` — WS auth
- `src/gateway/auth-rate-limit.ts` — rate limiting
- `src/gateway/http-common.ts` — security headers

## Notes
- No traditional Express/Koa/Hono middleware stack — custom Node.js HTTP server
- Auth is checked per-request, not via global middleware chain
- Some paths (`/healthz`, `/readyz`) are explicitly unprotected
- Plugin webhook routes can opt out of gateway auth via manifest metadata
