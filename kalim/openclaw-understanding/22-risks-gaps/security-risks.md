# Risks & Gaps

## Critical Risks

### 1. No RBAC / Multi-Tenancy
- Single admin gate (token/password)
- All authenticated users have full access
- No user roles, no permission levels
- No tenant isolation

### 2. Token Auto-Generation
- Missing token auto-generates on startup
- Saved to `openclaw.json` (plaintext)
- If config is world-readable, token is exposed

### 3. Password Brute-Force
- Rate limiting is memory-based (single instance)
- No account lockout, no CAPTCHA
- `OPENCLAW_PASSWORD` env var fallback weakens password mode

### 4. Trusted-Proxy Bypass
- `X-Forwarded-For` trust without proxy validation
- Could be forged if gateway exposed directly
- Combined with Tailscale allow = full bypass

### 5. No-Auth Mode
- `mode: "none"` disables all auth
- Exposes gateway to LAN if not firewalled
- No warning prompt before enabling

### 6. Secrets in Config
- API keys stored in plaintext `openclaw.json`
- `~/.openclaw/` directory permissions not enforced
- Config backups (`.bak`) also contain secrets

### 7. CORS Wildcards
- `Access-Control-Allow-Origin: *` may be set
- Allows any website to call API with stolen token

### 8. Token in Query Params
- WebSocket auth may pass token in URL query
- Token logged in proxy/access logs

### 9. Diagnostic Leaks
- `/diagnostics/events` exposes raw error messages
- May contain secrets, file paths, internal IPs
- No access control beyond gateway auth

### 10. Plugin Trust Model
- No plugin sandbox or permission system
- Malicious plugin = full system compromise
- Extensions run in same Node.js process

## Architectural Gaps

### 1. Single-Process Design
- No horizontal scaling
- File storage not concurrent-safe
- Memory limits = single instance limits

### 2. No Database
- File-based state = no transactions
- Concurrent writes may corrupt JSON
- No query capabilities for sessions

### 3. No Secret Rotation
- Gateway token never auto-rotates
- API keys static until manual change
- No secret versioning

### 4. Session Persistence
- Sessions stored as plaintext JSON
- No encryption at rest
- No expiration / TTL by default

### 5. Media Storage Growth
- Media files accumulate indefinitely
- No quota enforcement
- May fill disk

## Mitigation Recommendations

| Risk | Priority | Mitigation |
|------|----------|------------|
| No RBAC | High | Implement role-based access |
| Token plaintext | High | Encrypt config secrets |
| Password brute-force | High | Add bcrypt + rate limit per IP |
| Trusted-proxy bypass | Medium | Validate proxy presence |
| No auth mode | Medium | Require explicit enable + warning |
| Plugin sandbox | Medium | Subprocess isolation |
| Single-process | Low | Document scaling limits |
| Media growth | Low | Add quota + auto-cleanup |

---

*Evidence: `src/gateway/auth.ts`, `src/gateway/auth-rate-limit.ts`, `04-auth-security/security-findings.md`, `src/config/config.ts`, `docker-compose.yml`.*
