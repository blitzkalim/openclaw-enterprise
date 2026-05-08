# Tokens and Sessions

## Purpose
Find and document all bearer tokens, JWT, API keys, sessions, cookies, and internal service auth.

## Findings

### Gateway Token (Primary Bearer Token)
- **Location**: `OPENCLAW_GATEWAY_TOKEN` env var, `gateway.auth.token` config
- **Resolution**: `src/gateway/credentials.ts` → `resolveGatewayCredentialsFromValues()`
- **Validation**: `src/gateway/auth.ts` → `authorizeHttpGatewayConnect()`
- **Precedence**: env-first (env overrides config by default)
- **Format**: Free-form string; auto-generated as hex if absent
- **Storage**: Plain text in config file or env var (not encrypted at rest)
- **Transmission**: HTTP `Authorization: Bearer <token>` header or WebSocket `token` query param

### Gateway Password
- **Location**: `OPENCLAW_GATEWAY_PASSWORD` env var, `gateway.auth.password` config
- **Validation**: Same path as token, checked in `authorizeHttpGatewayConnect()`
- **Transmission**: HTTP `Authorization: Basic` or `password` query param

### Device Tokens
- **Location**: `src/infra/device-pairing.ts`
- **Purpose**: Authenticate paired iOS/Android/macOS nodes
- **Lifecycle**: Generated during pairing, rotated on demand
- **Storage**: JSON store in `~/.openclaw/pairing/`

### Bootstrap Tokens
- **Location**: `src/gateway/startup-auth.ts`, `src/wizard/`
- **Purpose**: One-time setup tokens
- **Lifecycle**: Generated during onboarding, consumed on first use

### Channel Bot Tokens
- **Telegram**: `TELEGRAM_BOT_TOKEN` — BotFather-issued token
- **Discord**: `DISCORD_BOT_TOKEN` — Discord Developer Portal token
- **Slack**: `SLACK_BOT_TOKEN` (xoxb-) + `SLACK_APP_TOKEN` (xapp-)
- **WhatsApp**: No token — uses Baileys QR-pairing (phone-based auth)
- **Signal**: No token — uses Signal CLI native device pairing
- **Matrix**: Access token from homeserver

### Model Provider API Keys
- Stored in env vars or config `env.vars`
- Rotation supported via `auth-profiles` system
- Multiple keys per provider with fallback on rate-limit / failure
- Keys resolved at runtime per-request based on provider selection

### Sessions (Agent Conversation State)
- **Not auth sessions** — these are conversation thread identifiers
- **Location**: `src/sessions/session-store.ts`, `src/config/sessions.ts`
- **Format**: Session keys like `main`, `telegram:+1234567890`, `discord:user#1234`
- **Storage**: JSON files under `~/.openclaw/sessions/`
- **Binding**: Sessions bound to channels + account + agent ID

### Cookies
- **No traditional cookie-based session auth found**
- Browser-based Control UI uses token-based auth via query param or header
- `src/gateway/server.auth.control-ui.suite.ts` tests control UI auth

### Internal Service Auth
- No internal microservices — single process
- Plugin runtime uses in-process function calls
- Sandbox backend (Docker/SSH) uses OS-level auth, not application tokens

### Claude/Web Session Keys
- `CLAUDE_AI_SESSION_KEY`, `CLAUDE_WEB_SESSION_KEY`, `CLAUDE_WEB_COOKIE`
- Used for Claude AI integration (external service auth)
- Passed through to external APIs

## Evidence
- `src/gateway/auth.ts` — token/password validation logic
- `src/gateway/credentials.ts` — credential precedence and resolution
- `src/gateway/auth-config-utils.ts` — auth config utilities
- `src/infra/device-pairing.ts` — device token lifecycle
- `src/agents/auth-profiles/` — provider key rotation
- `.env.example` — canonical env var listing

## Notes
- No JWT usage detected — all tokens are opaque strings
- No OAuth2 / OpenID Connect for gateway auth (only for external service integration)
- Token rotation is manual (no automatic expiry/refresh)
- Secret references (`secret://`, `file://`) allow indirect token storage
