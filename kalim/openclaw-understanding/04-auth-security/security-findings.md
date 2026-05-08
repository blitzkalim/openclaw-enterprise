# Security Findings & Risk Assessment

## Risk Severity Legend

- **CRITICAL** — Immediate exploitation possible, data breach, unauthorized access
- **HIGH** — Significant security concern, should be addressed before production
- **MEDIUM** — Moderate risk, manageable with config best practices
- **LOW** — Minor concern, defense-in-depth opportunity
- **INFO** — Observation for awareness

---

## 1. CRITICAL: No RBAC / All-Or-Nothing Auth

**Finding:** The gateway uses binary authentication — any valid token/password grants full access to all gateway APIs, WS streams, and control UI.

**Evidence:** `src/gateway/auth.ts` returns `GatewayAuthResult` with no role/permission fields. `src/gateway/server-request-context.ts` creates context without privilege checks.

**Risk:** Compromised single token = full system access. No privilege separation between read-only, operator, and admin.

**Recommendation:** Implement role-based access control if multi-user deployment is intended. Otherwise, document explicitly as single-user personal assistant.

---

## 2. HIGH: Token Auto-Generation & Persistence

**Finding:** On first start with no token, OpenClaw auto-generates a token and writes it to `openclaw.json`. The token is printed to stdout.

**Evidence:** `src/gateway/server.impl.ts` startup sequence, `src/gateway/auth-resolve.ts`.

**Risk:** Token may be logged in system logs, container logs, or terminal scrollback. File permissions on `openclaw.json` determine if other users can read token.

**Recommendation:** Verify `openclaw.json` is created with `0o600` permissions. Warn users about log retention. Support token provisioning via env var without persistence.

---

## 3. HIGH: Password Auth Without Rate Limiting

**Finding:** Password auth (`OPENCLAW_GATEWAY_PASSWORD`) is supported alongside token auth. Passwords are compared with bcrypt or string compare.

**Evidence:** `src/gateway/auth.ts` password check path.

**Risk:** Brute-force attacks on password via HTTP/WS endpoints. Rate limiting exists for auth attempts generally but may not be strict enough for password mode.

**Recommendation:** Strongly discourage password mode. Add exponential backoff. Consider removing password mode in favor of token-only + Tailscale.

---

## 4. HIGH: Trusted Proxy Misconfiguration Risk

**Finding:** `trusted-proxy` auth mode trusts arbitrary proxy IPs and user headers. No HMAC or signed headers.

**Evidence:** `src/gateway/auth.ts` `authorizeTrustedProxy()`. Validates proxy IP and extracts user from header.

**Risk:** Misconfigured reverse proxy (e.g., missing `proxy_protocol` or open to spoofing) allows header injection and impersonation.

**Recommendation:** Document exact required proxy configuration. Add allowed proxy IP CIDR validation. Consider mTLS between proxy and gateway.

---

## 5. MEDIUM: No Auth Mode (`mode: "none"`)

**Finding:** Gateway can run with no authentication (`mode: "none"`).

**Evidence:** `src/gateway/auth.ts` auth mode options.

**Risk:** Accidental deployment without auth exposes full gateway to network.

**Recommendation:** Add prominent startup warning when `mode: "none"` is active and binding is not loopback. Require explicit `--insecure` flag.

---

## 6. MEDIUM: Loopback Bypass

**Finding:** Loopback requests may bypass some auth checks depending on configuration.

**Evidence:** `src/gateway/net.ts` `isLoopback()`, references in auth resolution.

**Risk:** On shared hosts or containers, loopback may not be as isolated as expected.

**Recommendation:** Explicitly document loopback trust behavior. Add option to disable loopback bypass.

---

## 7. MEDIUM: Secrets in Config File

**Finding:** API keys and tokens stored in `openclaw.json` as plain JSON values. No encryption at rest.

**Evidence:** Config I/O in `src/config/io.ts`. `.env.example` shows keys in env vars.

**Risk:** Config file readable by any process with user permissions. Backups may contain secrets.

**Recommendation:** Support secret provider integration (1Password, Vault, etc.) for all secrets. Mark sensitive keys in schema for redaction in logs.

---

## 8. MEDIUM: CORS Origin Wildcards

**Finding:** `controlUi.allowedOrigins` supports wildcard patterns.

**Evidence:** `src/gateway/origin-check.ts`.

**Risk:** Overly permissive origin patterns allow malicious websites to connect via browser.

**Recommendation:** Validate origin patterns on config load. Warn on `*` or overly broad patterns.

---

## 9. LOW: Rate Limit Memory-Based

**Finding:** Rate limiting is in-memory, not distributed.

**Evidence:** `src/gateway/auth-rate-limit.ts`.

**Risk:** Restarting gateway resets rate limit counters. Multiple gateway instances don't share limits.

**Recommendation:** Acceptable for single-instance personal assistant. Document limitation.

---

## 10. LOW: Token in Query Parameters

**Finding:** WS auth supports `?token=` in URL query parameters.

**Evidence:** `src/gateway/server-ws-runtime.ts`.

**Risk:** Token may appear in HTTP access logs, browser history, referrer headers.

**Recommendation:** Prefer `Authorization` header or `Sec-WebSocket-Protocol` for WS auth. Document query param risk.

---

## 11. INFO: Diagnostic Heartbeat May Leak Info

**Finding:** Diagnostic heartbeat logs may include config snippets or runtime state.

**Evidence:** `src/logging/diagnostic.ts`, `src/infra/diagnostic-events.ts`.

**Risk:** Debug/diagnostic output in production may leak sensitive config.

**Recommendation:** Audit diagnostic events for PII/secrets. Ensure redaction in production.

---

## 12. INFO: Multiple API Key Slots

**Finding:** `.env.example` shows multiple API key slots (`OPENAI_API_KEY_1`, `ANTHROPIC_API_KEY_1`, etc.).

**Evidence:** `.env.example` lines 50+.

**Risk:** Multiple key slots increase exposure surface if any single env file is compromised.

**Recommendation:** Document key rotation strategy. Support secret providers for all slots.

---

## Summary Table

| # | Finding | Severity | File(s) | Mitigation Complexity |
|---|---------|----------|---------|----------------------|
| 1 | No RBAC | CRITICAL | `src/gateway/auth.ts` | High (architectural) |
| 2 | Token auto-generation | HIGH | `src/gateway/server.impl.ts` | Low |
| 3 | Password brute-force | HIGH | `src/gateway/auth.ts` | Medium |
| 4 | Trusted proxy spoofing | HIGH | `src/gateway/auth.ts` | Medium |
| 5 | No auth mode | MEDIUM | `src/gateway/auth.ts` | Low |
| 6 | Loopback bypass | MEDIUM | `src/gateway/net.ts` | Low |
| 7 | Secrets in config | MEDIUM | `src/config/io.ts` | Medium |
| 8 | CORS wildcards | MEDIUM | `src/gateway/origin-check.ts` | Low |
| 9 | Memory rate limits | LOW | `src/gateway/auth-rate-limit.ts` | Low |
| 10 | Token in query params | LOW | `src/gateway/server-ws-runtime.ts` | Low |
| 11 | Diagnostic leaks | INFO | `src/logging/diagnostic.ts` | Low |
| 12 | Multiple key slots | INFO | `.env.example` | Low |

---

*Evidence: Direct code inspection of `src/gateway/auth.ts`, `src/gateway/server.impl.ts`, `src/gateway/auth-rate-limit.ts`, `src/gateway/origin-check.ts`, `src/gateway/net.ts`, `src/config/io.ts`, `src/logging/diagnostic.ts`, `.env.example`.*
