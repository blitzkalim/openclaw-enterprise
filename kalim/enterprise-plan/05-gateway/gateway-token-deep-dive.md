# Gateway Token Deep Dive

## Purpose
Specifically trace `OPENCLAW_GATEWAY_TOKEN` and `gateway.auth.token` through the entire system.

## Findings

### Where Loaded

1. **Environment Variable**
   - Variable: `OPENCLAW_GATEWAY_TOKEN`
   - Read at: `src/gateway/credentials.ts` → `hasGatewayTokenEnvCandidate()`
   - Also read at: `src/gateway/startup-auth.ts` → `hasGatewayTokenCandidate()`
   - Also read at: `src/gateway/credential-planner.ts` → `createGatewayCredentialPlan()`

2. **Config File**
   - Path: `gateway.auth.token` in `~/.openclaw/openclaw.json`
   - Can be plain string or secret reference: `{"token": "secret://my-token"}`
   - Secret references resolved by `src/secrets/runtime.ts`

3. **CLI Override**
   - Flag: `--token <value>` (gateway command)
   - Applied via `authOverride` parameter in startup-auth

### Where Stored

1. **Config File** (default persistence)
   - `~/.openclaw/openclaw.json`
   - Only if `persist: true` and not an override mode
   - `src/gateway/startup-auth.ts` → `shouldPersistGeneratedToken()`

2. **Environment Variable**
   - `.env` or `~/.openclaw/.env`
   - Process environment
   - Not persisted by OpenClaw — user-managed

3. **Secret Reference**
   - `secret://` or `file://` URI
   - Resolved at runtime by `src/secrets/runtime.ts`
   - Actual secret stored externally (file, env var, etc.)

### Where Validated

1. **Startup Validation**
   - `src/gateway/startup-auth.ts` → `ensureGatewayStartupAuth()`
   - Checks token strength against `src/gateway/known-weak-gateway-secrets.ts`
   - Auto-generates if no token configured and binding beyond loopback

2. **Request Validation**
   - `src/gateway/auth.ts` → `authorizeHttpGatewayConnect()`
   - `src/gateway/auth.ts` → `authorizeWsGatewayConnect()`
   - Compares submitted token with `safeEqualSecret()` (constant-time)
   - Returns `GatewayAuthResult` with method `"token"`

3. **Credential Planning**
   - `src/gateway/credential-planner.ts` → `createGatewayCredentialPlan()`
   - Determines precedence: env-first vs config-first
   - Handles remote vs local credential resolution

### Which Requests Require It

1. **Gateway RPC Calls** (`/gateway/call`)
2. **OpenAI API Endpoints** (`/v1/chat/completions`, `/v1/models`)
3. **Session History** (`/sessions/history/*`)
4. **Tool Invocation** (`/tools/invoke/*`)
5. **Canvas / A2UI Access**
6. **Config Mutations**
7. **WebSocket Control Connections**

### Call Chain

```
CLI: openclaw gateway --token mytoken
  → src/commands/gateway.ts
    → src/cli/gateway-cli/run.ts
      → src/gateway/server.impl.ts
        → prepareGatewayStartupConfig()
          → ensureGatewayStartupAuth()
            → resolveGatewayTokenSecretRefValue()
              → resolveGatewayCredentialsFromValues()
                → hasGatewayTokenEnvCandidate() / hasConfiguredGatewayAuthSecretInput()
                  → resolveGatewayAuthFromConfig()
                    → resolveGatewayAuth()
                      → GatewayAuthResult { mode: "token" }

HTTP Request: GET /v1/models
  → src/gateway/server-http.ts
    → authorizeHttpGatewayConnect()
      → getConnectAuthFromRequest() (extract Bearer token)
      → safeEqualSecret(submittedToken, configuredToken)
      → GatewayAuthResult { ok: true, method: "token" }
```

### Weak Secret Detection

- File: `src/gateway/known-weak-gateway-secrets.ts`
- Blocks: `changeme`, `password`, `123456`, documented example values, etc.
- Called during startup: `assertGatewayAuthNotKnownWeak()`

### Rate Limiting on Failed Tokens

- File: `src/gateway/auth-rate-limit.ts`
- Scope: `AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET`
- Tracks failed attempts per client IP
- Exponential backoff on repeated failures

## Evidence
- `src/gateway/startup-auth.ts` — token resolution at startup
- `src/gateway/credentials.ts` — credential values
- `src/gateway/credential-planner.ts` — credential precedence
- `src/gateway/auth.ts` — token validation
- `src/gateway/auth-config-utils.ts` — config-level token resolution
- `src/gateway/known-weak-gateway-secrets.ts` — weak token detection
- `src/gateway/auth-rate-limit.ts` — rate limiting
- `src/secrets/runtime.ts` — secret reference resolution

## Notes
- Token is **not hashed** — stored and compared as plaintext
- No automatic rotation or expiry
- Auto-generated tokens are 64-character hex strings
- Token can be overridden per-invocation via CLI without persisting
