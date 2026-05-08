# Security Findings

## Purpose
Document strengths and weaknesses of the security model.

## Findings

### Strengths

1. **Constant-Time Secret Comparison**
   - `src/security/secret-equal.ts` — `safeEqualSecret()` prevents timing attacks
   - Used for all token/password comparisons

2. **Weak Secret Detection**
   - `src/gateway/known-weak-gateway-secrets.ts`
   - Blocks known placeholder/example tokens
   - Prevents copy-paste of documented example values

3. **DM Pairing by Default**
   - Unknown senders receive a pairing code, not processed
   - Explicit opt-in required (`dmPolicy="open"` + `allowFrom: ["*"]`)
   - `openclaw doctor` surfaces risky DM policies

4. **Sandboxing Available**
   - Docker sandbox backend for non-main sessions
   - SSH and OpenShell backends also available
   - Tool policies restrict dangerous tools in sandbox

5. **Rate Limiting on Auth Failures**
   - `src/gateway/auth-rate-limit.ts`
   - Per-IP tracking of failed attempts
   - Exponential backoff

6. **SSRF Protection**
   - `src/security/ssrf.ts` — SSRF URL validation
   - Blocks internal network access from agent-initiated HTTP requests

7. **Config Audit Logging**
   - Every config write appends an audit record
   - `src/config/io.audit.ts`
   - Includes hash, timestamp, and operation type

8. **Trusted Proxy Validation**
   - Gateway auth supports trusted proxy CIDR lists
   - Origin checks for browser-based access
   - Tailscale integration for zero-trust networking

### Weaknesses

1. **No Encryption at Rest for Secrets**
   - Tokens and API keys stored in plain text JSON config
   - `secret://` and `file://` references exist but not universally used
   - No hardware-backed key storage (Keychain, TPM, etc.)

2. **No Token Expiry / Rotation**
   - Gateway tokens are static until manually changed
   - No automatic rotation schedule
   - No revocation list for device tokens

3. **Single User Design**
   - No multi-tenant isolation
   - No RBAC or permission system
   - All local files accessible to main session

4. **No Audit Log for Agent Actions**
   - Agent tool executions not centrally logged
   - No tamper-evident action history
   - Config audit only covers config changes

5. **Sandbox Gaps**
   - Docker sandbox optional, not default for main session
   - Main session has full host access by design
   - SSH sandbox requires additional infrastructure

6. **No CSP / Content Security Policy**
   - Control UI served without strict CSP headers
   - `src/gateway/http-common.ts` sets basic headers but no CSP

7. **Secrets in Env Vars**
   - All API keys readable by process environment
   - No secret manager integration (AWS Secrets Manager, HashiCorp Vault, etc.)

8. **No Network Segmentation**
   - Single-process architecture means all plugins share memory space
   - Malicious plugin could access other plugin state
   - No capability-based sandboxing at the plugin level

## Evidence
- `src/security/secret-equal.ts` — constant-time comparison
- `src/gateway/known-weak-gateway-secrets.ts` — weak secret detection
- `src/security/dm-policy-shared.ts` — DM policies
- `src/agents/sandbox/tool-policy.ts` — sandbox policies
- `src/gateway/auth-rate-limit.ts` — rate limiting
- `src/security/ssrf.ts` — SSRF protection
- `src/config/io.audit.ts` — config audit

## Recommendations
- Implement keychain/TPM integration for gateway token storage
- Add automatic token rotation
- Add centralized audit logging for all agent actions
- Implement CSP headers for Control UI
- Add plugin capability sandboxing (V8 isolates, Wasm)
