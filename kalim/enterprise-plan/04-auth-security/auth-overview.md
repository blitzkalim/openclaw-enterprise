# Auth Overview

## Purpose
Catalog all authentication methods found in the codebase.

## Findings

### Gateway Authentication Methods

1. **Token Auth** (`token`)
   - `OPENCLAW_GATEWAY_TOKEN` env var or `gateway.auth.token` in config
   - Auto-generated on first startup if not provided
   - 64-char hex string recommended (`openssl rand -hex 32`)
   - Compared with constant-time equality (`safeEqualSecret`)

2. **Password Auth** (`password`)
   - `OPENCLAW_GATEWAY_PASSWORD` env var or `gateway.auth.password` in config
   - Alternative to token auth
   - Cannot use both token and password simultaneously without explicit mode

3. **Tailscale Auth** (`tailscale`)
   - Uses `tailscale whois` for identity verification
   - Requires `x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-host` headers
   - Only works from loopback with Tailscale proxy headers
   - User identity: `tailscale-user-login`, `tailscale-user-name` headers

4. **Trusted Proxy Auth** (`trusted-proxy`)
   - IP-based authentication from configured trusted proxy CIDRs
   - `gateway.auth.trustedProxy` config key
   - Browser origin policy can be enforced

5. **Device Token Auth** (`device-token`)
   - Used by paired devices (iOS/Android/macOS nodes)
   - Tokens managed via device pairing system
   - `src/infra/device-pairing.ts`

6. **Bootstrap Token Auth** (`bootstrap-token`)
   - One-time tokens for initial setup / onboarding
   - Auto-generated during wizard

7. **No Auth** (`none`)
   - Loopback-only mode (`localhost`, `127.0.0.1`, `::1`)
   - Only for local development
   - Gateway refuses `none` mode when binding beyond loopback

### Channel Authentication
- Each channel has its own auth model (bot tokens, OAuth, etc.)
- Channel tokens stored in config or env vars
- No unified channel auth — each extension manages its own credentials

### Model Provider Authentication
- API keys stored in env vars or config `env.vars`
- Auth profiles support multiple keys with rotation/fallback: `src/agents/auth-profiles/`
- Provider-specific key resolution: `src/agents/provider-auth-aliases.ts`

### CLI Authentication
- CLI commands that talk to a running gateway use `OPENCLAW_GATEWAY_TOKEN`
- `src/gateway/client.ts` — gateway client with token header
- `src/cli/run-main.ts` — CLI entry with auth resolution

## Evidence
- `src/gateway/auth.ts` — auth decision tree
- `src/gateway/startup-auth.ts` — startup auth resolution
- `src/gateway/credentials.ts` — credential planning
- `src/gateway/auth-resolve.ts` — auth mode resolution
- `src/agents/auth-profiles/` — provider key management

## Notes
- Default auth mode: auto-detect based on available credentials
- Rate limiting applies to failed auth attempts per IP
- Weak secret detection prevents known example/placeholder tokens
- Token and password cannot both be active without explicit `mode` config
