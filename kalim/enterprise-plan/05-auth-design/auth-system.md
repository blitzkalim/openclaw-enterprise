# Auth System Design

## Overview

Replace OpenClaw's single `OPENCLAW_GATEWAY_TOKEN` with a full identity and access system. Keep backward compatibility via fallback mode.

## Human Auth

### Registration Flow

```
User opens signup page
  -> POST /auth/register
    -> validate email uniqueness (per tenant)
      -> hash password (Argon2id)
        -> create user record
          -> send verification email
            -> user clicks link
              -> mark email verified
                -> issue JWT pair
```

### Login Flow

```
POST /auth/login
  -> find user by email + tenant_id
    -> compare password (Argon2id)
      -> check MFA (if enabled)
        -> issue access_token (15 min) + refresh_token (7 days)
          -> store refresh token hash in Redis
            -> return JWT to client
```

### Password Reset

```
POST /auth/forgot-password
  -> generate reset token (UUID, 1 hour expiry)
    -> store in Redis: `reset:{token}` -> user_id
      -> send email with link
        -> user submits new password
          -> verify token from Redis
            -> update password hash
              -> invalidate all sessions
```

### OAuth (Google)

```
GET /auth/oauth/google
  -> redirect to Google consent
    -> callback /auth/oauth/google/callback
      -> exchange code for Google profile
        -> find or create user by email
          -> issue JWT pair
```

### MFA (TOTP)

```
POST /auth/mfa/enable
  -> generate TOTP secret
    -> show QR code to user
      -> user verifies with first code
        -> encrypt secret, store in users.mfa_secret

POST /auth/login
  -> after password valid
    -> if mfa_enabled
      -> require totp_code
        -> verify against stored secret
          -> issue JWT
```

## Machine Auth

### API Keys

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    key_hash VARCHAR(255) NOT NULL,  -- hash of key
    key_prefix VARCHAR(8),  -- first 8 chars for display
    permissions TEXT[] DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Usage: `Authorization: Bearer ocak_{key}`

### Internal Service JWT

Gateway validates JWT locally using Auth Service public key (RS256). No network call per request.

```
Gateway startup
  -> fetch JWKS from Auth Service (cached)
    -> on each request
      -> verify JWT signature locally
        -> extract claims: tenant_id, user_id, roles[], permissions[]
          -> attach to request context
```

### Channel Webhook Secrets

Each channel connection gets a webhook secret for verifying inbound webhooks:

```
Telegram webhook
  -> verify signature using bot token hash (Telegram specific)

WhatsApp provider webhook
  -> verify X-Webhook-Secret header against stored secret

Generic webhook
  -> verify HMAC-SHA256 of payload using stored secret
```

## Session Security

### Access Token

- Type: JWT
- Algorithm: RS256
- Expiry: 15 minutes
- Claims: `sub` (user_id), `tid` (tenant_id), `roles[]`, `perms[]`, `iat`, `exp`

### Refresh Token

- Type: opaque string (UUID)
- Storage: Redis with TTL = 7 days
- Rotation: new refresh token issued on each use
- Binding: hashed to device fingerprint

### Token Rotation

```
Client: POST /auth/refresh
  -> verify refresh_token exists in Redis
    -> check device fingerprint matches
      -> delete old refresh token
        -> issue new access_token + refresh_token pair
          -> store new refresh token in Redis
```

### Revocation

```
User logout
  -> delete refresh token from Redis
    -> add access token jti to Redis blacklist (TTL = access token expiry)

Admin revokes session
  -> delete all refresh tokens for user
    -> blacklist all active access tokens

Tenant suspension
  -> blacklist all tokens for tenant
```

## JWT Claims Structure

```json
{
  "sub": "user-uuid",
  "tid": "tenant-uuid",
  "email": "user@example.com",
  "name": "Amit Sharma",
  "roles": ["tenant_admin", "manager"],
  "perms": ["leads.read", "leads.write", "agents.read"],
  "iss": "openclaw-auth",
  "aud": "openclaw-gateway",
  "iat": 1715000000,
  "exp": 1715000900,
  "jti": "unique-token-id"
}
```

## Auth Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Create account |
| `/auth/login` | POST | Email + password login |
| `/auth/refresh` | POST | Rotate token pair |
| `/auth/logout` | POST | Revoke session |
| `/auth/forgot-password` | POST | Initiate reset |
| `/auth/reset-password` | POST | Complete reset |
| `/auth/oauth/:provider` | GET | OAuth redirect |
| `/auth/oauth/:provider/callback` | GET | OAuth callback |
| `/auth/mfa/enable` | POST | Enable TOTP |
| `/auth/mfa/verify` | POST | Verify TOTP code |
| `/auth/api-keys` | GET/POST | Manage API keys |
| `/auth/.well-known/jwks.json` | GET | Public keys for JWT verification |

## Backward Compatibility

```typescript
// In src/enterprise/auth-adapter.ts
function resolveAuth(req: Request): AuthContext {
  // Try JWT first
  const jwt = extractBearerToken(req);
  if (jwt) {
    return verifyJwt(jwt);
  }

  // Fallback to OPENCLAW_GATEWAY_TOKEN (single-user mode)
  const legacyToken = req.headers['x-openclaw-token'];
  if (legacyToken && safeEqual(legacyToken, process.env.OPENCLAW_GATEWAY_TOKEN)) {
    return { mode: 'legacy', tenant_id: 'default', user_id: 'admin', roles: ['owner'] };
  }

  throw new UnauthorizedError();
}
```
