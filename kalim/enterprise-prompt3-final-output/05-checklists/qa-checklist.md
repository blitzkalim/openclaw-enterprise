# QA Checklist — OpenClaw Enterprise

**Project:** OpenClaw Enterprise (Multi-Tenant, Kubernetes)
**Based on:** Design files in `/kalim/enterprise-final-plan/`
**Covers:** All 9 epics, 44 stories, 4 deployment phases

---

## How to Use This Checklist

- Work through each section in order before approving a release gate
- Each checkbox must be physically ticked (or marked N/A with a reason) before sign-off
- Security items are non-waivable — a failing security check blocks release regardless of business pressure
- Record the tester name, date, and environment for every section header
- If a test fails, file a bug with severity before continuing — do not skip and come back

---

## 0. Environment Verification (Run First, Every Release)

**Tester:** _____________ **Date:** _____________ **Env:** dev / staging / prod

### 0.1 Infrastructure Readiness

- [ ] Postgres 16 is reachable and `SELECT 1` returns in < 50ms
- [ ] Redis 7 is reachable and `PING` returns `PONG`
- [ ] S3/MinIO endpoint is reachable and `base/` bucket exists
- [ ] All 7 Postgres tables exist: `workspaces`, `users`, `api_tokens`, `claim_codes`, `workspace_secrets`, `agent_sessions`, `file_hashes`
- [ ] Bootstrap Job completed with exit code 0 (check `kubectl get jobs`)
- [ ] Admin user exists in `users` table with `role = 'admin'`
- [ ] Base seed files present in S3 `base/` prefix
- [ ] All pods are in `Running` state: `gateway`, `agent-worker`, `infra`
- [ ] `kubectl get networkpolicies` shows 3 policies: gateway, agent-worker, infra
- [ ] Health check endpoints respond:
  - [ ] `GET /healthz` → 200 (gateway)
  - [ ] `GET /readyz` → 200 (gateway, after DB+Redis confirmed)
  - [ ] Agent worker metrics port 9090 → 200

### 0.2 Environment Variables Validated

- [ ] `validateEnv()` ran at startup without printing any MISSING lines
- [ ] No `undefined` values printed in gateway startup logs
- [ ] No `undefined` values printed in agent-worker startup logs
- [ ] `JWT_PRIVATE_KEY` is present only in gateway pod (not in agent-worker env)
- [ ] `JWT_PUBLIC_KEY` is present in agent-worker pod
- [ ] `OPENCLAW_QUEUE_SECRET` is identical in gateway and agent-worker (test by sending a job and verifying HMAC passes)
- [ ] `OPENCLAW_COOKIE_SECRET` is set and at least 32 chars
- [ ] `WORKSPACE_MASTER_KEY` is set (for AES-256-GCM workspace secrets)
- [ ] `DATABASE_URL` points to correct Postgres instance for this environment
- [ ] `REDIS_URL` points to correct Redis instance for this environment

### 0.3 Secrets Verified (Staging and Prod Only)

- [ ] No secrets are stored in ConfigMaps (only Secrets)
- [ ] No secrets appear in pod logs (grep startup logs for known secret prefixes)
- [ ] `kubectl get secret openclaw-secrets -o yaml` shows base64-encoded values (not plaintext)
- [ ] Key rotation procedure has been tested at least once in staging

---

## 1. Epic 1: Authentication (AUTH-1 through AUTH-6)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### AUTH-1: JWT Key Management & Password Utilities

- [ ] JWT RS256 private key generates tokens with correct `alg: RS256` header (check with jwt.io)
- [ ] JWT tokens include all required claims: `sub`, `jti`, `workspaceId`, `role`, `iat`, `exp`
- [ ] Token expiry is exactly 15 minutes (verify `exp - iat = 900`)
- [ ] Argon2id hash round-trips: hash a password, verify it succeeds, verify a wrong password fails
- [ ] `hashPassword("correct")` produces different output each call (salt is random)
- [ ] `verifyPassword` does NOT use `===` — confirmed via code review to use Argon2 timing-safe comparison
- [ ] `generateApiToken()` produces tokens with `ocp_` prefix
- [ ] SHA-256 hash of API token can be reproduced deterministically

### AUTH-2: Authentication Middleware

- [ ] Request with valid JWT cookie `oc_session` → authenticated, `req.user` populated
- [ ] Request with valid `Authorization: Bearer ocp_<token>` → authenticated, `req.user` populated
- [ ] Request with legacy gateway token → authenticated (backward compatibility)
- [ ] Request with no credentials → 401 JSON response
- [ ] Request with expired JWT → 401 (not 500)
- [ ] Request with tampered JWT signature → 401 (not 500)
- [ ] Request with revoked JWT JTI (deleted from Redis) → 401
- [ ] Request with non-existent API token hash → 401
- [ ] Rate limit: 5 failed auth attempts in 60 seconds → 429 response
- [ ] Rate limit resets after 60s window passes (test with timer)
- [ ] `timingSafeEqual` is used for token comparison — confirm via code review

### AUTH-3: Login / Logout Routes

- [ ] `POST /api/auth/login` with correct credentials → 200, JWT cookie set, JSON user object returned
- [ ] Cookie flags confirmed: `httpOnly: true`, `secure: true` (staging+prod), `sameSite: strict`
- [ ] `POST /api/auth/login` with wrong password → 401, no cookie set
- [ ] `POST /api/auth/login` with non-existent user → 401, identical response time to wrong password (no user enumeration)
- [ ] `POST /api/auth/logout` → cookie cleared, JWT JTI deleted from Redis
- [ ] After logout, replaying the old cookie → 401
- [ ] Login with SQL injection in email field → 401, no error thrown (parameterized query confirmed)

### AUTH-4: JWKS Endpoint

- [ ] `GET /.well-known/jwks.json` → 200, valid JWKS JSON with `kty: RSA`, `alg: RS256`
- [ ] JWKS endpoint requires no authentication
- [ ] Agent worker can fetch JWKS and verify a JWT token end-to-end
- [ ] JWKS response is cached in Redis for 5 minutes (verify no DB hit on second call within 5min)

### AUTH-5: Redis Session Store

- [ ] Active session key exists in Redis after login: `sess:{jti}` with TTL ~900s
- [ ] Key is deleted on logout
- [ ] Key expires automatically if user does not logout (verify TTL decrements)
- [ ] `revokeAllUserSessions(userId)` deletes all session keys for that user
- [ ] After `revokeAllUserSessions`, existing cookie → 401

### AUTH-6: API Token CRUD

- [ ] `POST /api/tokens` creates token, returns plaintext `ocp_<token>` once only
- [ ] Second call to `GET /api/tokens` does NOT show plaintext token (only `id`, `name`, `createdAt`, `lastUsedAt`)
- [ ] `DELETE /api/tokens/:id` removes token, subsequent API requests with that token → 401
- [ ] User cannot delete another user's token (403)
- [ ] Admin can delete any user's token (200)
- [ ] Token `lastUsedAt` updates on each successful use

---

## 2. Epic 2: Secure File System (FS-1 through FS-5)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### FS-1: S3 Client Configuration

- [ ] S3 client connects to correct endpoint (MinIO in dev, AWS S3 in prod)
- [ ] `forcePathStyle: true` set for MinIO compatibility (verify in dev/staging)
- [ ] `PutObject` succeeds for `users/user_1/test.txt`
- [ ] `GetObject` succeeds and returns correct content
- [ ] `ListObjectsV2` returns expected prefix results

### FS-2: secureRead / secureWrite (SECURITY-CRITICAL)

- [ ] `secureRead("users/user_1/file.txt", 1)` → succeeds
- [ ] `secureRead("users/user_2/file.txt", 1)` → throws (cross-user read blocked)
- [ ] `secureRead("../etc/passwd", 1)` → throws (path traversal blocked)
- [ ] `secureRead("users/user_1/../user_2/file.txt", 1)` → throws (`..` in path blocked)
- [ ] `secureRead("users/user_1//secret", 1)` → throws (double slash blocked)
- [ ] `secureWrite("base/seed.txt", 1, buffer)` → throws (write to `base/` blocked)
- [ ] `secureWrite("users/user_2/file.txt", 1, buffer)` → throws (cross-user write blocked)
- [ ] `secureWrite("users/user_1/file.txt", 1, buffer)` → succeeds
- [ ] Key validation runs BEFORE any S3 API call (confirm via mock test: S3 never called if validation fails)
- [ ] Error message does NOT reveal the S3 key that was attempted

### FS-3: resolveUserFiles (Seed + Scratch)

- [ ] First call for a user copies `base/` files to `users/user_{id}/` (verify S3 destination keys)
- [ ] Second call does NOT re-copy (idempotent — checks existence first)
- [ ] `tmp/` scratch directory is mapped to `emptyDir` in K8s (not S3)
- [ ] `tmp/` files are not persisted across pod restarts (verify by restarting agent-worker pod)

### FS-4: Write-Back (Hash Comparison)

- [ ] File unchanged → no S3 PUT issued (verify S3 PUT count = 0)
- [ ] File changed → S3 PUT issued with new content
- [ ] Append-only log file → S3 PUT replaces entire object (S3 append limitation accepted)
- [ ] Hash comparison uses SHA-256 (not MD5)
- [ ] Old hash stored in `file_hashes` table, new hash written after successful PUT

### FS-5: Attachment Handler

- [ ] WhatsApp media URL fetched with `X-Meta-Bearer` auth header
- [ ] Telegram file fetched via Bot API `getFile` then HTTPS download
- [ ] Downloaded file written to `users/user_{id}/attachments/` via `secureWrite`
- [ ] MIME type validated before saving (no executable extensions: `.sh`, `.exe`, `.py`)
- [ ] File size limit enforced (reject > 20MB)

---

## 3. Epic 3: Agent Integration (AGENT-1 through AGENT-5)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### AGENT-1: BullMQ Worker

- [ ] Worker connects to Redis and picks up jobs from `agent-jobs` queue
- [ ] Worker concurrency matches `AGENT_CONCURRENCY` env var (default 2)
- [ ] `SIGTERM` → worker stops accepting new jobs, completes current job, exits cleanly
- [ ] Graceful shutdown completes within 30s (Kubernetes termination grace period)
- [ ] Failed job retries 3 times with exponential backoff (verify in BullMQ dashboard or Redis)
- [ ] After 3 failures, job moves to `agent-jobs-dlq`
- [ ] DLQ jobs are inspectable (not silently dropped)

### AGENT-2: Job Processor

- [ ] HMAC signature on job payload verified before processing (bad signature → job failed, not processed)
- [ ] `webhookMessageId` dedup: duplicate message → job with same BullMQ jobId → second enqueue is no-op
- [ ] Agent executes with correct user file context (user_1 job cannot read user_2 files)
- [ ] Write-back runs after agent execution completes
- [ ] Reply published to `agent:reply:{channel}:{threadId}` after write-back
- [ ] Job failure does NOT publish a reply (no silent ghost replies)

### AGENT-3: Stream Publisher + WebSocket Relay

- [ ] Streaming tokens published to `agent:stream:{sessionKey}` during generation
- [ ] WebSocket client connected to `/ws` receives stream tokens in real time
- [ ] WebSocket subscriber subscribes only to own `sessionKey` (cross-user isolation)
- [ ] `[DONE]` sentinel published at end of stream
- [ ] WebSocket connection closed cleanly after `[DONE]` received
- [ ] No stream tokens leaked to other connected users (verify with 2 concurrent WebSocket connections)

### AGENT-4: agent-command.ts Patch

- [ ] Patch is gated on `if (team)` parameter — remove `team` from request → old monolith behavior unchanged
- [ ] With `team` present → enterprise job enqueued to BullMQ (not executed inline)
- [ ] Monolith tests still pass (run existing test suite unmodified)
- [ ] No new imports that break monolith when `team` is absent

### AGENT-5: Queue Producer (Gateway)

- [ ] `POST /api/agent/run` enqueues job with HMAC signature
- [ ] Job payload includes `webhookMessageId` as BullMQ jobId
- [ ] HMAC key is `OPENCLAW_QUEUE_SECRET` (same as worker uses for verification)
- [ ] Gateway does NOT wait for agent response (returns 202 immediately)
- [ ] Duplicate `webhookMessageId` from same channel → 200 (accepted, deduplicated in queue)

---

## 4. Epic 4: Channel Routing (CHAN-1 through CHAN-6)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### CHAN-1: WhatsApp Webhook Handler

- [ ] `GET /webhooks/whatsapp` with correct `hub.verify_token` → responds with `hub.challenge`
- [ ] `GET /webhooks/whatsapp` with wrong verify token → 403
- [ ] `POST /webhooks/whatsapp` with valid Meta HMAC → 200, job enqueued
- [ ] `POST /webhooks/whatsapp` with invalid HMAC → 403, job NOT enqueued
- [ ] HMAC computed over raw body buffer (not parsed JSON) — confirm via code review
- [ ] Route uses `express.raw()` middleware (not `express.json()`) — confirm via code review
- [ ] `timingSafeEqual` used for HMAC comparison — confirm via code review
- [ ] WhatsApp re-delivery (same `messages[0].id`) → 200, not re-processed (BullMQ dedup)

### CHAN-2: Telegram Webhook Handler

- [ ] `POST /webhooks/telegram` with correct `X-Telegram-Bot-Api-Secret-Token` → 200
- [ ] `POST /webhooks/telegram` with missing/wrong secret token → 403
- [ ] `update.message.chat.id` used as `threadId`
- [ ] `update.message.message_id` used as `webhookMessageId`
- [ ] Telegram re-delivery (same `message_id`) → 200, not re-processed

### CHAN-3: Claim Code Flow

- [ ] Unknown WhatsApp sender → claim code generated and sent as reply
- [ ] Claim code format: `OC-` + 8 uppercase hex chars (e.g., `OC-A1B2C3D4`)
- [ ] Claim code stored in Redis with 10-minute TTL: `claim:{code}` → `workspaceId:userId`
- [ ] Claim code stored in Postgres `claim_codes` table (for audit)
- [ ] `POST /api/claim/{code}` → links WhatsApp sender to user account
- [ ] Expired claim code (> 10 min) → 404
- [ ] Already-used claim code → 404 (Redis key deleted on use)
- [ ] Valid claim code → user `whatsapp_id` updated, 200 response

### CHAN-4: Reply Sender

- [ ] Agent worker publishes to `agent:reply:{channel}:{threadId}`
- [ ] Reply sender subscribes to `agent:reply:*` pattern
- [ ] Reply received → HMAC signature verified before sending outbound
- [ ] Invalid HMAC on reply → NOT sent to channel (log and discard)
- [ ] WhatsApp reply sent via Meta Graph API `messages` endpoint
- [ ] Telegram reply sent via Bot API `sendMessage` with correct `chat_id`
- [ ] Reply sender retries on network failure (3 attempts, exponential backoff)

### CHAN-5: Rate Limiter

- [ ] Same sender within cooldown window → reply NOT sent twice (NX-based lock)
- [ ] Sliding window: 20 messages per sender per 60 seconds → 21st message → 429 or silent drop
- [ ] Rate limit resets after window expires (verify with timer)
- [ ] Rate limit is per-workspace (user_1 in workspace_A does not affect user_1 in workspace_B)

### CHAN-6: Workspace Secrets

- [ ] WhatsApp app secret stored encrypted in `workspace_secrets` (AES-256-GCM)
- [ ] Decrypted secret available in memory for HMAC verification
- [ ] Telegram bot token stored encrypted in `workspace_secrets`
- [ ] Decrypted token available in memory for outbound API calls
- [ ] In-memory cache used (not re-decrypted on every request)
- [ ] Cache invalidated on secret update
- [ ] `WORKSPACE_MASTER_KEY` rotation: update key → re-encrypt all secrets → verify decryption still works

---

## 5. Epic 5: Security Controls (SEC-1 through SEC-4)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### SEC-1: BullMQ HMAC Signing

- [ ] Job enqueued by gateway has `_hmac` field in payload
- [ ] Agent worker verifies `_hmac` before processing
- [ ] Manually crafted job without `_hmac` → worker throws, job moves to DLQ
- [ ] Manually crafted job with wrong `_hmac` → same result
- [ ] `timingSafeEqual` used for HMAC comparison — code review confirmed
- [ ] HMAC secret is not logged anywhere (grep logs for `OPENCLAW_QUEUE_SECRET` value)

### SEC-2: Redis Pub/Sub Reply Signing

- [ ] Published reply includes `_sig` HMAC field
- [ ] Reply sender verifies `_sig` before sending outbound
- [ ] Unsigned reply (manually published to Redis) → discarded, not sent to channel
- [ ] Wrong signature → same result

### SEC-3: CSRF Protection

- [ ] All state-changing HTML form routes include CSRF token in hidden input
- [ ] `POST` without CSRF token → 403
- [ ] `POST` with tampered CSRF token → 403
- [ ] CSRF token is HMAC of session JTI using `OPENCLAW_COOKIE_SECRET`
- [ ] No separate CSRF table in Postgres (stateless, verify via DB schema)
- [ ] GET requests are not CSRF-protected (idempotent, by design)

### SEC-4: NetworkPolicy

- [ ] From a gateway pod: `curl http://agent-worker:9090` → succeeds (metrics allowed)
- [ ] From an agent-worker pod: `curl http://gateway:3000` → times out (ingress: [] blocks inbound)
- [ ] From infra pod perspective: only gateway and agent-worker IPs can connect on port 5432
- [ ] External pod (e.g., a test pod with no labels) → cannot connect to any internal service
- [ ] NetworkPolicy YAML applied in correct namespace: `kubectl get networkpolicies -n openclaw`

---

## 6. Epic 6: Admin UI & Plugin Controls (PLUGIN-1 through PLUGIN-3)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### PLUGIN-1: Plugin team_safe Guard

- [ ] Plugin with `team_safe: true` in manifest.json → loads successfully
- [ ] Plugin without `team_safe` field → agent-worker startup throws, process exits
- [ ] Plugin with `team_safe: false` → agent-worker startup throws, process exits
- [ ] Plugin file system calls route through `secureRead`/`secureWrite` (not raw `fs`)
- [ ] Plugin cannot read files from `users/user_2/` when running in context of user_1

### PLUGIN-2: User Management Routes (Admin)

- [ ] Admin can list all users: `GET /admin/users` → 200, HTML table
- [ ] Admin can create user: `POST /admin/users` → 201, user appears in list
- [ ] Admin can delete other user: `DELETE /admin/users/:id` → 200
- [ ] Admin cannot delete self: `DELETE /admin/users/{own_id}` → 400
- [ ] Deleting a user revokes all their active sessions (test by logging in as user, deleting them as admin, then using their cookie → 401)
- [ ] Non-admin user accessing `/admin/*` → 403

### PLUGIN-3: Server-Rendered HTML Pages

- [ ] All admin pages render valid HTML (no React, no external CSS CDN)
- [ ] Every form includes `<input type="hidden" name="_csrf" value="...">` 
- [ ] No inline JavaScript `eval()` or `innerHTML` with user data (XSS review)
- [ ] User-supplied data in HTML is HTML-escaped (e.g., `&`, `<`, `>`, `"` escaped)
- [ ] Pages load without external network requests (no Google Fonts, no CDN)

---

## 7. Epic 7: Database Layer (DB-1 through DB-4)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### DB-1: Postgres Schema

- [ ] All 7 tables created: `workspaces`, `users`, `api_tokens`, `claim_codes`, `workspace_secrets`, `agent_sessions`, `file_hashes`
- [ ] All `CREATE TABLE` statements use `IF NOT EXISTS`
- [ ] `ON DELETE CASCADE` present on all foreign keys referencing `users.id`
- [ ] `CHECK` constraints present: `role IN ('admin', 'member', 'guest')`, `channel IN ('whatsapp', 'telegram')`
- [ ] Indexes present on: `users.email`, `api_tokens.hash`, `claim_codes.code`, `workspace_secrets(workspace_id, key_name)`
- [ ] Running migration twice does not fail (idempotent)

### DB-2: Parameterized Query Library

- [ ] `getUserByEmail` with SQL injection in email → no error thrown, returns null (not a row)
- [ ] `getUserByEmail` with valid email → returns camelCase object (not snake_case)
- [ ] All query functions use `$1, $2` placeholders (no string concatenation) — code review confirmed
- [ ] `snake_case` column names mapped to `camelCase` in all returned objects
- [ ] `createApiToken` accepts `hash` field (never accepts raw token — raw token never touches DB)

### DB-3: Bootstrap Script

- [ ] Script runs idempotently (run twice → no error, no duplicate admin user)
- [ ] Admin user created with `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars
- [ ] S3 `base/` seeds uploaded from local `seeds/` directory
- [ ] Bootstrap Job shows `Completed` in `kubectl get jobs`
- [ ] Bootstrap failure → job shows `Failed`, logs visible via `kubectl logs`

### DB-4: SQLite → Postgres Migration

- [ ] Migration script reads from SQLite file, writes to Postgres
- [ ] Boolean columns converted: SQLite `1/0` → Postgres `true/false`
- [ ] Datetime strings converted to Postgres `TIMESTAMPTZ`
- [ ] Existing rows with same primary key: `ON CONFLICT DO NOTHING` (no duplicate key errors)
- [ ] Row count in SQLite matches row count in Postgres after migration
- [ ] Migration is idempotent (run twice → no error)

---

## 8. Epic 8: Kubernetes Deployment (DEPLOY-1 through DEPLOY-6)

**Tester:** _____________ **Date:** _____________ **Env:** _____________

### DEPLOY-1: Docker Compose (Dev)

- [ ] `docker compose up` starts all services without manual intervention
- [ ] `infra` service (Postgres + Redis) passes health checks before `gateway` starts
- [ ] Bootstrap service runs after `infra` is healthy, then exits (`restart: no`)
- [ ] Gateway starts after bootstrap exits
- [ ] `docker compose down && docker compose up` works cleanly (volumes persist data)
- [ ] `.env` file with required vars is documented in `README.md`

### DEPLOY-2: Dockerfiles

- [ ] Gateway Docker image: multi-stage build, final stage is `node:20-slim`
- [ ] Agent worker Docker image: includes `extensions/` and `skills/` directories
- [ ] Both images run as `USER node` (not root)
- [ ] `docker run --user root <image>` would fail (USER node enforced)
- [ ] Image sizes are reasonable: gateway < 500MB, agent-worker < 1GB
- [ ] No secrets baked into images (grep Dockerfile for env var values)

### DEPLOY-3: Helm Chart

- [ ] `helm install openclaw ./helm/openclaw --dry-run` produces valid YAML
- [ ] `helm install openclaw ./helm/openclaw -f values.yaml` → all pods reach `Running`
- [ ] Gateway HPA: CPU > 70% → new pod created (load test to verify)
- [ ] Agent Worker HPA: BullMQ queue depth > 10 → new pod created (enqueue 15 jobs and verify)
- [ ] Bootstrap Job has `helm.sh/hook: post-install` annotation
- [ ] NetworkPolicy resources present in rendered chart
- [ ] `helm upgrade` with new image tag → rolling update with zero downtime

### DEPLOY-4: Health Checks

- [ ] `GET /healthz` returns 200 immediately (no DB dependency)
- [ ] `GET /readyz` returns 200 when DB + Redis are reachable
- [ ] `GET /readyz` returns 503 when DB is unreachable (kill DB container and test)
- [ ] Kubernetes liveness probe on `/healthz` — confirm in pod spec
- [ ] Kubernetes readiness probe on `/readyz` — confirm in pod spec
- [ ] Agent worker metrics endpoint `:9090` responds during job processing

### DEPLOY-5: Gateway Entry Point

- [ ] Route registration order: `express.raw()` on `/webhooks/*` registered BEFORE `express.json()` global middleware
- [ ] Webhook routes receive raw body buffer (not parsed JSON)
- [ ] Non-webhook routes receive parsed JSON body
- [ ] Unhandled exceptions caught and logged (no unhandled promise rejections crashing process)
- [ ] `PORT` env var respected (not hardcoded 3000)

### DEPLOY-6: Environment Validation

- [ ] Starting gateway without `DATABASE_URL` → process exits with code 1
- [ ] Starting gateway without `JWT_PRIVATE_KEY` → process exits with code 1
- [ ] Error message lists ALL missing vars at once (not just the first one)
- [ ] Starting with all required vars → no validation errors in logs
- [ ] Starting agent-worker without `OPENCLAW_QUEUE_SECRET` → process exits with code 1

---

## 9. Regression Test Sign-Off

**Tester:** _____________ **Date:** _____________ **Env:** _____________

Run the full regression suite for every release. Check each area for regressions:

### 9.1 Monolith Backward Compatibility

- [ ] Existing OpenClaw tests pass unmodified (`npm test` in monolith)
- [ ] Single-user (non-team) mode: `POST /api/agent/run` without `team` param → still works inline
- [ ] `session-key-utils.ts` changes do not break existing session key format
- [ ] `plugin-loader.ts` changes: plugins without `team_safe` still load in non-team mode
- [ ] `gateway/auth.ts` changes: existing JWT auth still works (no `team` param required)

### 9.2 Cross-Feature Integration

- [ ] WhatsApp message → claim code issued → code redeemed → follow-up WhatsApp message → agent processes → reply sent to WhatsApp
- [ ] Telegram message → agent processes (no claim required) → reply sent to Telegram
- [ ] Web UI login → WebSocket connected → agent job triggered → streaming tokens appear in browser
- [ ] Admin creates user → user logs in → user triggers agent → files written to user-specific S3 prefix
- [ ] API token created → used in `Authorization: Bearer` → agent job triggered → reply received

### 9.3 Failure Mode Regression

- [ ] Redis goes down during agent job → job fails, retry queued, Redis recovery → job succeeds
- [ ] S3 goes down during write-back → job fails, retry queued (files not corrupted)
- [ ] Postgres goes down → login returns 503, existing sessions still work (JWT-based)
- [ ] Agent worker pod crashes mid-job → BullMQ re-queues job on restart (at-least-once delivery)

---

## 10. Security Review Sign-Off

**Security Reviewer:** _____________ **Date:** _____________ **Env:** staging

All items below are non-waivable. A single unchecked item blocks release.

### 10.1 Injection Prevention

- [ ] SQL: All queries use parameterized statements — zero string concatenation with user input (grep codebase for `+ req.` in query strings)
- [ ] Command injection: No `exec`, `spawn`, `eval` with user-supplied input
- [ ] Path traversal: `secureRead`/`secureWrite` validate key before S3 call — confirmed via unit tests PASS
- [ ] XSS: All HTML output HTML-escaped — no raw `innerHTML` with user data

### 10.2 Authentication Security

- [ ] Timing attack protection: `timingSafeEqual` used in API token comparison, HMAC comparison — grep confirmed
- [ ] User enumeration: Login returns identical response time for bad email vs. bad password (timing test: < 10ms difference)
- [ ] Brute force: Rate limit on `/api/auth/login` confirmed (5 attempts → 429)
- [ ] Session fixation: New JTI generated on every login (not reused)
- [ ] CSRF: All non-GET state-changing routes protected

### 10.3 Authorization Security

- [ ] Horizontal privilege escalation: User A cannot access User B's files (secureRead cross-user test PASS)
- [ ] Vertical privilege escalation: Non-admin cannot access `/admin/*` (403 confirmed)
- [ ] Plugin sandbox: Plugin cannot escape to `base/` or other users' prefixes

### 10.4 Secrets Management

- [ ] No secrets in logs (grep application logs for known secret values)
- [ ] No secrets in Docker images (grep Dockerfiles)
- [ ] No secrets in Helm values.yaml (all secrets in `values.yaml` reference K8s Secrets, not plaintext)
- [ ] Workspace secrets encrypted at rest with AES-256-GCM (verify `workspace_secrets` table has no plaintext)
- [ ] Passwords stored as Argon2id hashes (verify `users` table has no plaintext passwords)

### 10.5 Network Security

- [ ] NetworkPolicy blocks agent-worker inbound (test from gateway pod)
- [ ] NetworkPolicy blocks external pods from reaching infra (test from test pod)
- [ ] TLS enforced on all external endpoints (no HTTP in production)
- [ ] JWKS endpoint only exposes public key (private key never exposed via API)

---

## 11. Performance Acceptance Criteria

**Tester:** _____________ **Date:** _____________ **Env:** staging (load test)

- [ ] Login endpoint: p95 < 300ms under 50 concurrent users
- [ ] Auth middleware: p95 < 5ms overhead (JWT decode + Redis session check)
- [ ] WhatsApp webhook → job enqueued: p95 < 100ms
- [ ] Agent job queue depth: < 50 jobs backlogged under normal load
- [ ] S3 read (seed file, first access): p95 < 2s
- [ ] S3 read (subsequent, from cache): p95 < 200ms (if in-memory cache implemented)
- [ ] WebSocket streaming: first token arrives within 1s of job start
- [ ] Admin user list page: p95 < 500ms for 1,000 users

---

## 12. Channel Integration Verification (Real Bots)

**Tester:** _____________ **Date:** _____________ **Env:** staging (real external APIs)

> These tests require real WhatsApp Business and Telegram bot credentials pointed at the staging environment.

### WhatsApp

- [ ] Meta webhook verification (GET) succeeds with Meta's test tool
- [ ] Send a WhatsApp message from a test phone → message appears in gateway logs
- [ ] First-time sender → claim code sent as WhatsApp reply
- [ ] Claim code redeemed via web UI → follow-up WhatsApp message → agent reply received on phone
- [ ] Send duplicate message (Meta re-delivery simulation) → only one reply received

### Telegram

- [ ] Set webhook URL on BotFather bot → `getWebhookInfo` shows correct URL
- [ ] Send Telegram message from test account → message appears in gateway logs
- [ ] Agent reply sent back to correct Telegram chat

---

## 13. Rollback Verification

**Tester:** _____________ **Date:** _____________ **Env:** staging

- [ ] `helm rollback openclaw` to previous release → all pods restart to previous image
- [ ] Previous release: login, send message, receive agent reply all work
- [ ] Database schema is forward-compatible (new columns are nullable or have defaults — old code runs against new schema)
- [ ] BullMQ DLQ inspected — no jobs lost during rollback
- [ ] `git revert` of monolith patches: monolith runs in single-user mode correctly

---

## 14. Documentation Review

**Reviewer:** _____________ **Date:** _____________

- [ ] `README.md` updated with: Docker Compose quickstart, required env vars, health check URLs
- [ ] Helm chart `README.md` documents all `values.yaml` keys
- [ ] Bootstrap Job documented: when it runs, what it creates, how to re-run manually
- [ ] API token usage documented for end users
- [ ] Claim code flow documented for workspace admins
- [ ] Secrets rotation procedure documented (JWKS rotation, WORKSPACE_MASTER_KEY rotation)

---

## Release Gate Summary

> Complete this table before each release. All rows must be PASS or N/A with justification.

| Section | Status | Tester | Date | Notes |
|---------|--------|--------|------|-------|
| 0. Environment Verification | | | | |
| 1. Auth | | | | |
| 2. Secure File System | | | | |
| 3. Agent Integration | | | | |
| 4. Channel Routing | | | | |
| 5. Security Controls | | | | |
| 6. Admin UI & Plugins | | | | |
| 7. Database | | | | |
| 8. Deployment | | | | |
| 9. Regression | | | | |
| 10. Security Review | | | | |
| 11. Performance | | | | |
| 12. Channel Integration | | | | |
| 13. Rollback | | | | |
| 14. Documentation | | | | |

**Release approved by:** _________________________ **Date:** _____________

**Release blocked by (if applicable):** _________________________

---

*QA Checklist — OpenClaw Enterprise — v1.0*
*Based on design files in `/kalim/enterprise-final-plan/`*
*Covers 44 stories across 9 epics*
