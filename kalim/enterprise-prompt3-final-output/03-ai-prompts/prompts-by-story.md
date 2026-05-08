# AI Coding Prompts — Quick Reference by Story

This file is a consolidated index of all ready-to-paste AI coding prompts. Each entry includes the story ID, the file(s) it targets, and the full prompt. Copy and paste directly into Claude, Cursor, or Windsurf AI.

---

## INDEX

| Story | Target Files | Prompt Section |
|-------|-------------|----------------|
| AUTH-1 | `shared/src/crypto/jwt.ts`, `shared/src/crypto/password.ts` | [→ Jump](#auth-1-prompt) |
| AUTH-2 | `gateway/src/auth-middleware.ts` | [→ Jump](#auth-2-prompt) |
| AUTH-3 | `gateway/src/auth-routes.ts` | [→ Jump](#auth-3-prompt) |
| AUTH-4 | `gateway/src/index.ts` (JWKS), `agent-worker/src/jwks-client.ts` | [→ Jump](#auth-4-prompt) |
| AUTH-5 | `shared/src/redis/session-store.ts`, `shared/src/redis/client.ts` | [→ Jump](#auth-5-prompt) |
| AUTH-6 | `gateway/src/team-routes.ts` (tokens) | [→ Jump](#auth-6-prompt) |
| FS-1 | `shared/src/s3/client.ts`, `shared/src/s3/helpers.ts` | [→ Jump](#fs-1-prompt) |
| FS-2 | `agent-worker/src/secure-fs-s3.ts` | [→ Jump](#fs-2-prompt) |
| FS-3 | `agent-worker/src/file-resolver-s3.ts` | [→ Jump](#fs-3-prompt) |
| FS-4 | `agent-worker/src/job-processor.ts` (write-back section) | [→ Jump](#fs-4-prompt) |
| FS-5 | `gateway/src/attachment-handler.ts` | [→ Jump](#fs-5-prompt) |
| AGENT-1 | `agent-worker/src/index.ts` | [→ Jump](#agent-1-prompt) |
| AGENT-2 | `agent-worker/src/job-processor.ts` | [→ Jump](#agent-2-prompt) |
| AGENT-3 | `agent-worker/src/stream-publisher.ts`, `gateway/src/ws-relay.ts` | [→ Jump](#agent-3-prompt) |
| AGENT-4 | `src/agents/agent-command.ts` (patch) | [→ Jump](#agent-4-prompt) |
| AGENT-5 | `gateway/src/queue-producer.ts` | [→ Jump](#agent-5-prompt) |
| CHAN-1 | `gateway/src/channel-router.ts` (WhatsApp) | [→ Jump](#chan-1-prompt) |
| CHAN-2 | `gateway/src/channel-router.ts` (Telegram) | [→ Jump](#chan-2-prompt) |
| CHAN-3 | `gateway/src/channel-claim.ts` | [→ Jump](#chan-3-prompt) |
| CHAN-4 | `gateway/src/channel-reply.ts` | [→ Jump](#chan-4-prompt) |
| CHAN-5 | `shared/src/redis/rate-limiter.ts` | [→ Jump](#chan-5-prompt) |
| CHAN-6 | `shared/src/crypto/secrets.ts`, `gateway/src/workspace-secrets.ts` | [→ Jump](#chan-6-prompt) |
| SEC-1 | `shared/src/crypto/hmac.ts` + queue signing | [→ Jump](#sec-1-prompt) |
| SEC-2 | `agent-worker/src/stream-publisher.ts` + `gateway/src/channel-reply.ts` | [→ Jump](#sec-2-prompt) |
| SEC-3 | `gateway/src/csrf.ts` | [→ Jump](#sec-3-prompt) |
| SEC-4 | `charts/openclaw/templates/networkpolicy.yaml` | [→ Jump](#sec-4-prompt) |
| PLUGIN-1 | `agent-worker/src/plugin-guard.ts`, patch `src/plugins/plugin-loader.ts` | [→ Jump](#plugin-1-prompt) |
| PLUGIN-2 | `gateway/src/team-routes.ts` (user management) | [→ Jump](#plugin-2-prompt) |
| PLUGIN-3 | `gateway/src/web/login.html`, `team.html`, `web-routes.ts` | [→ Jump](#plugin-3-prompt) |
| DB-1 | `shared/src/db/schema.sql`, `migrate.ts`, `pool.ts` | [→ Jump](#db-1-prompt) |
| DB-2 | `shared/src/db/queries.ts` | [→ Jump](#db-2-prompt) |
| DB-3 | `gateway/src/bootstrap.ts` | [→ Jump](#db-3-prompt) |
| DB-4 | `scripts/migrate-sqlite-to-postgres.ts` | [→ Jump](#db-4-prompt) |
| DEPLOY-1 | `docker-compose.yml`, `.env.example` | [→ Jump](#deploy-1-prompt) |
| DEPLOY-2 | `services/gateway/Dockerfile`, `services/agent-worker/Dockerfile` | [→ Jump](#deploy-2-prompt) |
| DEPLOY-3 | `charts/openclaw/` (full Helm chart) | [→ Jump](#deploy-3-prompt) |
| DEPLOY-4 | `gateway/src/health.ts`, `agent-worker/src/health.ts` | [→ Jump](#deploy-4-prompt) |
| DEPLOY-5 | `gateway/src/index.ts` | [→ Jump](#deploy-5-prompt) |
| DEPLOY-6 | `shared/src/config/env.ts`, `scripts/generate-secrets.sh` | [→ Jump](#deploy-6-prompt) |

---

## PHASE 0 — START HERE (Foundation, shared library first)

### Recommended Execution Order

```
1. AUTH-1  → JWT utilities (no deps)
2. AUTH-5  → Redis session store (no deps)
3. DB-1    → Postgres schema + migration (no deps)
4. DB-2    → Query functions (depends on DB-1)
5. FS-1    → S3 client (no deps)
6. DEPLOY-6 → Env validation (no deps)
7. DEPLOY-1 → Docker Compose (start dev environment)
8. DB-3    → Bootstrap Job (depends on DB-1, DB-2, FS-1)
```

Then PHASE 1 (Gateway):
```
9.  AUTH-2  → Auth middleware
10. AUTH-3  → Auth routes (login/logout)
11. AUTH-4  → JWKS endpoint
12. AUTH-6  → API token routes
13. CHAN-5  → Rate limiter
14. CHAN-6  → Workspace secrets
15. CHAN-3  → Claim code flow
16. CHAN-1  → WhatsApp webhook
17. CHAN-2  → Telegram webhook
18. FS-5   → Attachment handler
19. CHAN-4  → Reply sender
20. AGENT-5 → Queue producer
21. PLUGIN-2 → User management routes
22. PLUGIN-3 → Admin HTML pages
23. SEC-3   → CSRF protection
24. DEPLOY-4 → Health checks
25. DEPLOY-5 → Gateway entry point
```

Then PHASE 2 (Agent Worker):
```
26. FS-2   → Secure FS adapter
27. FS-3   → File resolver
28. FS-4   → Write-back
29. AGENT-4 → Patch agent-command.ts
30. AGENT-3 → Stream publisher + WS relay
31. PLUGIN-1 → Plugin guard
32. SEC-1  → Job HMAC signing
33. SEC-2  → Reply HMAC signing
34. AGENT-1 → Worker entry point
35. AGENT-2 → Job processor
```

Then PHASE 3 (Deployment):
```
36. DEPLOY-2 → Dockerfiles
37. DB-4    → SQLite migration script
38. SEC-4   → NetworkPolicies
39. DEPLOY-3 → Helm chart
```

---

## CONSOLIDATED PROMPTS (copy-paste ready)

### <a id="auth-1-prompt"></a>AUTH-1: JWT + Password Utilities

```text
You are a senior TypeScript/Node.js engineer building the OpenClaw enterprise shared library.

Context: This is a Kubernetes-deployable multi-user system. The Gateway Pod signs JWTs with RS256.
Agent Workers verify them via JWKS. Passwords use Argon2id.

Task: Create two files in services/shared/src/crypto/

FILE 1: jwt.ts
- Import: jose (for JWT operations)
- Export interface JwtPayload { sub: string; email: string; name: string; wid: string | null; adm: boolean; iat: number; exp: number; jti: string }
- Export interface JwtKeySet { keys: object[] }
- Export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>, privateKeyPem: string): Promise<string>
  → Sets exp to now + 30 days
  → Sets iat to now
  → Sets jti to crypto.randomUUID()
  → Signs with RS256 using jose
  → Returns JWT string
- Export async function verifyJwt(token: string, publicKeyPem: string): Promise<JwtPayload>
  → Verifies RS256 signature
  → Throws if expired or invalid
  → Returns decoded payload
- Export async function generateJwks(publicKeyPem: string, kid: string): Promise<JwtKeySet>
  → Converts PEM public key to JWK format using jose
  → Returns { keys: [{ kty, kid, use, alg, n, e }] }

FILE 2: password.ts
- Import: argon2
- Export async function hashPassword(password: string): Promise<string>
  → Uses argon2.hash() with argon2id algorithm
  → Library defaults for cost factors
- Export async function verifyPassword(password: string, hash: string): Promise<boolean>
  → Uses argon2.verify()
  → Returns false on mismatch (never throws on verification failure)

Dependencies to install: jose, argon2

Constraints:
- Pure functions, no singletons, no side effects
- TypeScript strict mode
- No console.log
- All async

Output: Complete jwt.ts and password.ts with all imports and exports
```

---

### <a id="auth-2-prompt"></a>AUTH-2: Auth Middleware

```text
You are a senior TypeScript/Node.js engineer building an Express middleware for multi-user auth.

Context: OpenClaw enterprise Gateway Pod handles 3 credential paths:
1. JWT cookie (oc_session) — Browser users after login
2. API token (ocp_ prefix) — Scripts, webhooks, CLI
3. Legacy gateway token — Existing OpenClaw control UI

Task: Create services/gateway/src/auth-middleware.ts

Interface to add to Express Request:
declare global {
  namespace Express {
    interface Request {
      team?: TeamCtx;
    }
  }
}

interface TeamCtx {
  userId: string;
  workspaceId: string | null;
  isAdmin: boolean;
  source: 'cookie' | 'api-token' | 'legacy';
  jti?: string;  // Only for cookie auth (needed for CSRF)
}

Export function authMiddleware(req: Request, res: Response, next: NextFunction): void:

  Path 1 — JWT Cookie:
    token = req.cookies?.oc_session
    if token:
      try:
        payload = await verifyJwt(token, process.env.OPENCLAW_JWT_PUBLIC_KEY!)
        // Check Redis session exists (for revocation)
        session = await getSession(payload.jti)
        if (!session): return res.status(401).json({ error: 'session revoked' })
        req.team = { userId: payload.sub, workspaceId: payload.wid, isAdmin: payload.adm, source: 'cookie', jti: payload.jti }
        return next()
      catch:
        // Fall through to next path

  Path 2 — API Token (Bearer ocp_...):
    authHeader = req.headers.authorization
    if authHeader?.startsWith('Bearer ocp_'):
      rawToken = authHeader.slice('Bearer ocp_'.length)
      hash = crypto.createHash('sha256').update(rawToken).digest('hex')
      // Try Redis cache first
      cached = await redis.get('api_token:' + hash)
      if cached:
        user = JSON.parse(cached)
      else:
        user = await findApiTokenByHash(hash)
        if (!user): return res.status(401).json({ error: 'invalid token' })
        await redis.set('api_token:' + hash, JSON.stringify(user), 'EX', 60)
      req.team = { userId: user.userId, workspaceId: user.workspaceId, isAdmin: user.isAdmin, source: 'api-token' }
      return next()

  Path 3 — Legacy Gateway Token:
    if authHeader?.startsWith('Bearer ') (and not ocp_):
      token = authHeader.slice('Bearer '.length)
      gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || ''
      if gatewayToken && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(gatewayToken)):
        req.team = { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }
        return next()

  None matched:
    return res.status(401).json({ error: 'unauthorized' })

Export function requireAdmin(req: Request, res: Response, next: NextFunction): void:
  if (!req.team?.isAdmin): return res.status(403).json({ error: 'admin required' })
  next()

Imports needed:
- ../../../shared/src/crypto/jwt → verifyJwt
- ../../../shared/src/redis/session-store → getSession
- ../../../shared/src/redis/client → redis
- ../../../shared/src/db/queries → findApiTokenByHash
- crypto (built-in)
- express (Request, Response, NextFunction)

Constraints:
- ALL token comparisons use crypto.timingSafeEqual
- NEVER log token values (log only userId + source on success)
- Type safe: TypeScript strict mode
- No async/await issues — handle all promises correctly

Output: Complete auth-middleware.ts
```

---

### <a id="fs-2-prompt"></a>FS-2: Secure FS Adapter (Security-Critical)

```text
You are a senior TypeScript/Node.js security engineer.

Context: OpenClaw agent workers read and write per-user files from S3/MinIO.
The secureRead/secureWrite functions MUST prevent:
1. User A accessing User B's files
2. Writes to the read-only base/ prefix
3. Path traversal attacks (../ or // in keys)

Task: Create services/agent-worker/src/secure-fs-s3.ts

Requirements:

Export class SecureFsViolationError extends Error:
  public userId: string
  public key: string
  public reason: string
  constructor(userId: string, key: string, reason: string):
    super('[SecureFS-S3] user=' + userId + ' key=' + key + ' reason=' + reason)
    this.name = 'SecureFsViolationError'

Export function validateS3Key(userId: string, key: string): string:
  const userPrefix = 'users/user_' + userId + '/'
  const basePrefix = 'base/'
  if (!key.startsWith(userPrefix) && !key.startsWith(basePrefix)):
    throw new SecureFsViolationError(userId, key, 'outside user and base prefix')
  if (key.includes('..')):
    throw new SecureFsViolationError(userId, key, 'path traversal detected')
  if (key.includes('//')):
    throw new SecureFsViolationError(userId, key, 'path traversal detected')
  return key

Export function validateS3WriteKey(userId: string, key: string): string:
  const validated = validateS3Key(userId, key)
  if (validated.startsWith('base/')):
    throw new SecureFsViolationError(userId, key, 'writes to base/ forbidden')
  return validated

Export async function secureRead(userId: string, key: string): Promise<string>:
  validateS3Key(userId, key)  // Must be called before S3 operation
  return await getObject(key)  // From shared/src/s3/helpers

Export async function secureWrite(
  userId: string,
  key: string,
  content: string,
  options?: { append?: boolean; memoryCap?: number }
): Promise<void>:
  validateS3WriteKey(userId, key)
  if (options?.append):
    const existing = await getObject(key).catch(() => '')
    let combined = existing + content
    const cap = options.memoryCap || 8192
    if (combined.length > cap):
      const lines = combined.split('\n')
      while (combined.length > cap && lines.length > 1):
        lines.shift()
        combined = lines.join('\n')
    content = combined
  await putObject(key, content)

Imports:
  import { getObject, putObject } from '../../../shared/src/s3/helpers'

Constraints:
  - validateS3Key ALWAYS called before any S3 operation — no exceptions
  - SecureFsViolationError ALWAYS logged at ERROR level (use console.error before throw or a logger)
  - No default exports — named exports only
  - TypeScript strict mode

Output: Complete secure-fs-s3.ts
```

---

### <a id="chan-1-prompt"></a>CHAN-1: WhatsApp Webhook Handler

```text
You are a senior TypeScript/Node.js engineer building a WhatsApp webhook handler.

Context: Meta Cloud API sends webhooks to POST /webhooks/whatsapp/:wsId.
The gateway MUST:
1. Verify HMAC-SHA256 signature (using raw body BEFORE JSON parse)
2. Resolve sender to a userId via channel_identities
3. Enqueue job to BullMQ (NO direct agent call)
4. Respond 200 to Meta in < 50ms

Task: Create the WhatsApp section in services/gateway/src/channel-router.ts

IMPORTANT: Raw body requirement
  Express must be configured with express.raw() for webhook routes:
  router.use(express.raw({ type: 'application/json', limit: '10mb' }))
  This gives req.body as Buffer — required for correct HMAC

GET /webhooks/whatsapp/:wsId (webhook verification):
  1. Read hub.mode, hub.verify_token, hub.challenge from req.query
  2. const storedToken = getWorkspaceSecret(req.params.wsId, 'whatsapp_verify_token')
  3. if hub.mode === 'subscribe' AND timingSafeEqual(Buffer.from(hub.verify_token), Buffer.from(storedToken)):
     res.status(200).send(hub.challenge)
  else: res.status(403).send('Forbidden')

POST /webhooks/whatsapp/:wsId:
  1. SIGNATURE VERIFICATION (critical):
     const appSecret = getWorkspaceSecret(req.params.wsId, 'whatsapp_app_secret')
     const sigHeader = req.headers['x-hub-signature-256'] as string
     if (!sigHeader): return res.status(401).json({ error: 'missing signature' })
     const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(req.body as Buffer).digest('hex')
     if (!timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expectedSig))):
       logger.warn({ wsId: req.params.wsId } 'WhatsApp HMAC mismatch')
       return res.status(401).json({ error: 'invalid signature' })

  2. PARSE BODY:
     const body = JSON.parse((req.body as Buffer).toString())
     const messages = body.entry?.[0]?.changes?.[0]?.value?.messages
     if (!messages?.length): return res.status(200).json({})

  3. For each message:
     const from = message.from  // E.164 phone
     const text = message.text?.body || ''
     const messageId = message.id
     
     // Resolve user
     const identity = await findChannelIdentity('whatsapp', from)
     if (!identity):
       if (text.toLowerCase().startsWith('claim ')):
         const code = text.slice(6).trim()
         const result = await redeemClaimCode(code, 'whatsapp', from, contact?.profile?.name)
         // Enqueue claim-result reply
       return res.status(200).json({})  // Drop or handle per mode
     if (identity.status === 'disabled'): return res.status(200).json({})

  4. ENQUEUE:
     await enqueueAgentJob({
       userId: identity.userId, workspaceId: identity.workspaceId,
       isAdmin: false, source: 'cookie',
       channel: 'whatsapp', threadId: from,
       sessionKey: 'u:' + identity.userId + ':wa:' + from,
       text, webhookMessageId: messageId,
       timestamp: new Date().toISOString(),
     })

  5. return res.status(200).json({})

Imports needed:
  createHmac, timingSafeEqual from 'node:crypto'
  getWorkspaceSecret from ./workspace-secrets
  findChannelIdentity from shared/db/queries
  enqueueAgentJob from ./queue-producer
  redeemClaimCode from ./channel-claim

Constraints:
  - timingSafeEqual for HMAC and verify token comparisons
  - Return 200 to Meta for ALL non-signature-failures (Meta retries on 4xx/5xx)
  - NEVER log message text (privacy)
  - Process messages asynchronously — do not await agent execution
  - TypeScript strict mode

Output: Complete WhatsApp webhook section of channel-router.ts
```

---

### <a id="db-1-prompt"></a>DB-1: Postgres Schema + Migration

```text
You are a senior TypeScript/Node.js engineer with deep Postgres expertise.

Context: OpenClaw enterprise replaces SQLite with Postgres 16. This shared library is used by
both the Gateway Pod and Agent Worker Pod. Schema migrates the simple plan's SQLite tables to
Postgres-native types.

Task: Create 3 files in services/shared/src/db/

FILE 1: schema.sql — Complete Postgres DDL

Write idempotent DDL (all CREATE TABLE IF NOT EXISTS, all CREATE INDEX IF NOT EXISTS):

Tables needed:
1. workspaces (id UUID, name TEXT, created_at TIMESTAMPTZ)
2. users (id UUID, email TEXT UNIQUE, password_hash TEXT, name TEXT, is_admin BOOLEAN, workspace_id UUID refs workspaces, status TEXT CHECK('active','disabled'), created_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ)
   Indexes: status, email
3. user_sessions (id UUID PRIMARY, user_id UUID refs users CASCADE, created_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, user_agent TEXT, ip_address INET)
   Indexes: user_id, expires_at
4. api_tokens (id UUID, user_id UUID refs users CASCADE, name TEXT, hash TEXT UNIQUE, last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
   Indexes: user_id, hash
5. channel_identities (id UUID, user_id UUID refs users CASCADE, workspace_id UUID refs workspaces, channel TEXT CHECK('whatsapp','telegram'), external_id TEXT, display_name TEXT, created_at TIMESTAMPTZ, UNIQUE(channel, external_id))
   Indexes: user_id, (channel, external_id)
6. channel_claims (code TEXT PRIMARY, user_id UUID refs users CASCADE, channel TEXT, expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ)
7. workspace_secrets (id UUID, workspace_id UUID refs workspaces, secret_type TEXT, encrypted_val BYTEA, iv BYTEA, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, UNIQUE(workspace_id, secret_type))

FILE 2: migrate.ts — Idempotent migration runner
  import { Pool } from 'pg'
  import { readFileSync } from 'node:fs'
  import { join, dirname } from 'node:path'
  import { fileURLToPath } from 'node:url'

  export async function migrate(pool: Pool): Promise<void>:
    const versionResult = await pool.query("SELECT current_setting('openclaw.schema_version', true) as v")
    const version = parseInt(versionResult.rows[0]?.v || '0', 10)

    if (version < 1):
      const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql')
      const schema = readFileSync(schemaPath, 'utf-8')
      await pool.query(schema)
      await pool.query("SELECT set_config('openclaw.schema_version', '1', false)")
      console.log('[migrate] Schema v1 applied')
    else:
      console.log('[migrate] Schema already at version ' + version)

FILE 3: pool.ts — Postgres connection pool singleton
  import { Pool } from 'pg'

  let _pool: Pool | null = null

  export function getPool(): Pool:
    if (!_pool):
      if (!process.env.DATABASE_URL): throw new Error('DATABASE_URL is required')
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
        max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })
      _pool.on('error', (err) => console.error('[postgres] Pool error:', err.message))
    return _pool

  export async function closePool(): Promise<void>:
    if (_pool): await _pool.end(); _pool = null

Constraints:
  - All CREATE TABLE use IF NOT EXISTS
  - All CREATE INDEX use IF NOT EXISTS
  - Gen random UUID: gen_random_uuid() (built-in Postgres 13+)
  - Migration idempotent: safe to run multiple times
  - TypeScript strict mode, ES modules (import.meta.url)

Output: All 3 complete files
```

---

### <a id="deploy-1-prompt"></a>DEPLOY-1: Docker Compose Local Dev

```text
You are a senior DevOps engineer setting up local development for a Kubernetes-targeted system.

Context: OpenClaw enterprise needs a complete local dev stack matching production topology:
- Gateway Pod (HTTP/WS)
- Agent Worker Pod (BullMQ consumer)
- Postgres 16 (persistent data)
- Redis 7 (queues, sessions, pub/sub)
- MinIO (S3-compatible file storage)
- Bootstrap Job (schema + admin user + S3 seeds)

Task: Create 3 files

FILE 1: docker-compose.yml

services:
  gateway:
    build: { context: ., dockerfile: services/gateway/Dockerfile }
    image: openclaw-gateway:local
    ports: ['8080:8080', '8081:8081']
    environment:
      OPENCLAW_TEAM_MODE: '1'
      DATABASE_URL: postgres://openclaw:openclaw@postgres:5432/openclaw
      REDIS_URL: redis://redis:6379
      OPENCLAW_S3_BUCKET: openclaw-workspace
      S3_ENDPOINT: http://minio:9000
      AWS_ACCESS_KEY_ID: minioadmin
      AWS_SECRET_ACCESS_KEY: minioadmin
      AWS_REGION: us-east-1
      OPENCLAW_PUBLIC_BASE_URL: http://localhost:8080
    env_file: [.env.local]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/healthz']
      interval: 10s; timeout: 5s; retries: 3

  agent-worker:
    build: { context: ., dockerfile: services/agent-worker/Dockerfile }
    image: openclaw-agent-worker:local
    environment: [same as gateway minus JWT private key + plus OPENAI_API_KEY]
    env_file: [.env.local]
    depends_on: [postgres, redis, minio]

  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: openclaw, POSTGRES_PASSWORD: openclaw, POSTGRES_DB: openclaw }
    volumes: ['pg-data:/var/lib/postgresql/data']
    ports: ['5432:5432']
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U openclaw'], interval: 5s, retries: 5 }

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    volumes: ['redis-data:/data']
    healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: 5s, retries: 5 }

  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }
    ports: ['9000:9000', '9001:9001']
    volumes: ['minio-data:/data']
    healthcheck: { test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live'], interval: 5s, retries: 5 }

  bootstrap:
    build: { context: ., dockerfile: services/gateway/Dockerfile }
    command: node dist/services/gateway/src/bootstrap.js
    environment: [DATABASE_URL, S3 env vars]
    env_file: [.env.local]
    depends_on: { postgres: {condition: service_healthy}, minio: {condition: service_healthy} }
    restart: 'no'

volumes: { pg-data:, redis-data:, minio-data: }

FILE 2: .env.example
  # Copy to .env.local (git-ignored) and fill in real values
  # Generate secrets: bash scripts/generate-secrets.sh

  OPENCLAW_GATEWAY_TOKEN=change-me-to-random-hex
  OPENCLAW_JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n<paste here>\n-----END RSA PRIVATE KEY-----"
  OPENCLAW_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n<paste here>\n-----END PUBLIC KEY-----"
  OPENCLAW_COOKIE_SECRET=change-me-32chars-minimum
  OPENCLAW_QUEUE_SECRET=change-me-32chars-minimum
  OPENCLAW_SECRETS_KEY=<base64-encoded-32-bytes>
  OPENCLAW_TEAM_ADMIN_EMAIL=admin@example.com
  OPENCLAW_TEAM_ADMIN_PASSWORD=Change-This-Password-123!
  OPENAI_API_KEY=sk-...
  ANTHROPIC_API_KEY=
  TELEGRAM_BOT_TOKEN=

FILE 3: .gitignore additions
  .env.local
  .env.*.local
  jwt-private.pem
  *.pem

Constraints:
  - ALL secrets in .env.local, NEVER in docker-compose.yml
  - Services use health checks to gate startup order
  - bootstrap has restart: 'no' (Kubernetes Job equivalent)
  - .env.example committed to git; .env.local in .gitignore
  - Complete and runnable with 'docker compose up'

Output: All 3 files
```

---

### <a id="deploy-3-prompt"></a>DEPLOY-3: Helm Chart (Key Templates)

```text
You are a Kubernetes/Helm expert.

Context: OpenClaw enterprise needs a production-ready Helm chart. Gateway scales on CPU (2-10 replicas).
Agent Worker scales on BullMQ queue depth (2-20 replicas). Infra can be in-cluster (dev) or managed (prod).

Task: Create the essential Helm chart templates in charts/openclaw/templates/

Write COMPLETE, VALID Kubernetes YAML for:

1. gateway-deployment.yaml:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "openclaw.fullname" . }}-gateway
spec:
  replicas: {{ .Values.gateway.replicas }}
  selector:
    matchLabels:
      app: openclaw-gateway
  template:
    spec:
      containers:
        - name: gateway
          image: {{ .Values.gateway.image }}:{{ .Values.gateway.tag }}
          ports: [8080, 8081]
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: openclaw-secrets, key: database-url } }
            - name: REDIS_URL
              valueFrom: { secretKeyRef: { name: openclaw-secrets, key: redis-url } }
            - name: OPENCLAW_JWT_PRIVATE_KEY
              valueFrom: { secretKeyRef: { name: openclaw-secrets, key: jwt-private } }
            [all other env vars from values + secrets]
          livenessProbe: { httpGet: { path: /healthz, port: 8080 }, initialDelaySeconds: 10 }
          readinessProbe: { httpGet: { path: /readyz, port: 8080 }, initialDelaySeconds: 5 }
          resources: {{ toYaml .Values.gateway.resources | nindent 12 }}

2. gateway-hpa.yaml:
{{- if .Values.gateway.hpa.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "openclaw.fullname" . }}-gateway-hpa
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: openclaw-gateway }
  minReplicas: {{ .Values.gateway.hpa.minReplicas }}
  maxReplicas: {{ .Values.gateway.hpa.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: {{ .Values.gateway.hpa.targetCPUUtilization }} }
{{- end }}

3. agent-worker-deployment.yaml:
  - emptyDir volume: /tmp/agent-scratch
  - PVC volume: /data/lancedb (from pvc-lancedb.yaml)
  - No ports (consumer only)
  - Readiness: httpGet /health on port 9090

4. agent-worker-hpa.yaml:
  - External metric: bullmq_queue_depth
  - targetAverageValue: {{ .Values.agentWorker.hpa.targetValue }}

5. bootstrap-job.yaml:
apiVersion: batch/v1
kind: Job
metadata:
  name: openclaw-bootstrap
  annotations:
    helm.sh/hook: post-install,post-upgrade
    helm.sh/hook-weight: "10"
    helm.sh/hook-delete-policy: hook-succeeded
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: bootstrap
          image: {{ .Values.gateway.image }}:{{ .Values.gateway.tag }}
          command: ["node", "dist/services/gateway/src/bootstrap.js"]
          env: [DATABASE_URL, S3 vars from secrets]

6. secrets.yaml:
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-secrets
type: Opaque
data:
  database-url: {{ .Values.secrets.databaseUrl | b64enc }}
  redis-url: {{ .Values.secrets.redisUrl | b64enc }}
  jwt-private: {{ .Values.secrets.jwtPrivateKey | b64enc }}
  jwt-public: {{ .Values.secrets.jwtPublicKey | b64enc }}
  gateway-token: {{ .Values.secrets.gatewayToken | b64enc }}
  cookie-secret: {{ .Values.secrets.cookieSecret | b64enc }}
  queue-secret: {{ .Values.secrets.queueSecret | b64enc }}
  secrets-key: {{ .Values.secrets.secretsEncryptionKey | b64enc }}

Also write Chart.yaml:
apiVersion: v2
name: openclaw
description: OpenClaw Enterprise — multi-user Kubernetes deployment
type: application
version: 1.0.0
appVersion: "1.0.0"

Constraints:
  - All templates use {{ include "openclaw.fullname" . }} helper
  - HPA gated on hpa.enabled value
  - Bootstrap Job uses helm hook annotations
  - Secrets base64-encoded via Helm b64enc function
  - Valid Kubernetes YAML (pass kubectl --dry-run)

Output: All 6 template files + Chart.yaml
```

---

### <a id="plugin-1-prompt"></a>PLUGIN-1: Plugin team_safe Guard

```text
You are a senior TypeScript/Node.js engineer securing a plugin system.

Context: OpenClaw agent workers load plugins at startup. In team mode (multi-user), plugins MUST
declare team_safe: true in their manifest, otherwise they could exfiltrate data from any user.
We also need to replace the plugin's fs access with a secureRead/secureWrite proxy.

Task:
1. Create services/agent-worker/src/plugin-guard.ts
2. Describe the patch needed for src/plugins/plugin-loader.ts (read the file first, then patch)

For plugin-guard.ts:

export interface PluginManifest {
  name: string
  version: string
  team_safe?: boolean
  description?: string
  [key: string]: unknown
}

export function assertPluginTeamSafe(manifest: PluginManifest): void {
  if (manifest.team_safe !== true) {
    const msg = [
      '[TeamMode] Plugin "' + manifest.name + '" (v' + manifest.version + ') BLOCKED.',
      'Reason: manifest does not declare team_safe: true.',
      'To allow this plugin in team mode, audit it for:',
      '  - Direct file system access (node:fs)',
      '  - Access to environment variables containing secrets',
      '  - Cross-user data access patterns',
      'Then add team_safe: true to its manifest.json.',
    ].join('\n')
    console.error(msg)
    throw new Error(msg)
  }
  console.info('[TeamMode] Plugin "' + manifest.name + '" passed team_safe check')
}

export function createFsProxy(
  userId: string,
  secureRead: (userId: string, key: string) => Promise<string>,
  secureWrite: (userId: string, key: string, content: string, opts?: object) => Promise<void>
): object {
  return {
    readFile: async (path: string, _encoding?: string) => secureRead(userId, path),
    writeFile: async (path: string, content: string) => secureWrite(userId, path, content),
    appendFile: async (path: string, content: string) => secureWrite(userId, path, content, { append: true }),
    existsSync: () => false,  // Conservative: always deny sync FS checks in team mode
    mkdirSync: () => undefined,  // No-op
  }
}

For src/plugins/plugin-loader.ts patch:
  READ the existing file first.
  Find the location where a plugin's manifest is parsed/validated.
  AFTER parsing manifest, ADD:

  if (process.env.OPENCLAW_TEAM_MODE === '1') {
    const { assertPluginTeamSafe, createFsProxy } = await import('../../../services/agent-worker/src/plugin-guard.js')
    assertPluginTeamSafe(manifest)
    if (team) {
      const { secureRead, secureWrite } = await import('../../../services/agent-worker/src/secure-fs-s3.js')
      pluginContext.fs = createFsProxy(team.userId, secureRead, secureWrite)
    }
  }

  (exact insertion point depends on reading the file)

Constraints:
  - assertPluginTeamSafe throws — plugin does NOT load if check fails
  - Error message is detailed enough for plugin authors to understand what to fix
  - fs proxy does NOT expose arbitrary disk access
  - With OPENCLAW_TEAM_MODE unset: no guard, no proxy (backward compat)
  - TypeScript strict mode

Output: Complete plugin-guard.ts + description of patch location in plugin-loader.ts
```

---

*[Full prompts for all remaining stories — SEC-1 through DEPLOY-6 — are embedded in their respective epic story files under 02-stories/. Each story's "🤖 AI CODING PROMPT" section is copy-paste ready.]*

---

## PROMPT TEMPLATES FOR COMMON PATTERNS

### Template: Adding a new Postgres query function

```text
You are a senior TypeScript/Node.js engineer.

Add a new query function to services/shared/src/db/queries.ts.

READ the existing queries.ts file first to understand the pattern.

New function: [functionName](params: TypeHere): Promise<ReturnType>
SQL: [WRITE THE PARAMETERIZED SQL HERE — use $1, $2, etc.]
Row mapping: [describe snake_case → camelCase transforms needed]
Return: [null if not found | object | array | void]

Constraints:
- Use getPool() (never create a new Pool)
- Parameterized queries only ($1, $2 — NEVER string concatenation)
- Map snake_case columns to camelCase in the return object
- TypeScript strict mode
- Export the function
```

### Template: Adding a new Redis helper

```text
You are a senior TypeScript/Node.js engineer.

Add a new Redis helper to services/shared/src/redis/ (pick appropriate file or create new).

READ the existing client.ts to understand the redis singleton pattern.

New function: [functionName](params): Promise<type>
Redis operation: [GET/SET/DEL/INCR/etc.] [key pattern] [options: EX, NX, etc.]
Purpose: [what this is caching/tracking]
TTL: [X seconds, or N/A]

Constraints:
- Use the redis singleton from ./client
- Key must have TTL if it's a cache (never SET without EX for cache keys)
- TypeScript strict mode
```

### Template: Adding a new BullMQ job type

```text
You are a senior TypeScript/Node.js engineer.

Add support for a new job type to the OpenClaw agent worker.

New job type: [job-type-name]
Queue: [queue name]
Payload interface: [describe fields]
Processing: [what the worker should do]
Retry: [how many attempts, backoff strategy]
DLQ: [yes/no]

Files to modify:
- services/gateway/src/queue-producer.ts (add enqueue function)
- services/agent-worker/src/index.ts (register worker for this job type if different queue)
- services/agent-worker/src/job-processor.ts (add handler)

Constraints:
- HMAC sign payload before enqueue (use signPayload from shared/crypto/hmac)
- Verify HMAC at the start of handler (use verifyPayload)
- TypeScript strict mode
```
