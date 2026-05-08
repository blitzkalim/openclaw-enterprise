# Gateway Token Deep Dive

## Token Lifecycle

### 1. Configuration Resolution

```
CLI start → resolveGatewayAuth()
  ├─ env: OPENCLAW_GATEWAY_TOKEN
  ├─ config: gateway.auth.token
  └─ tailscale: gateway.auth.allowTailscale
```

From `src/gateway/auth-resolve.ts` and `src/gateway/server.impl.ts`:

```typescript
function resolveGatewayAuth({
  env,
  config,
  cliOverrides,
}): ResolvedGatewayAuth {
  // Priority: CLI override > config > env
  const token = cliOverrides.token ?? config.gateway?.auth?.token ?? env.OPENCLAW_GATEWAY_TOKEN;
  const mode = cliOverrides.mode ?? config.gateway?.auth?.mode ?? "token";
  // ...
}
```

### 2. Auto-Generation

When `mode === "token"` and no token is configured:

```typescript
// src/gateway/server.impl.ts ~lines 350-380
if (auth.mode === "token" && !auth.token) {
  if (isContainer || isMinimalTestGateway) {
    // Generate runtime-only token (not persisted)
    auth.token = generateRandomToken();
    log.warn("Generated runtime-only gateway token (not persisted)");
  } else {
    // Generate and persist to config file
    auth.token = generateRandomToken();
    config.gateway.auth.token = auth.token;
    await writeConfigFile(config);
    log.info("Generated gateway token and saved to config");
  }
}
```

### 3. Token Format

```typescript
function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars = 256 bits
}
```

- 256-bit entropy (32 bytes)
- URL-safe hex encoding (no special chars)
- No prefix or structure (unlike API keys)

### 4. First-Start UX

```
Gateway starts for first time
  |
  v
No token configured
  |
  v
Generate random token
  |
  v
Save to ~/.openclaw/openclaw.json
  |
  v
Print to stdout:
  "Gateway token: oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  |
  v
User copies token to client app
```

### 5. Token Validation on Requests

From `src/gateway/auth.ts`:

```typescript
function authorizeGatewayConnect({
  auth,
  req,
  rateLimiter,
  browserRateLimiter,
  clientIp,
  isBrowserOriginWS,
}): GatewayAuthResult {
  // 1. Rate limit check
  if (rateLimiter.check(clientIp)) {
    return { method: null, rateLimited: true };
  }

  // 2. Extract token from query or header
  const token = req.query.token ?? extractBearerToken(req.headers.authorization);

  // 3. Constant-time compare
  if (token && safeEqualSecret(token, auth.token)) {
    return { method: "token", user: "default" };
  }

  // 4. Password fallback (if configured)
  const password = req.query.password ?? req.headers["x-gateway-password"];
  if (password && comparePassword(password, auth.password)) {
    return { method: "password", user: "default" };
  }

  // 5. Tailscale (if allowed)
  if (auth.allowTailscale && isTailscaleProxyRequest(req)) {
    const user = resolveVerifiedTailscaleUser(req);
    if (user) return { method: "tailscale", user };
  }

  // 6. Trusted proxy
  if (auth.mode === "trusted-proxy") {
    const user = authorizeTrustedProxy({ trustedProxy: auth.trustedProxy, req, clientIp });
    if (user) return { method: "trusted-proxy", user };
  }

  return { method: null, reason: "invalid_credentials" };
}
```

### 6. Token Storage

| Storage Location | Persistence | Security |
|-----------------|-------------|----------|
| `~/.openclaw/openclaw.json` | Permanent (file) | File permissions dependent |
| `OPENCLAW_GATEWAY_TOKEN` env | Process lifetime | In process env, may leak |
| Runtime-only (container) | Process lifetime | Not persisted |
| CLI `--token` flag | Process lifetime | Visible in process list |

### 7. Token Rotation

No automatic token rotation observed. Rotation requires:
1. Generate new token
2. Update config or env var
3. Restart gateway (or config reload if supported)
4. Re-authenticate all clients

### 8. Token in WebSocket URLs

From `src/gateway/server-ws-runtime.ts`:

```typescript
// WS connection: ws://host:18789?token=<token>
// Token extracted from URL query parameters
```

**Risk:** Token appears in:
- HTTP access logs (if gateway logs full URLs)
- Browser history (if opened directly)
- Browser dev tools Network tab
- Proxy logs
- Shell history (if using curl/wscat)

**Mitigation in code:**
- No observed mitigation for query param token exposure
- Alternative: `Authorization: Bearer <token>` header (supported but not default for WS)

### 9. Token Comparison Security

From `src/security/secret-equal.ts`:

```typescript
function safeEqualSecret(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
```

- Uses Node.js `crypto.timingSafeEqual`
- Converts to Buffer for consistent byte comparison
- Returns `false` early on length mismatch (does not leak timing on length)

### 10. Token Exposure in Logs

From `src/gateway/server.impl.ts`:

```typescript
// Token is printed to stdout on first generation
// No observed redaction in diagnostic/logging output
```

**Risk:** Token may appear in:
- Docker container logs (`docker logs openclaw-gateway`)
- systemd journal (`journalctl -u openclaw`)
- CI/CD logs if onboarding runs in CI
- Terminal scrollback

### 11. Token vs Password

| Feature | Token | Password |
|---------|-------|----------|
| Entropy | 256-bit random | User-chosen (variable) |
| Storage | Config file / env | Config file / env |
| Comparison | Constant-time string | bcrypt or constant-time |
| Brute-force resistance | Excellent | Depends on user choice |
| Revocation | Config reload | Config reload |
| Default mode | Yes | Optional fallback |

### 12. Token-less Operation (Tailscale)

When `allowTailscale: true`:
- Gateway accepts Tailscale identity as authentication
- No shared token needed for Tailscale users
- Identity verified via local Tailscale daemon (`tailscale whois`)
- Most secure option for personal deployment with Tailscale

### 13. Token-less Operation (Trusted Proxy)

When `mode: "trusted-proxy"`:
- No shared token in OpenClaw config
- Proxy (nginx, Cloudflare, etc.) handles auth
- Gateway trusts `X-Forwarded-User` or configured header
- Risk: proxy misconfiguration = impersonation

### 14. Token-less Operation (None)

When `mode: "none"`:
- No authentication
- Only safe on loopback or fully isolated network
- Default in some container profiles for development

## Key Files

- `src/gateway/auth.ts` — Token validation logic
- `src/gateway/auth-resolve.ts` — Effective auth resolution
- `src/gateway/server.impl.ts` — Token generation & persistence
- `src/security/secret-equal.ts` — Constant-time comparison
- `src/gateway/server-ws-runtime.ts` — WS token extraction
- `src/gateway/auth-rate-limit.ts` — Rate limiting around auth

---

*Evidence: Direct code inspection of `src/gateway/auth.ts`, `src/gateway/auth-resolve.ts`, `src/gateway/server.impl.ts`, `src/security/secret-equal.ts`, `src/gateway/server-ws-runtime.ts`.*
