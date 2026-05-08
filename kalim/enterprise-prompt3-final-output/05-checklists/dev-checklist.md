# Developer Checklist — OpenClaw Enterprise

Use this checklist when implementing each story. Check off items as you complete them. Do not mark a story Done until ALL checkboxes in the relevant sections are ticked.

---

## PHASE 0 — BEFORE WRITING ANY CODE

- [ ] Read the story description, implementation details, and AI coding prompt
- [ ] Read the referenced design doc sections (file paths listed in story)
- [ ] Read the existing source files you'll be modifying (never patch blindly)
- [ ] Confirm the Docker Compose environment is running: `docker compose up -d`
- [ ] Confirm Postgres is up: `psql $DATABASE_URL -c 'SELECT 1'`
- [ ] Confirm Redis is up: `redis-cli ping`
- [ ] Confirm MinIO is up: `curl http://localhost:9000/minio/health/live`
- [ ] Check if there are existing tests for the file you're touching — run them first
- [ ] Understand what the story's acceptance criteria are before writing code

---

## PHASE 1 — SHARED LIBRARY (services/shared/) — Do These First

### DB-1: Postgres Schema
- [ ] `services/shared/src/db/schema.sql` — all 7 tables written
- [ ] All `CREATE TABLE` use `IF NOT EXISTS`
- [ ] All `CREATE INDEX` use `IF NOT EXISTS`
- [ ] CHECK constraints on `users.status` and `channel_identities.channel`
- [ ] `ON DELETE CASCADE` on all user-referenced foreign keys
- [ ] `services/shared/src/db/migrate.ts` — idempotent migration runner
- [ ] `services/shared/src/db/pool.ts` — Pool singleton from DATABASE_URL
- [ ] **Test:** Run migrate() twice — no errors on second run
- [ ] **Test:** `psql -c '\dt'` shows all 7 tables

### AUTH-1: JWT + Password Utilities
- [ ] `services/shared/src/crypto/jwt.ts` — `signJwt`, `verifyJwt`, `generateJwks`
- [ ] Uses `jose` package for JWT operations
- [ ] RS256 algorithm (NOT HS256 — symmetric HMAC)
- [ ] `jti` set to `crypto.randomUUID()` on every sign
- [ ] `exp` set to now + 30 days
- [ ] `services/shared/src/crypto/password.ts` — `hashPassword`, `verifyPassword`
- [ ] Uses `argon2` package with argon2id variant
- [ ] `verifyPassword` returns false on mismatch — does NOT throw
- [ ] **Test:** signJwt → verifyJwt round-trip
- [ ] **Test:** Expired token rejected
- [ ] **Test:** Tampered signature rejected

### AUTH-5: Redis Session Store
- [ ] `services/shared/src/redis/client.ts` — ioredis singleton
- [ ] `services/shared/src/redis/session-store.ts` — get/set/delete session
- [ ] All keys have TTL (`EX` parameter on SET) — never SET without expiry
- [ ] `deleteAllUserSessions` deletes in one Redis call (not N separate calls)
- [ ] **Test:** set/get/delete session round-trip
- [ ] **Test:** TTL auto-expiry (set TTL=1, wait 2s, get → null)

### FS-1: S3 Helpers
- [ ] `services/shared/src/s3/client.ts` — S3Client singleton
- [ ] `forcePathStyle: true` when `S3_ENDPOINT` is set (MinIO compatibility)
- [ ] `services/shared/src/s3/helpers.ts` — getObject, putObject, headObject, copyObject
- [ ] `headObject` returns boolean, does NOT throw for missing keys
- [ ] **Test:** putObject + getObject round-trip with MinIO
- [ ] **Test:** headObject on non-existent key → false (no throw)

### DB-2: Query Functions
- [ ] `services/shared/src/db/queries.ts` — all query functions
- [ ] ZERO string concatenation with user input — all `$1, $2` parameterized
- [ ] snake_case → camelCase mapping in all row mappers
- [ ] `findUserByEmail` returns null for missing users (not throws)
- [ ] `deleteAllUserSessions` returns array of deleted jtis (for Redis cleanup)
- [ ] **Test:** SQL injection attempt returns null (not all users)

### SEC-1: HMAC Utilities
- [ ] `services/shared/src/crypto/hmac.ts` — `signPayload`, `verifyPayload`
- [ ] `timingSafeEqual` used — NEVER `===` for HMAC comparison
- [ ] **Test:** correct payload → verifyPayload returns true
- [ ] **Test:** tampered payload → verifyPayload returns false

### CHAN-5: Rate Limiter
- [ ] `services/shared/src/redis/rate-limiter.ts`
- [ ] Login: sliding window, 5/15min per IP+email
- [ ] Sender cooldown: `SET NX EX 2` (atomic, no race condition)
- [ ] All rate limit keys have TTL
- [ ] **Test:** 6th login attempt → blocked
- [ ] **Test:** Sender cooldown: 2nd message in <2s → blocked

### CHAN-6: Workspace Secrets
- [ ] `services/shared/src/crypto/secrets.ts` — AES-256-GCM encrypt/decrypt
- [ ] Auth tag stored with ciphertext (GCM authentication)
- [ ] Tampered ciphertext → decryptSecret throws
- [ ] `services/gateway/src/workspace-secrets.ts` — in-memory cache
- [ ] **Test:** encrypt → decrypt round-trip
- [ ] **Test:** Tampered ciphertext throws on decrypt

### DEPLOY-6: Env Validation
- [ ] `services/shared/src/config/env.ts` — `validateEnv` function
- [ ] Prints ALL missing vars at once (not one at a time)
- [ ] Exit code 1 immediately on missing required vars
- [ ] **Test:** Start with missing DATABASE_URL → clear error, exit 1

---

## PHASE 2 — GATEWAY SERVICE (services/gateway/)

### AUTH-2: Auth Middleware
- [ ] `services/gateway/src/auth-middleware.ts`
- [ ] Path 1: JWT cookie → verifyJwt → Redis session check
- [ ] Path 2: `ocp_` API token → sha256 hash → Redis cache → DB fallback
- [ ] Path 3: Legacy gateway token → timingSafeEqual
- [ ] ALL token comparisons use `crypto.timingSafeEqual`
- [ ] `req.team.jti` populated from JWT (needed for CSRF)
- [ ] `requireAdmin` middleware exported
- [ ] **Test:** All 6 auth paths (AUTH-T4 through AUTH-T10)

### AUTH-3: Auth Routes
- [ ] `services/gateway/src/auth-routes.ts`
- [ ] POST /auth/login: Argon2id verify → JWT issue → Redis + Postgres session
- [ ] Cookie: HttpOnly, SameSite=Lax, Secure, Path=/
- [ ] Wrong password returns SAME 401 as non-existent email (no user enumeration)
- [ ] POST /auth/logout: Redis DEL + Postgres DELETE + cookie clear
- [ ] Rate limiter applied before Argon2 verify
- [ ] **Test:** Login/logout happy path
- [ ] **Test:** Wrong password → 401 (same as wrong email)
- [ ] **Test:** Rate limit at 6th attempt → 429

### AUTH-4: JWKS Endpoint
- [ ] `GET /.well-known/jwks.json` registered BEFORE authMiddleware
- [ ] Returns valid JWKS JSON, Cache-Control: public, max-age=300
- [ ] No authentication required

### AUTH-6: API Token CRUD
- [ ] POST /team/tokens: `ocp_` prefix + 32 random bytes, only hash stored
- [ ] Raw token shown ONCE in response — never stored, never logged
- [ ] DELETE /team/tokens/:id: deletes DB row AND Redis cache key
- [ ] **Test:** Delete → immediate 401 on next use (no stale Redis hit)

### CHAN-1: WhatsApp Webhook
- [ ] Webhook route uses `express.raw()` (NOT `express.json()`)
- [ ] GET endpoint responds to Meta verification challenge
- [ ] POST: HMAC computed over raw Buffer body
- [ ] `timingSafeEqual` for HMAC comparison
- [ ] Returns 200 to Meta for all non-signature errors
- [ ] Job enqueued with `webhookMessageId` as dedup key
- [ ] **Test:** Valid HMAC → 200 + job enqueued
- [ ] **Test:** Invalid HMAC → 401
- [ ] **Test:** Claim code message → claim handling initiated

### CHAN-2: Telegram Webhook
- [ ] Secret token comparison uses `timingSafeEqual`
- [ ] chatId (not userId) used as threadId
- [ ] Non-message updates (callback_query, etc.) → 200 (no job)
- [ ] **Test:** Valid secret → 200; wrong secret → 401

### CHAN-3: Claim Code Flow
- [ ] Claim code: `OC-` + randomBytes(4).toString('hex').toUpperCase()
- [ ] Stored in BOTH Redis (10min TTL) AND Postgres
- [ ] Code normalized to uppercase before lookup
- [ ] Consumed code returns 'already-used' on re-use
- [ ] **Test:** Generate → redeem → verify identity created → verify consumed

### CHAN-4: Reply Sender
- [ ] Pattern-subscribed to `agent:reply:*` (not exact channel)
- [ ] HMAC verified on EVERY reply message before sending
- [ ] WhatsApp + Telegram send paths implemented
- [ ] Send failure logged but does NOT crash subscriber
- [ ] **Test:** Valid signed reply → outbound API called
- [ ] **Test:** Invalid signature → dropped, API NOT called

### AGENT-5: Queue Producer
- [ ] `OPENCLAW_QUEUE_SECRET` checked at module load — fails fast if missing
- [ ] HMAC `_sig` added to every job payload before enqueue
- [ ] `webhookMessageId` used as BullMQ jobId (dedup)
- [ ] Job options: 3 attempts, exponential backoff, TTL for complete/fail
- [ ] **Test:** Same webhookMessageId enqueued twice → 1 job in queue

### SEC-3: CSRF Protection
- [ ] `generateCsrfToken(jti)` = HMAC of jti with OPENCLAW_COOKIE_SECRET
- [ ] `csrfProtect` applied to all POST/DELETE on /team/*
- [ ] API token auth (`source: 'api-token'`) skips CSRF
- [ ] `timingSafeEqual` for CSRF comparison
- [ ] CSRF token embedded in all server-rendered HTML forms
- [ ] **Test:** POST /team/users without _csrf → 403

### PLUGIN-2: User Management Routes
- [ ] Admin cannot delete/disable own account
- [ ] Delete user: revokes ALL sessions (Redis + Postgres)
- [ ] DELETE /team/users/:id also removes api_token Redis cache entries
- [ ] **Test:** Delete user → old JWT cookie → 401 immediately

### PLUGIN-3: Admin HTML Pages
- [ ] `login.html`: no external CSS/JS dependencies
- [ ] `team.html`: users table, tokens table, identities table, DLQ section
- [ ] Every form has `_csrf` hidden field
- [ ] No inline secrets or sensitive data in HTML
- [ ] **Test:** GET /team → renders without JavaScript errors

### DEPLOY-4: Health Checks (Gateway)
- [ ] GET /healthz: always returns 200 (no DB/Redis calls)
- [ ] GET /readyz: checks Postgres + Redis, returns 503 if either down
- [ ] Both registered BEFORE authMiddleware
- [ ] **Test:** Stop Postgres → /readyz returns 503

### DEPLOY-5: Gateway Entry Point
- [ ] Raw body middleware applies ONLY to /webhooks/* paths
- [ ] JWKS endpoint registered before authMiddleware
- [ ] Health routes registered before authMiddleware
- [ ] Auth routes registered before authMiddleware
- [ ] All /team/* routes have CSRF + authMiddleware
- [ ] Graceful SIGTERM: finish in-flight requests, then exit 0
- [ ] Startup validates all required env vars
- [ ] loadWorkspaceSecrets() called at startup
- [ ] startChannelReplySender() called at startup

---

## PHASE 3 — AGENT WORKER (services/agent-worker/)

### FS-2: Secure FS Adapter
- [ ] `SecureFsViolationError` extends Error with userId, key, reason fields
- [ ] `validateS3Key`: rejects cross-user access, path traversal (`..`, `//`)
- [ ] `validateS3WriteKey`: additionally rejects `base/` writes
- [ ] `validateS3Key` ALWAYS called BEFORE S3 operations — no exceptions
- [ ] `SecureFsViolationError` logged at ERROR level (regardless of log level)
- [ ] **Test:** All FS-T3 through FS-T8 pass

### FS-3: File Resolver
- [ ] Creates scratch dir: `/tmp/agent-scratch/{userId}/`
- [ ] Clears `/tmp/agent-scratch/{userId}/tmp/` at start of each call
- [ ] Seeds from `base/` only if user file doesn't exist in S3
- [ ] Missing `base/` file: creates empty file (no crash)
- [ ] Returns absolute local paths for all 5 overlay files
- [ ] **Test:** FS-T1 (new user) and FS-T2 (existing user)

### FS-4: Write-Back
- [ ] Hash comparison: only upload if content changed
- [ ] Transcript always uploaded (even if empty)
- [ ] Log file appended (not overwritten)
- [ ] Write-back failure logged but does NOT fail the job (no rethrow)
- [ ] Scratch directory cleaned up after write-back

### AGENT-4: Patch agent-command.ts
- [ ] Patch adds `team?: TeamCtx` and `onToken?` parameters
- [ ] All new code gated on `if (team)` — backward compat when team is absent
- [ ] Memory write-back SKIPPED inside agent-command when team is present
- [ ] `onToken` called for each LLM token
- [ ] **Test:** Run existing test suite with OPENCLAW_TEAM_MODE unset → ALL pass

### AGENT-3: Stream Publisher
- [ ] `publishStreamToken` is no-op when `replyChannel` is null (webhook channels)
- [ ] `publishReply` adds HMAC `_sig` to every reply message
- [ ] WebSocket relay: each connection has its OWN Redis subscriber (not shared)
- [ ] JWT validated at WebSocket connection time (not just at HTTP upgrade)

### PLUGIN-1: Plugin Guard
- [ ] `assertPluginTeamSafe` throws with detailed error message on missing `team_safe`
- [ ] Called BEFORE any plugin code executes
- [ ] fs proxy does NOT expose arbitrary disk access
- [ ] `createFsProxy` routes readFile → secureRead, writeFile → secureWrite
- [ ] With OPENCLAW_TEAM_MODE unset: guard not applied (backward compat)

### SEC-2: Reply HMAC Signing
- [ ] Agent Worker adds `_sig` to every reply before redis.publish
- [ ] Gateway verifies `_sig` before calling outbound API
- [ ] Missing or invalid `_sig` → message dropped, logged, API NOT called

### AGENT-1: Worker Entry Point
- [ ] BullMQ Worker created with correct concurrency (default 5)
- [ ] Graceful SIGTERM: `worker.close()` → wait for in-flight jobs → exit 0
- [ ] Health server started on port 9090
- [ ] Startup connectivity check: Redis ping + S3 head-bucket
- [ ] Exit 1 if OPENCLAW_TEAM_MODE !== '1'

### AGENT-2: Job Processor
- [ ] HMAC verification is FIRST operation before any file/S3 work
- [ ] TeamCtx built from job payload (not from DB — trust signed payload)
- [ ] Agent executed with correct TeamCtx and onToken callback
- [ ] write-back failure does NOT rethrow (job marked complete)
- [ ] Reply published AFTER write-back, NOT before

---

## PHASE 4 — DEPLOYMENT

### DEPLOY-2: Dockerfiles
- [ ] Both images run as non-root (`USER node`)
- [ ] `.dockerignore` excludes `.env*`, `.git`, `node_modules`, `dist/`
- [ ] Agent Worker Dockerfile copies: `dist/`, `node_modules/`, `extensions/`, `skills/`, `base/`
- [ ] Multi-stage build (builder + runtime)
- [ ] Layer ordering: package files first (maximize cache hits)

### DEPLOY-3: Helm Chart
- [ ] `helm lint charts/openclaw/` passes
- [ ] Gateway Deployment has liveness (`/healthz`) and readiness (`/readyz`) probes
- [ ] Agent Worker Deployment has `emptyDir` + LanceDB PVC mounts
- [ ] HPA gated on `hpa.enabled` value
- [ ] Bootstrap Job has correct hook annotations
- [ ] Secrets base64-encoded via `b64enc`
- [ ] NetworkPolicies gated on `networkPolicies.enabled`
- [ ] `values-dev.yaml`: single replicas, no HPA, no NetworkPolicies, MinIO
- [ ] `values-prod.yaml`: managed infra, HPA enabled, NetworkPolicies enabled

### SEC-4: NetworkPolicies
- [ ] Agent Worker: ingress: [] (no inbound traffic)
- [ ] Gateway: egress to infra on 5432/6379 only
- [ ] Infra: ingress only from gateway + agent-worker on DB ports
- [ ] All policies include DNS egress (port 53 UDP+TCP)
- [ ] Gated on `networkPolicies.enabled: true`

### DB-3: Bootstrap Job
- [ ] Admin user created only when `users` table is EMPTY
- [ ] Re-running bootstrap: no duplicate user, no crash
- [ ] S3 seed only uploaded if NOT already present
- [ ] Exit 0 on success, exit 1 on any failure

### DB-4: Migration Script
- [ ] All 5 tables migrated from SQLite to Postgres
- [ ] Type conversions: INTEGER→BOOLEAN, TEXT→UUID, TEXT→TIMESTAMPTZ, TEXT→INET
- [ ] `ON CONFLICT DO NOTHING` on all inserts (re-runnable)
- [ ] Row count verification printed at end

---

## BEFORE MARKING A STORY DONE — FINAL CHECKS

### Code Quality
- [ ] TypeScript: `tsc --noEmit` passes with zero errors
- [ ] No `any` types (strict mode)
- [ ] No `console.log` in production code (use logger)
- [ ] No hardcoded secrets, URLs, or tokens
- [ ] No commented-out code left behind

### Security
- [ ] All user-supplied data passes through parameterized queries (no SQL concat)
- [ ] All token comparisons use `timingSafeEqual`
- [ ] All S3 writes go through `secureWrite` (not `putObject` directly)
- [ ] No secrets in logs (redact before logging)
- [ ] Error messages don't reveal internal stack traces to HTTP clients

### Tests
- [ ] Unit tests written for the story's acceptance criteria
- [ ] Tests run clean: `pnpm test` green
- [ ] Existing tests not broken: run full test suite

### Documentation
- [ ] Any non-obvious decisions commented (why, not what)
- [ ] Env vars added to `.env.example` and `DEPLOY-6 env.ts` lists

### Integration
- [ ] `docker compose up` → story works end-to-end
- [ ] No new warnings in docker compose logs
- [ ] Health checks still green: `curl /healthz` and `curl /readyz`

---

## COMMON MISTAKES TO AVOID

| Mistake | Correct Approach |
|---------|-----------------|
| Using `express.json()` for webhook routes | Use `express.raw()` so rawBody is available for HMAC |
| String equality for token comparison: `token === expected` | Always use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` |
| Calling `putObject` directly in agent worker | Always call `secureWrite(userId, key, content)` |
| SQL query with string concat: `WHERE email = '${email}'` | Always use parameterized: `WHERE email = $1` with `[email]` |
| Logging raw token values | Log only token IDs or hashes — never the raw secret |
| Adding auth middleware before health routes | Register /healthz and /readyz BEFORE authMiddleware |
| Setting Redis key without TTL | Always include `EX` seconds for cache keys |
| agent-command.ts writes to local MEMORY.md in team mode | Skip local writes in team mode; job-processor.ts handles write-back |
| `team_safe` check after plugin code runs | Guard must be called BEFORE any plugin code executes |
| Throwing in write-back (fails the job) | Write-back errors are logged, NOT rethrown |
| forcePathStyle false with MinIO | MinIO requires forcePathStyle: true |
| Ignoring SIGTERM during job processing | Worker must complete in-flight jobs before exit |
