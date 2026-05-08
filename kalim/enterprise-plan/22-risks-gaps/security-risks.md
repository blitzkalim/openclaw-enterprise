# Security Risks

## Purpose
Document identified security risks and concerns.

## Findings

## HIGH SEVERITY

### 1. No Encryption at Rest
- Config, sessions, media stored as plain JSON/files
- SQLite databases unencrypted
- Physical access = full data access
- Mitigation: filesystem encryption (OS-level)

### 2. Single User / No RBAC
- Designed for single operator
- Anyone with gateway token has full control
- No user accounts, roles, or permissions
- Shared token = shared full access

### 3. Plugin Isolation Weak
- Plugins run in same Node.js process
- No VM, container, or worker isolation
- Malicious plugin can access full `src/` and filesystem
- Native deps (C++ addons) can crash process

### 4. Token Storage
- Gateway token in environment variable or config file
- No automatic rotation
- No expiry (unless manually changed)
- Logged partially but still recoverable

### 5. SSRF Risk in Tools
- Agent can request arbitrary URLs
- `src/security/ssrf.ts` provides filtering
- But tool execution may bypass (VPN, local network)
- Agent prompt injection could enable SSRF

## MEDIUM SEVERITY

### 6. No Audit Logging
- No immutable audit log
- Config changes not logged with operator identity
- Token usage not logged per-request
- Difficult to detect compromise

### 7. Password Weakness
- Optional password auth (secondary)
- No password complexity requirements
- No MFA / 2FA support

### 8. Media Token Exposure
- Media access tokens are time-limited but reusable
- URL pattern guessable (`/managed-image-attachments/<token>`)
- No one-time use tokens
- Token in URL = may leak in logs/referrers

### 9. Sandbox Escape
- File sandbox limited by path rules
- Backend sandbox (Docker/SSH) stronger but optional
- Default: no Docker sandbox (file bridge only)
- Path traversal possible if validation bugs exist

### 10. Secret in Environment
- API keys in environment variables
- Visible to all processes on host
- Docker: visible via `docker inspect`
- No secret management integration (Vault, etc.)

## LOW SEVERITY

### 11. No Rate Limiting on All Endpoints
- Auth has rate limiting
- But some internal endpoints may not
- Resource exhaustion possible (large file upload, LLM calls)

### 12. CORS Configuration
- CORS enabled for local development
- May be permissive in some configurations
- Check production CORS policy

### 13. Information Disclosure
- Error messages may leak stack traces (debug mode)
- Version exposed in headers
- Health endpoint reveals subsystem status

### 14. Dependency Vulnerabilities
- Large dependency tree
- Weekly updates via Dependabot
- But zero-day window exists

## MITIGATIONS PRESENT

| Control | Implementation |
|---------|---------------|
| Constant-time token comparison | `src/gateway/auth.ts` |
| Rate limiting on auth | `src/gateway/rate-limit.ts` |
| SSRF filtering | `src/security/ssrf.ts` |
| Weak secret detection | Startup warning |
| File sandbox | `src/agents/sandbox/fs-bridge.ts` |
| Optional Docker sandbox | `src/agents/sandbox/backend.ts` |
| Content Security Policy | UI headers (verify) |
| Secret detection | `detect-secrets` pre-commit |

## ATTACK SCENARIOS

### Scenario 1: Token Theft
1. Attacker gains access to gateway machine
2. Reads `OPENCLAW_GATEWAY_TOKEN` from env/config
3. Has full control of OpenClaw instance
4. Can read all messages, send messages, change config

### Scenario 2: Malicious Plugin
1. User installs untrusted extension
2. Extension runs in gateway process
3. Extension reads all session data
4. Exfiltrates data to remote server

### Scenario 3: Prompt Injection
1. Attacker sends crafted message to channel
2. Agent processes message with hidden instructions
3. Agent executes unintended tool calls
4. SSRF or file exfiltration possible

### Scenario 4: Docker Escape (if using sandbox)
1. Compromise Docker sandbox container
2. If gateway has Docker socket mounted
3. Escape to host via Docker API
4. Full host compromise

## RECOMMENDATIONS

1. **Enable filesystem encryption** for `~/.openclaw`
2. **Use strong gateway token** (64+ random chars)
3. **Limit plugin installation** to trusted sources
4. **Enable Docker sandbox** for untrusted tools
5. **Regular token rotation** (manual, no automation)
6. **Run in isolated VM/container** with limited network
7. **Monitor logs** for anomalous activity
8. **Use Tailscale** for network isolation where possible
9. **Review agent tool permissions** per agent
10. **Keep dependencies updated** via Dependabot

## Evidence
- `src/gateway/auth.ts` — auth implementation
- `src/security/ssrf.ts` — SSRF protection
- `src/agents/sandbox/` — sandbox implementation
- `.env.example` — env var documentation
- Architecture review of plugin system

## Notes
- OpenClaw is designed as a personal assistant, not a multi-user service
- Security model assumes operator is trusted
- Most risks acceptable for personal use on private network
- Not suitable for untrusted multi-user deployment without significant hardening
