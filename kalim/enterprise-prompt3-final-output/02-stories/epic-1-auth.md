# EPIC 1 — Authentication & Identity Layer

---

## 🧾 AUTH-1: Build Shared JWT Utilities (sign, verify, JWKS generation)

### 🎯 Description

Create the foundational JWT library used by both the Gateway Pod (to sign tokens) and the Agent Worker Pod (to verify tokens via JWKS). Uses RS256 asymmetric signing so the private key never leaves the Gateway Pod.

This comes from `03-auth-design/README.md` — the JWT structure, key management, and JWKS endpoint are the core of cross-replica stateless auth.

### ⚙️ Implementation Details

**Files to create:**
- `services/shared/src/crypto/jwt.ts`
- `services/shared/src/crypto/password.ts`
- `services/shared/src/redis/session-store.ts`

**JWT payload shape:**
```ts
{
  sub: string;        // userId
  email: string;
  name: string;
  wid: string | null; // workspaceId
  adm: boolean;       // isAdmin
  iat: number;
  exp: number;        // 30 days
  jti: string;        // unique session id (for Redis revocation)
}
```

**Key management:**
- Private key: `OPENCLAW_JWT_PRIVATE_KEY` env var (PEM string)
- Public key: `OPENCLAW_JWT_PUBLIC_KEY` env var (PEM string)
- Key ID (`kid`): `openclaw-team-<YYYY-MM>` (used in JWKS for rotation)

**Logic flow:**
```
signJwt(payload, privateKey) → JWT string (RS256)
verifyJwt(token, publicKey) → decoded payload | throws
generateJwks(publicKey, kid) → { keys: [...] }
```

**Dependencies:** `jose` npm package (or `jsonwebtoken` + `node-rsa`)

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

You are working inside the OpenClaw enterprise codebase under services/shared/.

Task:
Create services/shared/src/crypto/jwt.ts

Requirements:
- Export function signJwt(payload: JwtPayload, privateKeyPem: string): string
  - Uses RS256 algorithm
  - Sets exp to 30 days from now
  - Sets jti to a random UUID
  - Sets iat to current time
- Export function verifyJwt(token: string, publicKeyPem: string): JwtPayload
  - Throws if expired
  - Throws if signature invalid
  - Returns decoded payload
- Export function generateJwks(publicKeyPem: string, kid: string): JwtKeySet
  - Returns JWKS-format JSON object with RSA public key in JWK format
- Export types: JwtPayload { sub, email, name, wid, adm, iat, exp, jti }
- Export type: JwtKeySet { keys: JwkKey[] }

Also create services/shared/src/crypto/password.ts:
- Export async function hashPassword(password: string): Promise<string>
  - Uses argon2id via 'argon2' npm package
  - Library defaults for cost (time=3, memory=65536, parallelism=4)
- Export async function verifyPassword(password: string, hash: string): Promise<boolean>
  - Returns true if match, false if not
  - Never throws on mismatch

Dependencies: 'jose' for JWT operations, 'argon2' for passwords, 'crypto' (built-in) for UUID generation

Constraints:
- Do not import from gateway or agent-worker packages
- All exports must be pure functions (no side effects, no singletons)
- TypeScript strict mode compatible
- No console.log — throw errors for failures

Output:
- Complete TypeScript files with correct imports
- Exported types in the same files
```

### 🧪 Testing Instructions

```
1. Create services/shared/src/__tests__/jwt.test.ts
2. Generate an RSA 2048-bit key pair with openssl or in test setup
3. Test signJwt → returns a non-empty string
4. Test verifyJwt with the signed token → returns correct payload fields
5. Test verifyJwt with an expired token (set exp=1) → throws
6. Test verifyJwt with a tampered token → throws
7. Test generateJwks → returns object with keys array containing kty='RSA'
8. Test hashPassword → returns string starting with '$argon2id$'
9. Test verifyPassword with correct password → true
10. Test verifyPassword with wrong password → false (not throws)
```

### 📥 Example Input

```ts
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const token = signJwt({ sub: 'u_123', email: 'a@b.com', name: 'Amit', wid: null, adm: false }, privatePem);
```

### 📤 Expected Output

```ts
// token: "eyJhbGciOiJSUzI1NiIs..."
// verifyJwt(token, publicPem): { sub: 'u_123', email: 'a@b.com', name: 'Amit', wid: null, adm: false, iat: ..., exp: ..., jti: '...' }
// generateJwks: { keys: [{ kty: 'RSA', alg: 'RS256', use: 'sig', kid: '...', n: '...', e: 'AQAB' }] }
```

### ✅ Acceptance Criteria

- [ ] `signJwt` produces a valid RS256 JWT
- [ ] `verifyJwt` accepts valid tokens and rejects expired/tampered ones
- [ ] `generateJwks` produces valid JWKS JSON that can be used by a JWKS validator
- [ ] `hashPassword` produces Argon2id hashes
- [ ] `verifyPassword` matches correct passwords, returns false for wrong ones (no throws)
- [ ] All TypeScript strict-mode clean
- [ ] Unit tests pass

---

## 🧾 AUTH-2: Implement Auth Middleware for Multi-User Resolution

### 🎯 Description

Implement the Express middleware that resolves user identity on every request to the Gateway Pod. It must support all three credential paths — JWT cookie, API token (`ocp_` prefix), and legacy gateway token — and attach a `TeamCtx` to `req.team`.

Source: `03-auth-design/README.md` — "Request Validation (Every Request)" section.

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/auth-middleware.ts`

**Logic flow:**
```
Incoming request
  ├── Cookie: oc_session=<JWT>
  │     → verifyJwt(token, PUBLIC_KEY)
  │     → Check exp > now
  │     → Redis GET session:{jti} → if missing → 401
  │     → req.team = { userId, workspaceId, isAdmin, source: 'cookie' }
  │
  ├── Authorization: Bearer ocp_<token>
  │     → sha256(raw token after 'ocp_')
  │     → Redis GET api_token:{hash} → cached user lookup
  │     → fallback: Postgres SELECT user_id FROM api_tokens WHERE hash = ?
  │     → Cache result in Redis: SET api_token:{hash} { userId } EX 60
  │     → req.team = { userId, workspaceId, isAdmin, source: 'api-token' }
  │
  ├── Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
  │     → crypto.timingSafeEqual(token, env.OPENCLAW_GATEWAY_TOKEN)
  │     → req.team = { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }
  │
  └── None matched → 401 JSON error
```

**Dependencies:** `services/shared/src/crypto/jwt.ts`, `services/shared/src/redis/session-store.ts`, `services/shared/src/db/queries.ts`

**TeamCtx type:**
```ts
interface TeamCtx {
  userId: string;
  workspaceId: string | null;
  isAdmin: boolean;
  source: 'cookie' | 'api-token' | 'legacy';
}
```

### 🤖 AI CODING PROMPT

```text
You are a senior Node.js/TypeScript engineer.

You are working inside services/gateway/src/ of the OpenClaw enterprise codebase.

Task:
Implement services/gateway/src/auth-middleware.ts — Express middleware that resolves user identity.

Requirements:
1. Export function authMiddleware(req, res, next):
   a. Try JWT cookie path:
      - Read cookie 'oc_session' from req.cookies
      - Call verifyJwt(token, process.env.OPENCLAW_JWT_PUBLIC_KEY!)
      - If valid: check Redis GET session:{payload.jti}
      - If Redis key missing: return res.status(401).json({ error: 'session revoked' })
      - If valid: attach req.team = { userId: payload.sub, workspaceId: payload.wid, isAdmin: payload.adm, source: 'cookie' }
      - Call next()
   b. Try API token path:
      - Read Authorization header, check starts with 'Bearer ocp_'
      - Extract raw token (after 'ocp_' prefix)
      - sha256 hash the raw token
      - Try Redis GET api_token:{hash}
      - If miss: query Postgres SELECT user_id, workspace_id, is_admin FROM api_tokens JOIN users ON ... WHERE api_tokens.hash = ?
      - If found: cache in Redis SET api_token:{hash} {...} EX 60; attach req.team; next()
      - If not found: return 401
   c. Try legacy gateway token path:
      - Read Authorization header value (after 'Bearer ')
      - crypto.timingSafeEqual(Buffer.from(token), Buffer.from(process.env.OPENCLAW_GATEWAY_TOKEN || ''))
      - If match: attach req.team = { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }; next()
   d. If none matched: return res.status(401).json({ error: 'unauthorized' })

2. Export function requireAdmin(req, res, next):
   - If req.team.isAdmin === false: return 403
   - else next()

Files to import from:
- ../../../services/shared/src/crypto/jwt (verifyJwt)
- ../../../services/shared/src/redis/client (getRedis)
- ../../../services/shared/src/db/queries (findApiTokenByHash)

Constraints:
- Use crypto.timingSafeEqual for ALL token comparisons (legacy + API)
- Never log token values — log only { userId, source } on success
- Do not throw — always return res.status(401) on auth failure
- TypeScript strict mode

Output:
- Complete auth-middleware.ts
- Extend Express Request type to include req.team?: TeamCtx
```

### 🧪 Testing Instructions

```
1. Start gateway with OPENCLAW_TEAM_MODE=1
2. Set up test: create user in Postgres, create Redis session entry
3. Test 1 — Valid JWT cookie:
   - Sign a JWT with the test private key
   - Insert session:{jti} into Redis
   - GET /auth/me with Cookie: oc_session=<token>
   - Expect 200 with user data
4. Test 2 — Revoked JWT:
   - Same token but DEL session:{jti} from Redis
   - GET /auth/me → expect 401 "session revoked"
5. Test 3 — Expired JWT:
   - Sign JWT with exp=1 (already expired)
   - GET /auth/me → expect 401
6. Test 4 — Valid API token:
   - Create api_token row in Postgres with known hash
   - GET /auth/me with Authorization: Bearer ocp_<raw_token>
   - Expect 200 with user data
7. Test 5 — Legacy gateway token:
   - Set OPENCLAW_GATEWAY_TOKEN=testtoken
   - GET /auth/me with Authorization: Bearer testtoken
   - Expect 200 with { userId: 'admin', isAdmin: true }
8. Test 6 — No credentials:
   - GET /auth/me with no headers/cookies
   - Expect 401
```

### 📥 Example Input

```http
GET /auth/me HTTP/1.1
Cookie: oc_session=eyJhbGciOiJSUzI1NiIsImtpZCI6...
```

### 📤 Expected Output

```json
{ "userId": "u_a3f9b2", "email": "amit@agency.com", "name": "Amit", "isAdmin": false, "workspaceId": null }
```

### ✅ Acceptance Criteria

- [ ] Valid JWT cookie resolves user correctly
- [ ] Revoked JWT (Redis key deleted) returns 401
- [ ] Expired JWT returns 401
- [ ] Valid `ocp_` API token resolves user
- [ ] API token cached in Redis after first lookup
- [ ] Legacy gateway token resolves to admin synthetic user
- [ ] No credentials → 401
- [ ] `requireAdmin` blocks non-admin users with 403
- [ ] All comparisons use `timingSafeEqual`

---

## 🧾 AUTH-3: Implement Login, Logout, and /me Routes

### 🎯 Description

Implement the auth HTTP routes on the Gateway Pod: `POST /auth/login` (Argon2id verify, JWT issue, Redis session, Postgres session row), `POST /auth/logout` (Redis + Postgres cleanup), `GET /auth/me` (return current user), and `GET /auth/reset` (password reset flow).

Source: `03-auth-design/README.md` — "Login Flow" and `02-service-contracts/README.md` — "Auth Routes" table.

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/auth-routes.ts`

**Login flow:**
```
POST /auth/login { email, password }
  1. SELECT * FROM users WHERE email = ? AND status = 'active'   [Postgres]
  2. argon2.verify(password, password_hash)                       [CPU]
  3. signJwt({ sub: user.id, email, name, wid, adm, jti: uuid }) [crypto]
  4. SET session:{jti} { userId, createdAt } EX 2592000          [Redis]
  5. INSERT INTO user_sessions (id=jti, user_id, ...)            [Postgres]
  6. Set-Cookie: oc_session=<JWT>; HttpOnly; SameSite=Lax; Secure
  Response: { user: { id, email, name, isAdmin, workspaceId } }
```

**Logout flow:**
```
POST /auth/logout  [requires JWT cookie]
  1. DEL session:{req.team.jti}                                  [Redis]
  2. DELETE FROM user_sessions WHERE id = ?                      [Postgres]
  3. Clear cookie
  Response: 204
```

**Rate limiting on login:** 5 attempts / 15 min per `{ip}:{email}` (via `rate-limiter.ts` — see CHAN-5)

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

You are working in services/gateway/src/ of the OpenClaw enterprise codebase.

Task:
Implement services/gateway/src/auth-routes.ts — Express Router with auth endpoints.

Requirements:

POST /auth/login:
  - Validate body: { email: string, password: string } (non-empty)
  - Apply login rate limit: 5 attempts/15min per IP+email (call loginRateLimiter(ip, email))
  - Query Postgres: const user = await findUserByEmail(email)
  - If not found or status !== 'active': return 401 { error: 'invalid credentials' }
    (same error for not-found and wrong password — prevent user enumeration)
  - Verify Argon2id: await verifyPassword(password, user.passwordHash)
  - If fail: increment rate limit counter; return 401 { error: 'invalid credentials' }
  - Generate jti: crypto.randomUUID()
  - Sign JWT: signJwt({ sub: user.id, email: user.email, name: user.name, wid: user.workspaceId, adm: user.isAdmin, jti }, privateKey)
  - Store in Redis: setSession(jti, { userId: user.id, createdAt: Date.now() }, 30*24*3600)
  - Insert Postgres row: await createSession({ id: jti, userId: user.id, expiresAt, ip, userAgent })
  - Set cookie: res.cookie('oc_session', token, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 30*24*3600*1000 })
  - Return 200: { user: { id: user.id, email, name, isAdmin: user.isAdmin, workspaceId: user.workspaceId } }

POST /auth/logout (requires authMiddleware):
  - Extract jti from the decoded JWT (attach to req.team.jti in auth middleware)
  - deleteSession(jti) in Redis
  - DELETE FROM user_sessions WHERE id = ? in Postgres
  - res.clearCookie('oc_session')
  - Return 204

GET /auth/me (requires authMiddleware):
  - Return 200: { userId: req.team.userId, email, name, isAdmin, workspaceId }
  - Fetch fresh user data from Postgres (to get current name/email, not stale JWT data)

Files to import from:
  - ./auth-middleware (authMiddleware)
  - ../../../shared/src/crypto/jwt (signJwt)
  - ../../../shared/src/crypto/password (verifyPassword)
  - ../../../shared/src/redis/session-store (setSession, deleteSession)
  - ../../../shared/src/db/queries (findUserByEmail, createSession, deleteSessionDb, findUserById)
  - ./rate-limiter (loginRateLimiter)

Constraints:
  - NEVER log passwords or tokens
  - Return identical 401 message for "user not found" and "wrong password"
  - TypeScript strict mode
  - Use process.env.OPENCLAW_JWT_PRIVATE_KEY for signing

Output: complete auth-routes.ts as an Express Router
```

### 🧪 Testing Instructions

```
1. docker compose up (Postgres + Redis + gateway)
2. Insert test user: INSERT INTO users (id, email, password_hash, name, is_admin) VALUES (...)
3. Test login success:
   POST /auth/login { "email": "amit@test.com", "password": "password123" }
   → 200, body has user object, Set-Cookie header present
4. Test login wrong password:
   POST /auth/login { "email": "amit@test.com", "password": "wrong" }
   → 401 "invalid credentials"
5. Test login disabled user (status='disabled'):
   → 401 "invalid credentials"
6. Test logout:
   POST /auth/logout with the cookie from step 3
   → 204, cookie cleared
7. Test /auth/me after logout:
   GET /auth/me with cleared cookie
   → 401
8. Test rate limit:
   POST /auth/login with wrong password 6 times
   → 6th attempt returns 429
```

### 📥 Example Input

```json
POST /auth/login
{ "email": "amit@agency.com", "password": "securePassword123" }
```

### 📤 Expected Output

```json
HTTP 200
Set-Cookie: oc_session=eyJhbGci...; HttpOnly; SameSite=Lax; Secure
{ "user": { "id": "u_a3f9b2", "email": "amit@agency.com", "name": "Amit", "isAdmin": false, "workspaceId": null } }
```

### ✅ Acceptance Criteria

- [ ] Successful login sets HttpOnly JWT cookie
- [ ] JWT payload contains `sub`, `email`, `name`, `wid`, `adm`, `jti`
- [ ] Redis `session:{jti}` key set with 30-day TTL
- [ ] Postgres `user_sessions` row inserted
- [ ] Wrong password returns 401 (not 404 — no user enumeration)
- [ ] Disabled user returns 401
- [ ] Logout clears Redis + Postgres + cookie
- [ ] `/auth/me` returns current user with valid session
- [ ] Rate limit blocks after 5 failed attempts per IP+email in 15 min

---

## 🧾 AUTH-4: Implement JWKS Endpoint and Agent Worker JWKS Cache

### 🎯 Description

Expose `GET /.well-known/jwks.json` from the Gateway Pod so Agent Worker Pods can fetch and verify JWTs without needing the private key. Agent Workers cache the JWKS response in Redis (5-minute TTL) so they don't make a network call per request.

Source: `03-auth-design/README.md` — "JWKS Endpoint" and "Key Management" sections.

### ⚙️ Implementation Details

**Files to create:**
- Add JWKS route to `services/gateway/src/index.ts`
- `services/agent-worker/src/jwks-client.ts` — Fetches and caches JWKS from gateway

**Gateway JWKS endpoint:**
```ts
GET /.well-known/jwks.json
→ No auth required
→ Call generateJwks(process.env.OPENCLAW_JWT_PUBLIC_KEY, kid)
→ Cache headers: Cache-Control: public, max-age=300
→ Return JSON
```

**Agent Worker JWKS client:**
```ts
async function getPublicKey(): Promise<string>
  1. Try Redis GET jwks:cache
  2. If hit: return cached public key PEM
  3. Fetch http://<GATEWAY_SERVICE_URL>/.well-known/jwks.json
  4. Extract public key from JWKS (match by kid or take first)
  5. Convert JWK → PEM
  6. SET jwks:cache <pem> EX 300
  7. Return PEM
```

**Key rotation support:**
- JWKS lists ALL active keys (current + keys in grace period)
- Agent workers pick the key matching the JWT's `kid` header claim

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

You are working in the OpenClaw enterprise codebase.

Task:
1. Add JWKS endpoint to services/gateway/src/index.ts
2. Create services/agent-worker/src/jwks-client.ts

For the JWKS endpoint in gateway index.ts:
  - app.get('/.well-known/jwks.json', (req, res) => {
      const jwks = generateJwks(process.env.OPENCLAW_JWT_PUBLIC_KEY!, process.env.OPENCLAW_JWT_KID || 'openclaw-team-2026-01');
      res.set('Cache-Control', 'public, max-age=300');
      res.json(jwks);
    });
  - No authentication required for this route
  - Register BEFORE authMiddleware

For services/agent-worker/src/jwks-client.ts:
  - Export async function getPublicKeyPem(): Promise<string>
  - Check Redis: GET jwks:cache → if found, return it
  - Fetch GATEWAY_URL + '/.well-known/jwks.json' with node-fetch or native fetch
  - Parse response: keys array, find key with matching kid (or first key)
  - Convert JWK RSA key to PEM using 'jose' library (importJWK → exportSPKI)
  - Cache in Redis: SET jwks:cache <pem> EX 300
  - Return PEM string
  - Export async function verifyJwtWithJwks(token: string): Promise<JwtPayload>
    - Call getPublicKeyPem()
    - Call verifyJwt(token, pem)
    - Return decoded payload

Dependencies: 'jose', Redis client from shared lib

Constraints:
  - The agent worker should NOT have OPENCLAW_JWT_PRIVATE_KEY in its env — only GATEWAY_URL
  - Cache miss should log at debug level
  - Cache hit should be silent
  - If JWKS fetch fails: throw with clear message (do not silently fail)

Output: Complete files with TypeScript types
```

### 🧪 Testing Instructions

```
1. Start gateway with valid OPENCLAW_JWT_PUBLIC_KEY and OPENCLAW_JWT_PRIVATE_KEY
2. GET /.well-known/jwks.json (no auth)
   → 200, { "keys": [{ "kty": "RSA", "alg": "RS256", "use": "sig", ... }] }
   → Check Cache-Control header present
3. Start agent worker
4. Check Redis after first agent job: GET jwks:cache → should be populated
5. Wait 5 minutes → Redis key should expire (test with TTL command)
6. Test JWT verification in agent worker:
   - Sign a JWT with gateway private key
   - Pass to agent worker → should verify successfully using JWKS
7. Test with wrong key: sign with different private key
   → Agent worker should reject
```

### 📥 Example Input

```
GET /.well-known/jwks.json
(no auth required)
```

### 📤 Expected Output

```json
{
  "keys": [{
    "kty": "RSA",
    "kid": "openclaw-team-2026-01",
    "use": "sig",
    "alg": "RS256",
    "n": "<base64url-encoded modulus>",
    "e": "AQAB"
  }]
}
```

### ✅ Acceptance Criteria

- [ ] JWKS endpoint returns valid JWKS JSON without authentication
- [ ] Cache-Control header set (5 minutes)
- [ ] Agent worker fetches JWKS on first use
- [ ] Agent worker caches JWKS in Redis with 5-minute TTL
- [ ] Agent worker verifies JWTs using cached public key
- [ ] Key rotation: new kid is fetched after cache expires
- [ ] JWKS fetch failure propagates as a thrown error

---

## 🧾 AUTH-5: Redis Session Store (set / get / delete)

### 🎯 Description

Build the Redis session store that underpins JWT revocation. Every authenticated request checks `EXISTS session:{jti}` before accepting the JWT. This enables instant revocation even though JWTs are stateless.

Source: `03-auth-design/README.md` — "Session Revocation" section and Redis Key Patterns in `06-data-model/README.md`.

### ⚙️ Implementation Details

**Files to create:**
- `services/shared/src/redis/session-store.ts`
- `services/shared/src/redis/client.ts`

**Key pattern:** `session:{jti}` → JSON string `{ userId, createdAt, lastUsedAt }`
**TTL:** 30 days (2,592,000 seconds)

**Operations:**
```ts
setSession(jti: string, data: SessionData, ttlSeconds: number): Promise<void>
getSession(jti: string): Promise<SessionData | null>
deleteSession(jti: string): Promise<void>
deleteAllUserSessions(userId: string, jtis: string[]): Promise<void>
```

**Redis client:** `ioredis` or `@redis/client` configured from `REDIS_URL` env var.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/shared/src/redis/client.ts and services/shared/src/redis/session-store.ts

For client.ts:
  - Export function createRedisClient(): Redis (from 'ioredis')
  - Uses process.env.REDIS_URL
  - Sets keepAlive, connectTimeout, maxRetriesPerRequest
  - On 'error' event: log error but do NOT crash (reconnect handled by ioredis)
  - Export a singleton: export const redis = createRedisClient()

For session-store.ts:
  - Import redis from client.ts
  - Export async function setSession(jti: string, data: SessionData, ttlSeconds: number): Promise<void>
    → redis.set('session:' + jti, JSON.stringify(data), 'EX', ttlSeconds)
  - Export async function getSession(jti: string): Promise<SessionData | null>
    → const raw = await redis.get('session:' + jti)
    → return raw ? JSON.parse(raw) : null
  - Export async function deleteSession(jti: string): Promise<void>
    → redis.del('session:' + jti)
  - Export async function deleteAllUserSessions(jtis: string[]): Promise<void>
    → If jtis.length === 0, return
    → redis.del(...jtis.map(j => 'session:' + j))
  - Export type SessionData { userId: string, createdAt: number, lastUsedAt?: number }

Constraints:
  - All functions must handle Redis unavailability by throwing (let the caller handle 503)
  - No console.log — use a logger if available
  - TTL is always set — never persist sessions forever

Output: Complete TypeScript files with correct ioredis imports
```

### 🧪 Testing Instructions

```
1. Start Redis (docker compose up redis)
2. Test setSession: call with jti='test123', data={ userId: 'u1', createdAt: Date.now() }, ttl=30
   → Redis GET session:test123 → returns JSON
   → Redis TTL session:test123 → ~30
3. Test getSession: returns the SessionData object
4. Test getSession for non-existent key → returns null
5. Test deleteSession → Redis GET session:test123 → null
6. Test deleteAllUserSessions with 3 jtis → all 3 deleted in Redis
7. Test TTL auto-expiry: set ttl=1, wait 2 seconds, GET → null
```

### 📥 Example Input

```ts
await setSession('sess_7k2x9q', { userId: 'u_a3f9b2', createdAt: Date.now() }, 2592000);
const data = await getSession('sess_7k2x9q');
```

### 📤 Expected Output

```ts
// data: { userId: 'u_a3f9b2', createdAt: 1714500000000 }
// Redis TTL: 2592000 seconds
```

### ✅ Acceptance Criteria

- [ ] `setSession` stores JSON with correct TTL in Redis
- [ ] `getSession` returns typed `SessionData` or `null`
- [ ] `deleteSession` removes the Redis key
- [ ] `deleteAllUserSessions` removes multiple keys in one Redis call
- [ ] TTL auto-expires sessions
- [ ] Redis unavailability throws (not silently fails)

---

## 🧾 AUTH-6: API Token Creation, Listing, and Deletion

### 🎯 Description

Implement the API token lifecycle: creation (returns raw token once, stores only SHA-256 hash), listing (shows metadata without token value), and deletion (with cache invalidation in Redis). Tokens use the `ocp_` prefix and are verified by the auth middleware.

Source: `02-service-contracts/README.md` — "Team Admin Routes" and `03-auth-design/README.md` — "API Token Caching".

### ⚙️ Implementation Details

**Token format:** `ocp_` + 32 random bytes (hex) = 68-character string
**Storage:** Only `sha256(rawToken)` stored in Postgres `api_tokens` table
**Cache:** `SET api_token:{hash} { userId, workspaceId, isAdmin } EX 60` in Redis
**Cache invalidation:** On DELETE, also `DEL api_token:{hash}` from Redis

**Routes (in `team-routes.ts`):**
```
POST /team/tokens { name }
  → Generate raw token: 'ocp_' + randomBytes(32).hex()
  → hash = sha256(rawToken)
  → INSERT INTO api_tokens (user_id, name, hash)
  → Return { tokenId, token } (token shown ONCE — never again)

GET /team/tokens
  → SELECT * FROM api_tokens WHERE user_id = req.team.userId
  → Return [{ id, name, createdAt, lastUsedAt }] (no token value)

DELETE /team/tokens/:id
  → SELECT hash FROM api_tokens WHERE id = ? AND user_id = ?
  → DELETE FROM api_tokens WHERE id = ?
  → DEL api_token:{hash} from Redis
  → Return 204
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

You are working in services/gateway/src/ of the OpenClaw enterprise codebase.

Task:
Add API token routes to services/gateway/src/team-routes.ts (create the file if it doesn't exist).

Requirements:

POST /team/tokens (requires authMiddleware):
  - Validate body: { name: string } (required, max 100 chars)
  - Generate raw token: 'ocp_' + crypto.randomBytes(32).toString('hex')
  - Compute hash: crypto.createHash('sha256').update(rawToken.slice(4)).digest('hex')
    (hash only the part after 'ocp_')
  - INSERT INTO api_tokens (id=uuid, user_id=req.team.userId, name, hash, created_at=now)
  - Return 201: { tokenId: id, token: rawToken }
  - Log token creation (tokenId only, not the raw token)

GET /team/tokens (requires authMiddleware):
  - SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ?
  - Return 200: array of { id, name, createdAt, lastUsedAt }

DELETE /team/tokens/:id (requires authMiddleware):
  - SELECT hash FROM api_tokens WHERE id = ? AND user_id = req.team.userId
  - If not found: return 404
  - DELETE FROM api_tokens WHERE id = ?
  - DEL from Redis: api_token:{hash}
  - Return 204

For the auth middleware's API token lookup (update auth-middleware.ts):
  - After hash lookup: update last_used_at in Postgres asynchronously (fire-and-forget)
    UPDATE api_tokens SET last_used_at = now() WHERE hash = ?

Files to import from:
  - ../../../shared/src/db/queries (createApiToken, listApiTokens, findApiTokenByHash, deleteApiToken)
  - ../../../shared/src/redis/client (redis)
  - ./auth-middleware (authMiddleware)

Constraints:
  - Raw token is shown EXACTLY ONCE in the creation response — never stored
  - Hash stored in DB, NEVER the raw token
  - DELETE must also remove Redis cache entry to prevent stale token auth
  - TypeScript strict mode

Output: Complete team-routes.ts with token section, and updated auth-middleware.ts
```

### 🧪 Testing Instructions

```
1. POST /team/tokens { "name": "My API key" } with valid JWT cookie
   → 201, response has { tokenId, token } where token starts with 'ocp_'
   → Check: api_tokens row in Postgres with correct hash
   → Check: raw token NOT in database
2. GET /team/tokens
   → 200, array with { id, name, createdAt } — no token field
3. Use the token for authentication:
   GET /auth/me with Authorization: Bearer <token-from-step-1>
   → 200 with user data
4. Check Redis after step 3: GET api_token:{hash} → should be cached
5. DELETE /team/tokens/:id
   → 204
6. Check Redis: GET api_token:{hash} → nil (cache cleared)
7. Try to use deleted token:
   GET /auth/me with Authorization: Bearer <token-from-step-1>
   → 401
```

### 📥 Example Input

```json
POST /team/tokens
{ "name": "Webhook integration key" }
```

### 📤 Expected Output

```json
HTTP 201
{ "tokenId": "tok_uuid_here", "token": "ocp_a1b2c3d4e5f6...68chars" }
```

### ✅ Acceptance Criteria

- [ ] Token generation uses `ocp_` prefix + 32 random bytes
- [ ] Only SHA-256 hash stored in Postgres (raw token never persisted)
- [ ] Raw token returned exactly once at creation
- [ ] Token list shows metadata without revealing token value
- [ ] Token works for authentication via auth middleware
- [ ] Token cached in Redis (60s TTL) after first use
- [ ] Deletion removes DB row AND Redis cache
- [ ] Deleted token returns 401 immediately (no Redis stale hit)
