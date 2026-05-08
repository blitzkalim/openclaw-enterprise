# 03 — Auth Design

## Goal

Preserve all three credential paths from the simple plan (cookie session, API token, legacy gateway token) while making auth **stateless across Gateway Pod replicas** using JWT.

---

## Three Credentials (Preserved from Simple Plan)

| Credential | Used by | Carried as | Resolves to |
|---|---|---|---|
| **JWT cookie session** | Humans in browser (`/login`, `/team`) | `Cookie: oc_session=<JWT>` | `userId`, `workspaceId`, `isAdmin` |
| **API token** | Webhooks, scripts, CLI | `Authorization: Bearer ocp_<token>` | Same shape |
| **Legacy gateway token** | Existing OpenClaw control UI | `Authorization: Bearer <gateway-token>` | `userId='admin'`, `isAdmin=true` (synthetic) |

---

## JWT Design (Replaces SQLite Sessions)

### Why JWT Now

The simple plan uses SQLite-backed cookie sessions — one process, one file, instant lookup. With multiple Gateway Pod replicas, that breaks:

| Simple plan | Problem in K8s | Solution |
|---|---|---|
| Session stored in `team.sqlite` | Each Pod has its own disk; no shared session table | JWT: self-contained, verified locally |
| Session lookup is `db.get()` | Would need sticky sessions or shared DB for every request | JWT verified by JWKS — no DB call per request |
| Instant revocation via `DELETE` | JWT is stateless; can't delete a token | Redis revocation list (short TTL check) |

### JWT Structure

```json
{
  "header": {
    "alg": "RS256",
    "kid": "openclaw-team-2026-01"
  },
  "payload": {
    "sub": "u_a3f9b2...",            // userId
    "email": "amit@agency.com",
    "name": "Amit",
    "wid": "w_91...",                // workspaceId (null if default)
    "adm": true,                     // isAdmin
    "iat": 1714500000,
    "exp": 1717092000,               // 30 days
    "jti": "sess_7k2x9q"            // unique session id for revocation
  }
}
```

### Key Management

- **Private key**: stored as K8s Secret `openclaw-jwt-private-key`. Mounted only in Gateway Pod.
- **Public key**: exposed via JWKS endpoint `GET /.well-known/jwks.json` on the Gateway Pod. Agent workers fetch and cache this at startup.
- **Key rotation**: new key pair generated every 90 days. Old key stays in JWKS for 30 days after rotation (grace period for unexpired tokens).

### JWKS Endpoint

```json
GET /.well-known/jwks.json

{
  "keys": [
    {
      "kty": "RSA",
      "kid": "openclaw-team-2026-01",
      "use": "sig",
      "alg": "RS256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

Agent Worker Pods cache this response in Redis with 5-minute TTL. Validation is local — no network call per request after cache is warm.

---

## Login Flow (Gateway Pod)

```
POST /auth/login
  body: { email, password }

Gateway Pod:
  1. SELECT * FROM users WHERE email = ? AND status = 'active'   (Postgres)
  2. argon2.verify(password, password_hash)                      (CPU-bound)
  3. Generate JWT with RS256 private key
  4. Store session metadata in Redis:
       SET session:<jti> { userId, createdAt, lastUsedAt } EX 2592000   (30 days)
  5. Store session row in Postgres (for admin visibility):
       INSERT INTO user_sessions (id, user_id, created_at, expires_at, ip, user_agent)
  6. Set-Cookie: oc_session=<JWT>; HttpOnly; SameSite=Lax; Secure; Path=/

Response: { user: { id, email, name, isAdmin, workspaceId } }
```

### Why Both Redis AND Postgres for Sessions?

| Store | Purpose | Accessed when |
|---|---|---|
| Redis `session:<jti>` | Fast existence check for revocation | Every request (O(1) GET) |
| Postgres `user_sessions` | Admin audit: "who is logged in?", manual revocation from `/team` | Admin page load, logout, cleanup cron |

---

## Request Validation (Every Request)

```
Incoming request
  │
  ├── Cookie: oc_session=<JWT>
  │     → Decode JWT (RS256, verify signature with JWKS public key)
  │     → Check exp > now
  │     → Check Redis: EXISTS session:<jti>  (if missing → revoked → 401)
  │     → Attach req.team = { userId, workspaceId, isAdmin, source: 'cookie' }
  │
  ├── Authorization: Bearer ocp_<token>
  │     → sha256(token)
  │     → SELECT user_id FROM api_tokens WHERE hash = ?  (Postgres, cached in Redis 60s)
  │     → Attach req.team = { userId, workspaceId, isAdmin, source: 'api-token' }
  │
  ├── Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
  │     → crypto.timingSafeEqual(token, env.OPENCLAW_GATEWAY_TOKEN)
  │     → Attach req.team = { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }
  │
  └── None matched → 401
```

### API Token Caching

API tokens are looked up by hash in Postgres. To avoid a DB query per request, the result is cached in Redis:

```
SET api_token:<sha256_hash> { userId, workspaceId, isAdmin } EX 60
```

Cache invalidated on token deletion (`DELETE /team/tokens/:id`).

---

## Session Revocation

| Action | What happens |
|---|---|
| User clicks "Logout" | `DEL session:<jti>` in Redis + `DELETE FROM user_sessions WHERE id = ?` in Postgres |
| Admin disables a user | All sessions for that user: `DEL session:<jti>` for each + `DELETE FROM user_sessions WHERE user_id = ?` |
| Token expiry (30 days) | JWT `exp` claim fails validation; Redis key auto-expires via TTL |

**Revocation latency:** Instant. Redis `DEL` is O(1). The next request with that JWT finds `session:<jti>` missing and gets a 401.

---

## Password Storage

- **Argon2id** via `argon2` npm package (same as simple plan)
- Cost factors: library defaults (time=3, memory=65536, parallelism=4)
- Password reset: admin CLI generates a one-time token; user opens `/auth/reset?token=…`

---

## Rate Limiting (Redis-Backed)

The simple plan uses in-memory rate limits (one process). With multiple Gateway replicas, rate limits must be shared.

| Surface | Limit | Redis key pattern | Algorithm |
|---|---|---|---|
| `/auth/login` | 5 attempts / 15 min per IP+email | `rl:login:{ip}:{email}` | Sliding window counter |
| `/webhooks/*` | 50 req/sec burst, 10 req/sec sustained per IP | `rl:webhook:{ip}` | Token bucket |
| Inbound message → agent | 1 msg every 2s per external_id | `rl:msg:{externalId}` | Simple cooldown (SET NX EX 2) |

---

## CSRF Protection

- JWT cookie is `SameSite=Lax` — blocks cross-origin POST from third-party sites
- Write endpoints (`POST`, `DELETE` on `/team/*`) require a CSRF token in the form body
- CSRF token is a signed hash of the session's `jti` — no extra DB state

---

## Security Properties Comparison

| Property | Simple Plan | Final Plan |
|---|---|---|
| Password hashing | ✅ Argon2id | ✅ Argon2id |
| Session revocation | ✅ Instant (SQLite DELETE) | ✅ Instant (Redis DEL) |
| CSRF | ✅ SameSite=Lax + CSRF token | ✅ Same |
| Cross-replica auth | ❌ N/A (one process) | ✅ JWT + JWKS (stateless validation) |
| Stolen cookie | ⚠️ Server-side revoke | ✅ Server-side revoke + shorter JWT TTL option |
| Key rotation | ❌ N/A | ✅ 90-day key rotation with grace period |
| MFA | ❌ Out of scope | ❌ Out of scope |
| OAuth/SSO | ❌ Out of scope | ❌ Out of scope |

---

## Env Vars (Auth-Related)

| Var | Purpose | Where used |
|---|---|---|
| `OPENCLAW_JWT_PRIVATE_KEY` | RS256 private key (PEM) | Gateway Pod (K8s Secret) |
| `OPENCLAW_JWT_PUBLIC_KEY` | RS256 public key (PEM) | Gateway Pod (JWKS endpoint) + Agent Worker (cache) |
| `OPENCLAW_GATEWAY_TOKEN` | Legacy bearer token | Gateway Pod |
| `OPENCLAW_COOKIE_SECRET` | CSRF token signing | Gateway Pod |
| `OPENCLAW_TEAM_ADMIN_EMAIL` | Bootstrap admin | Gateway Pod (first run) |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` | Bootstrap admin | Gateway Pod (first run) |
