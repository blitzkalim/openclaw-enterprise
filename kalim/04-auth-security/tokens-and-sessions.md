# Tokens, Sessions & Secrets

## Gateway Token Generation

### Auto-Generation

From `src/gateway/auth-resolve.ts` and `src/gateway/server.impl.ts`:

```typescript
if (auth.mode === "token" && !auth.token) {
  if (auth.allowTailscale) {
    return; // Tailscale can work without token
  }
  // Generate token and save to config
  // OR generate runtime-only token (no persistence)
}
```

On first startup with no token configured:
1. If not in container/minimal mode: generate random token, write to `openclaw.json`
2. If in minimal/test mode: generate runtime-only token (not persisted)
3. If `allowTailscale` is true: may skip token generation

### Token Format

- 256-bit random (32 bytes = 64 hex chars) or URL-safe base64
- Printed to stdout on first generation for user to copy
- Stored in config as `gateway.auth.token`

### Token Validation

From `src/gateway/auth.ts`:

```typescript
function hasExplicitSharedSecretAuth(auth: GatewayAuthConfig) {
  return auth.mode === "token" || auth.mode === "password";
}
```

- `token` mode requires `auth.token` to be non-empty
- Refuses to start if token matches documented example placeholders
- Supports `OPENCLAW_GATEWAY_TOKEN` env var or `gateway.auth.token` config key

## Session System

### Session Key Resolution

From `src/config/sessions.ts` and `src/sessions/`:

```typescript
resolveSessionKey({ channelId, senderId, threadId, ... })
```

- Default: composite of channel + sender identifiers
- Configurable session binding strategy per channel
- Thread-aware for threaded channels (Slack, Telegram groups, etc.)

### Session Store

From `src/sessions/session-store.ts`:

- File-based JSON store (default: `~/.openclaw/sessions/`)
- In-memory cache with write-through to disk
- Stores: conversation history, agent state, pending tool calls
- Per-session file: `{sessionKey}.json`

### Session Binding

From `src/sessions/session-binding.ts`:

- Binds incoming messages to existing sessions
- Handles session migration (user ID changes, thread splits)
- Supports ephemeral sessions (no persistence)

## Secrets Runtime

### Secrets Snapshot

From `src/secrets/runtime.ts`:

```typescript
activateSecretsSnapshot(config) → SecretsSnapshot
```

- Reads all secret placeholders from config (e.g., `{env:OPENAI_API_KEY}`)
- Resolves against env vars and secret providers
- Produces immutable snapshot for runtime use
- Prevents repeated env lookups during hot path

### Secret Resolution

From `src/secrets/resolution.ts`:

```typescript
resolveSecretValue(spec: SecretSpec) → string | undefined
```

- Supports `{env:VAR_NAME}` syntax
- Supports `{file:/path/to/secret}` syntax
- Supports secret provider plugins (vault, 1Password, etc.)
- Caches resolved values

### Gateway Auth Secrets

From `src/secrets/runtime-gateway-auth-surfaces.ts`:

- Dedicated secrets resolver for auth surfaces
- Resolves `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PASSWORD`
- Supports rotation without restart (via config reload)

## Read-Only Auth Store

From `src/entry.ts`:

```typescript
function shouldForceReadOnlyAuthStore() {
  return process.env.OPENCLAW_AUTH_STORE_READONLY === "true";
}
```

- When true: auth secrets are read-only, never written to config
- Used for security audits and locked-down deployments
- Prevents token generation from modifying config

## Secret Comparison Security

From `src/security/secret-equal.ts`:

```typescript
safeEqualSecret(a: string, b: string): boolean
```

- Timing-safe comparison using Node.js `crypto.timingSafeEqual`
- Prevents timing side-channel attacks on token validation
- Used in all auth path comparisons

## No RBAC Detected

After comprehensive search:
- **No role-based access control** in gateway auth
- **No user roles** (admin, user, guest)
- **No permissions / ACLs**
- **No multi-tenant isolation**
- Auth is binary: authenticated vs anonymous
- Some channels may have per-channel admin commands (Telegram `/setrole`, etc.)
- Gateway itself has no RBAC — all authenticated clients have equal access

## Multi-Tenant Readiness: LOW

Findings:
- No `tenant_id`, `org_id`, `workspace_id`, `team_id` fields in config or runtime
- Session keys are flat (no tenant namespace)
- Gateway auth is single-tenant by design
- No resource-level access control
- Extension-owned tenant features may exist (Slack workspace, Discord guild) but not enforced by core

---

*Evidence: `src/gateway/auth.ts`, `src/gateway/auth-resolve.ts`, `src/secrets/runtime.ts`, `src/secrets/resolution.ts`, `src/sessions/session-store.ts`, `src/sessions/session-binding.ts`, `src/security/secret-equal.ts`, `src/entry.ts`.*
