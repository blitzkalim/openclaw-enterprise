# Test Cases — OpenClaw Enterprise

## Test Architecture

| Layer | Tool | When |
|-------|------|------|
| Unit tests | Vitest / Jest | Each story — test logic in isolation (mocked S3, Redis, DB) |
| Integration tests | Vitest + real Docker deps | Before every PR merge — against Docker Compose |
| E2E tests | Playwright or supertest | Sprint-end smoke tests — full flow in Docker Compose |
| Security tests | Manual + automated | Before each release |
| Load tests | k6 | Before production launch |

---

## 1. AUTHENTICATION TESTS

### AUTH-T1: JWT Sign/Verify Round-Trip

```
GIVEN: RSA 2048-bit key pair (test key, not production)
WHEN: signJwt({ sub: 'u_123', email: 'a@b.com', name: 'Test', wid: null, adm: false }, privateKey)
THEN:
  - Returns a non-empty JWT string
  - JWT has 3 parts (header.payload.signature)
  - verifyJwt(token, publicKey) returns correct payload
  - payload.sub === 'u_123'
  - payload.exp > Date.now() / 1000
  - payload.jti is a valid UUID
```

### AUTH-T2: JWT Expiry Rejection

```
GIVEN: JWT signed with exp = (Date.now() / 1000) - 1 (already expired)
WHEN: verifyJwt(expiredToken, publicKey)
THEN: throws an error (JWTExpired or similar)
AND: error message indicates expiry (not signature failure)
```

### AUTH-T3: JWT Tamper Rejection

```
GIVEN: Valid JWT
WHEN: Flip any byte in the signature section
AND: verifyJwt(tamperedToken, publicKey)
THEN: throws (JWSSignatureVerificationFailed)
```

### AUTH-T4: Login Happy Path

```
GIVEN: User exists with email 'amit@test.com', password 'Test123!'
WHEN: POST /auth/login { email: 'amit@test.com', password: 'Test123!' }
THEN:
  - HTTP 200
  - Body: { user: { id, email, name, isAdmin, workspaceId } }
  - Set-Cookie header present with 'oc_session' HttpOnly SameSite=Lax
  - Redis: GET session:{jti} → exists
  - Postgres: user_sessions row inserted
```

### AUTH-T5: Login Wrong Password

```
GIVEN: User exists
WHEN: POST /auth/login { email: 'amit@test.com', password: 'wrong' }
THEN: HTTP 401 { error: 'invalid credentials' }
AND: Response body DOES NOT include 'User not found' or any user info
NOTE: Same response as non-existent email (no user enumeration)
```

### AUTH-T6: Login Rate Limit

```
GIVEN: Login endpoint with 5/15min rate limit
WHEN: POST /auth/login (wrong password) × 6 from same IP+email
THEN:
  - Attempts 1-5: HTTP 401
  - Attempt 6: HTTP 429 { error: 'Too many login attempts' }
  - Redis: rl:login:{ip}:{email} counter = 6
  - Redis: TTL on that key ≈ 900 seconds
```

### AUTH-T7: Session Revocation

```
GIVEN: User logged in, valid JWT cookie, session in Redis
WHEN: POST /auth/logout
THEN:
  - HTTP 204
  - Cookie cleared in response
  - Redis: session:{jti} key DELETED
  - Postgres: user_sessions row DELETED
VERIFY: GET /auth/me with the old cookie → HTTP 401 "session revoked"
```

### AUTH-T8: API Token Auth

```
GIVEN: API token 'ocp_<rawtoken>' in api_tokens table
WHEN: GET /auth/me with Authorization: Bearer ocp_<rawtoken>
THEN:
  - HTTP 200 with user data
  - Redis: api_token:{hash} cached after first lookup
  - Second request: served from Redis cache (no DB hit)
```

### AUTH-T9: API Token Deletion Invalidates Cache

```
GIVEN: Valid API token, cached in Redis
WHEN: DELETE /team/tokens/:id
THEN:
  - HTTP 204
  - Postgres row deleted
  - Redis: api_token:{hash} key DELETED
VERIFY: GET /auth/me with old token → HTTP 401 immediately
```

### AUTH-T10: Legacy Gateway Token

```
GIVEN: OPENCLAW_GATEWAY_TOKEN=test-legacy-token in env
WHEN: GET /auth/me with Authorization: Bearer test-legacy-token
THEN:
  - HTTP 200
  - Response: { userId: 'admin', isAdmin: true, source: 'legacy' }
```

---

## 2. FILE SYSTEM TESTS

### FS-T1: First-Time User File Resolution

```
GIVEN: User 'new-user-uuid' has no files in S3
AND: base/SOUL.md exists in S3
WHEN: resolveUserFiles('new-user-uuid')
THEN:
  - S3: users/user_new-user-uuid/SOUL.md created (copy of base/SOUL.md)
  - S3: users/user_new-user-uuid/AGENTS.md created (copy of base/AGENTS.md)
  - S3: users/user_new-user-uuid/MEMORY.md created (empty)
  - S3: users/user_new-user-uuid/USER.md created (empty)
  - S3: users/user_new-user-uuid/TASKS.md created (empty)
  - Local: /tmp/agent-scratch/new-user-uuid/SOUL.md exists with base content
  - Returns UserFiles with correct absolute paths
```

### FS-T2: Existing User File Resolution (No Re-Seed)

```
GIVEN: User 'existing-uuid' already has SOUL.md in S3 (with custom content)
WHEN: resolveUserFiles('existing-uuid')
THEN:
  - S3 SOUL.md NOT overwritten (headObject returns true → skip copy)
  - Local /tmp/agent-scratch/existing-uuid/SOUL.md contains custom content (not base)
```

### FS-T3: secureRead — Own Files (Allowed)

```
GIVEN: users/user_abc/SOUL.md exists in S3 with content 'My Soul'
WHEN: secureRead('abc', 'users/user_abc/SOUL.md')
THEN: Returns 'My Soul'
```

### FS-T4: secureRead — Cross-User (Blocked)

```
GIVEN: users/user_xyz/MEMORY.md exists in S3
WHEN: secureRead('abc', 'users/user_xyz/MEMORY.md')
THEN: throws SecureFsViolationError
AND: error message contains 'outside user and base prefix'
AND: S3 GetObject is NOT called
```

### FS-T5: secureRead — Base Files (Allowed)

```
GIVEN: base/SOUL.md exists in S3
WHEN: secureRead('abc', 'base/SOUL.md')
THEN: Returns base/SOUL.md content (read-only access allowed)
```

### FS-T6: secureWrite — Base Files (Blocked)

```
GIVEN: base/SOUL.md exists in S3
WHEN: secureWrite('abc', 'base/SOUL.md', 'malicious content')
THEN: throws SecureFsViolationError
AND: error message contains 'writes to base/ forbidden'
AND: S3 PutObject is NOT called
```

### FS-T7: Path Traversal Prevention

```
Test cases:
  secureRead('abc', 'users/user_abc/../../../etc/passwd')
  → throws SecureFsViolationError 'path traversal detected'
  
  secureRead('abc', 'users/user_abc//secret')
  → throws SecureFsViolationError 'path traversal detected'
  
  secureWrite('abc', 'users/user_abc/../../admin/secrets', 'evil')
  → throws SecureFsViolationError
```

### FS-T8: MEMORY.md Append and Cap

```
GIVEN: users/user_abc/MEMORY.md contains 7900 bytes
WHEN: secureWrite('abc', 'users/user_abc/MEMORY.md', '500 bytes of new content', { append: true, memoryCap: 8192 })
THEN:
  - Combined content would be 8400 bytes
  - Oldest lines trimmed until content ≤ 8192 bytes
  - New content (recent lines) preserved
  - S3 PutObject called with trimmed content
```

---

## 3. AGENT INTEGRATION TESTS

### AGENT-T1: BullMQ Job Enqueue and Dequeue

```
GIVEN: Redis running, 'agent-jobs' queue empty
WHEN: enqueueAgentJob({ userId: 'u1', sessionKey: 'u:u1:wa:+91', text: 'hello', ... })
THEN:
  - BullMQ: 1 job in 'agent-jobs' queue
  - Job data includes _sig HMAC field
  - jobId matches webhookMessageId (if provided)
```

### AGENT-T2: Job Dedup

```
GIVEN: Same webhookMessageId enqueued twice
WHEN: enqueueAgentJob({ ..., webhookMessageId: 'wamid.abc' }) × 2
THEN:
  - BullMQ queue has exactly 1 job (not 2)
  - Second enqueue returns same jobId as first
```

### AGENT-T3: HMAC Signature Verification

```
GIVEN: Valid job with correct _sig
WHEN: verifyJobSignature(job.data)
THEN: No error thrown

GIVEN: Job with tampered payload (userId changed) but original _sig
WHEN: verifyJobSignature(job.data)
THEN: throws Error 'Job signature mismatch'

GIVEN: Job with missing _sig
WHEN: verifyJobSignature(job.data)
THEN: throws Error 'Job missing signature'
```

### AGENT-T4: Full Agent Job E2E (Docker Compose)

```
SETUP: docker compose up (all services)
GIVEN: User 'test-user' exists, SOUL.md in S3, WhatsApp identity linked

WHEN: Enqueue job:
  { userId: 'test-user', channel: 'whatsapp', threadId: '+91...', text: 'Hello' }

THEN (within 10s):
  - Job dequeued by agent worker
  - S3: users/user_test-user/SOUL.md downloaded (not reseeded — already exists)
  - agent-command.ts called with TeamCtx
  - LLM response generated
  - MEMORY.md updated in S3
  - Conversation transcript uploaded to S3
  - Reply published to Redis: agent:reply:whatsapp:+91...
  - Gateway receives pub/sub → sends outbound via WhatsApp API (mocked)

VERIFY:
  - Redis pub/sub received reply
  - S3: transcript key exists
  - S3: MEMORY.md updated (if agent appended anything)
  - BullMQ: job status = 'completed'
```

### AGENT-T5: Token Streaming via WebSocket

```
SETUP: docker compose up
GIVEN: Browser connected via WebSocket with valid JWT

WHEN: Client sends { text: 'What is 2+2?' }

THEN:
  - Job enqueued to BullMQ
  - Redis pub/sub: multiple 'token' messages published as LLM generates
  - WebSocket client receives streaming tokens in real-time
  - Final { type: 'done' } message received

TIMING: First token within 1 second of request
```

### AGENT-T6: Worker Graceful Shutdown

```
GIVEN: Agent worker has 2 jobs in progress
WHEN: Send SIGTERM to agent worker process

THEN:
  - Worker stops accepting new jobs
  - Both in-progress jobs complete normally
  - Process exits 0 (not killed mid-job)

VERIFY: BullMQ shows both jobs as 'completed' (not 'failed')
```

---

## 4. CHANNEL ROUTING TESTS

### CHAN-T1: WhatsApp HMAC Verification

```
GIVEN: Workspace has app_secret 'test_secret'
WHEN: POST /webhooks/whatsapp/ws-1
  Body: { "entry": [...] }
  Header: X-Hub-Signature-256: sha256=<correct_hmac>
THEN: HTTP 200, job enqueued

WHEN: Same body with tampered HMAC
THEN: HTTP 401 { error: 'invalid signature' }

WHEN: Body tampered (but original HMAC header)
THEN: HTTP 401 (HMAC mismatch — raw body comparison)
```

### CHAN-T2: Telegram Secret Token

```
GIVEN: Workspace has telegram_secret_token 'test-secret'
WHEN: POST /webhooks/telegram/ws-1
  Header: X-Telegram-Bot-Api-Secret-Token: test-secret
THEN: HTTP 200

WHEN: Wrong secret token header
THEN: HTTP 401

WHEN: Missing secret token header
THEN: HTTP 401
```

### CHAN-T3: Mode A Claim Flow (Happy Path)

```
SETUP:
  User 'amit' logs in, POST /team/identities { channel: 'whatsapp' }
  → Gets claim code OC-XXXXXX
  → Redis: claim:OC-XXXXXX set with 10-min TTL
  → Postgres: channel_claims row created

WHEN: Telegram webhook arrives with text 'claim OC-XXXXXX' from unknown phone +91-98765

THEN:
  - Redis claim found, userId = 'amit'
  - channel_identities row inserted: { user_id: 'amit', channel: 'whatsapp', external_id: '+91-98765' }
  - channel_claims consumed_at set
  - Redis claim:OC-XXXXXX deleted
  - Success reply job enqueued
```

### CHAN-T4: Mode A Claim — Expired Code

```
GIVEN: Claim code with expires_at in the past
WHEN: Webhook with 'claim OC-EXPIRED'
THEN:
  - redeemClaimCode returns 'expired'
  - No channel_identity row created
  - Error reply enqueued to user
```

### CHAN-T5: Mode B — Unknown Sender Dropped

```
GIVEN: Workspace in Mode B (admin-assign only)
WHEN: WhatsApp webhook from unknown phone (not in channel_identities)
THEN:
  - HTTP 200 returned to Meta
  - No job enqueued
  - Log entry: 'unknown sender, mode B, dropping'
```

### CHAN-T6: Mode C — Auto-Create Guest

```
GIVEN: Workspace in Mode C (auto_create_guest_users = true)
WHEN: WhatsApp webhook from unknown phone +91-00000
THEN:
  - User created: { email: 'wa:+91-00000@guest.local', is_admin: false }
  - channel_identity created
  - Job enqueued with new guest userId
  - HTTP 200
```

### CHAN-T7: Channel Reply Sender (WhatsApp)

```
GIVEN: Gateway channel-reply subscriber running
WHEN: redis.publish('agent:reply:whatsapp:+91-98765', JSON.stringify({
  channel: 'whatsapp', threadId: '+91-98765', text: 'Reply!', _sig: valid_sig
}))
THEN:
  - Gateway receives pub/sub message
  - HMAC verified
  - Meta Cloud API called: POST /messages with { to: '+91-98765', text: { body: 'Reply!' } }
```

### CHAN-T8: Reply with Invalid HMAC Dropped

```
GIVEN: Gateway channel-reply subscriber running
WHEN: Publish reply with wrong _sig
THEN:
  - Error logged
  - Meta API NOT called
  - No outbound message sent
```

### CHAN-T9: Sender Rate Limit (1 msg/2s)

```
GIVEN: Sender +91-98765 sent a message 0.5 seconds ago
WHEN: Another webhook from +91-98765
THEN:
  - checkSenderCooldown returns false
  - HTTP 200 returned (no error)
  - Job NOT enqueued (message dropped silently)
  - Redis: rl:msg:+91-98765 key exists with TTL ≈ 1.5s
```

---

## 5. SECURITY TESTS

### SEC-T1: Cross-User File Access Prevention

```
GIVEN: Users 'alice' and 'bob', both have MEMORY.md in S3
WHEN: Agent job processing for 'alice' attempts secureRead('alice', 'users/user_bob/MEMORY.md')
THEN:
  - SecureFsViolationError thrown BEFORE any S3 call
  - Error logged at ERROR level
  - S3 GetObject NOT called
  - Bob's MEMORY.md contents NOT exposed
```

### SEC-T2: base/ Write Protection

```
GIVEN: Agent job for any user
WHEN: secureWrite(userId, 'base/SOUL.md', 'evil content')
THEN:
  - SecureFsViolationError thrown
  - S3 PutObject NOT called
  - base/SOUL.md unchanged
```

### SEC-T3: JWT Revocation (Logout)

```
GIVEN: User logged in, JWT in cookie
WHEN: Admin disables the user (DELETE /team/users/:id)
THEN:
  - Redis: all session:{jti} keys for that user DELETED
  - Postgres: all user_sessions rows deleted
  - Next request with that cookie → HTTP 401 "session revoked"
  - Time to revocation: < 100ms (Redis DEL is O(1))
```

### SEC-T4: Timing-Safe Comparisons

```
Using a timing-analysis tool or manual inspection:
VERIFY: crypto.timingSafeEqual used for:
  - HMAC verification (WebhookSig, JobSig, ReplySig)
  - Legacy gateway token comparison
  - API token comparison (between hash and expected)
  - CSRF token comparison
  - Claim code token comparison
NOT acceptable: token === expected (string equality — timing attack vector)
```

### SEC-T5: SQL Injection Prevention

```
GIVEN: Database query functions in shared/src/db/queries.ts
WHEN: findUserByEmail("' OR '1'='1' --")
THEN:
  - Returns null (no users match)
  - Query uses $1 parameterization
  
WHEN: createUser({ email: "'; DROP TABLE users; --" })
THEN:
  - User created with that literal email (harmless)
  - users table still exists (SQL injection prevented)
```

### SEC-T6: BullMQ Queue Tampering

```
GIVEN: Job in Redis queue with valid _sig
WHEN: Directly edit job data in Redis (change userId to 'admin')
AND: Agent worker processes the job
THEN:
  - verifyJobSignature throws 'Job signature mismatch'
  - Job NOT processed as 'admin' user
  - Job retried (BullMQ marks as failed)
  - After 3 retries: job moves to DLQ
```

### SEC-T7: CSRF Protection

```
GIVEN: User logged in via browser (JWT cookie)
WHEN: POST /team/users without _csrf field
THEN: HTTP 403 { error: 'Invalid CSRF token' }

WHEN: POST /team/users with correct _csrf (signed JTI)
THEN: HTTP 201 (user created)

WHEN: POST /team/users with _csrf from a DIFFERENT session's JTI
THEN: HTTP 403 (wrong JTI → wrong HMAC)
```

### SEC-T8: Webhook Replay Prevention (Dedup)

```
GIVEN: WhatsApp message with id 'wamid.abc123' already processed
WHEN: Meta retransmits the same webhook (same message.id)
THEN:
  - enqueueAgentJob with jobId='wamid.abc123'
  - BullMQ: job already exists with that ID → enqueue is no-op
  - Agent processes message exactly once
```

### SEC-T9: Rate Limit Cross-Replica (Shared Redis)

```
GIVEN: 2 Gateway Pod replicas, shared Redis
WHEN: 3 failed login attempts on Replica 1, then 2 more on Replica 2 (same IP+email)
THEN:
  - Replica 2 attempt 5: HTTP 401 (4th attempt total)
  - Replica 2 attempt 6: HTTP 429 (rate limit hit — shared Redis counter)
NOTE: In-memory counters would fail this test (each replica has count=2, not 5)
```

### SEC-T10: S3 Key Prefix Scoping

```
GIVEN: IAM policy: agent-worker has PutObject only on users/* (not base/*)
WHEN: Agent code attempts secureWrite(userId, 'base/SOUL.md', content)
THEN:
  - First layer: validateS3WriteKey throws (app-level check)
  - If somehow bypassed: S3 IAM policy denies PutObject (infrastructure check)
  - Defense in depth: two layers protect base/
```

---

## 6. FAILURE SCENARIOS

### FAIL-T1: Redis Unavailable (Gateway)

```
GIVEN: Redis is down
WHEN: POST /auth/login (valid credentials)
THEN:
  - Login returns HTTP 503 (or 500)
  - Error logged: Redis connection failed
  - No session created (login failed gracefully — not 500 crash)
```

### FAIL-T2: Redis Unavailable (Agent Worker)

```
GIVEN: Agent worker running, Redis goes down mid-job
WHEN: BullMQ tries to publish stream token
THEN:
  - Redis publish throws
  - Error logged
  - Job continues (streaming failure is non-fatal)
  - After job completes: reply publication fails → logged, not rethrown
  - Job marked complete (streaming failure doesn't cause retry)
```

### FAIL-T3: S3 Unavailable (Agent Worker)

```
GIVEN: S3/MinIO is down
WHEN: Agent worker dequeues job, calls resolveUserFiles()
THEN:
  - S3 GetObject throws
  - resolveUserFiles throws
  - processJob re-throws (S3 error = retry appropriate)
  - BullMQ retries with exponential backoff (2s, 4s, 8s)
  - After 3 failures: job moves to DLQ
```

### FAIL-T4: Attachment Download Failure

```
GIVEN: WhatsApp sends a document message
WHEN: Meta file download URL returns 404 (file expired)
THEN:
  - downloadWhatsAppAttachment returns null
  - Job enqueued WITHOUT attachment
  - Log: 'Failed to download attachment, proceeding without'
  - Agent processes text portion of message normally
```

### FAIL-T5: Agent LLM API Error

```
GIVEN: LLM API (OpenAI) returns 429 (rate limit)
WHEN: Agent processes a job
THEN:
  - Agent throws error
  - processJob re-throws
  - BullMQ retries
  - After 3 failures: job in DLQ
  - Admin sees failed job in /team/admin/dlq
```

### FAIL-T6: Webhook Signature Verification When Secret Not Configured

```
GIVEN: WhatsApp webhook arrives for workspace with no app_secret configured
WHEN: POST /webhooks/whatsapp/ws-1
THEN:
  - getWorkspaceSecret returns empty string
  - HMAC check: compare(computed, '') → FAILS (empty != real sig)
  - HTTP 401 returned
  - Log: 'Workspace app_secret not configured for ws-1'
  - No job enqueued
```

### FAIL-T7: Claim Code Race Condition

```
GIVEN: Same claim code 'OC-ABC123' used simultaneously by two webhook requests
WHEN: Both requests call redeemClaimCode concurrently
THEN:
  - First request: inserts channel_identity successfully, marks consumed
  - Second request: channel_identities INSERT fails (UNIQUE constraint on channel+external_id)
    OR channel_claims UPDATE finds consumed_at already set
  - Only ONE channel_identity row created
  - No duplicate identity linking
```

---

## 7. EDGE CASES

### EDGE-T1: Very Long Message Text

```
GIVEN: WhatsApp message with 4096-character text
WHEN: Webhook processed
THEN:
  - Job enqueued with full text
  - No truncation at webhook level
  - Agent handles as normal (LLM has context limits, not us)
```

### EDGE-T2: Multiple Messages in One Webhook

```
GIVEN: Meta sends a batch webhook with 3 messages in one POST
WHEN: POST /webhooks/whatsapp/:wsId with entries array length 3
THEN:
  - 3 jobs enqueued (one per message)
  - Each has unique webhookMessageId
  - HTTP 200 returned
```

### EDGE-T3: MEMORY.md Starts Empty

```
GIVEN: New user, MEMORY.md is empty (0 bytes)
WHEN: Agent runs, appends new memory entry
THEN:
  - No error on empty file read
  - Content after: just the new entry (no leading newlines)
  - S3 updated successfully
```

### EDGE-T4: Concurrent Same-User Jobs

```
GIVEN: Two webhooks arrive 10ms apart from same user
WHEN: Both processed by same worker (sequential in same BullMQ concurrency slot)
THEN:
  - Both processed without collision
  - S3 writes are sequential (second job reads fresh S3 content)

WHEN: Both processed by different worker replicas (parallel)
THEN:
  - Second write may overwrite first MEMORY.md (last-write-wins at this scale)
  - This is acceptable per design (< 10 users, low concurrency)
```

### EDGE-T5: Base Files Missing from S3

```
GIVEN: MinIO newly provisioned, base/SOUL.md not yet uploaded
WHEN: First job arrives, resolveUserFiles() called
THEN:
  - headObject('base/SOUL.md') returns false
  - Empty SOUL.md created for user (no crash)
  - Log: 'base/SOUL.md not found in S3, creating empty user copy'
```

### EDGE-T6: User with Unicode Name/Email

```
GIVEN: User with email 'अमित@example.com' and name 'अमित कुमार'
WHEN: createUser + findUserByEmail + login flow
THEN:
  - All database operations succeed (Postgres TEXT handles Unicode)
  - JWT payload includes Unicode name correctly
  - /auth/me returns Unicode name correctly
```

### EDGE-T7: Telegram chatId as Number vs String

```
GIVEN: Telegram chat.id = 8675309 (number in JSON)
WHEN: channel_identities lookup
THEN:
  - external_id stored as '8675309' (string)
  - threadId in session key = '8675309' (string)
  - Lookup: WHERE channel='telegram' AND external_id='8675309'
  - No type mismatch between number in webhook JSON and string in DB
```

---

## 8. PERFORMANCE / LOAD TESTS

### PERF-T1: Webhook Response Time

```
GIVEN: Full Docker Compose stack
WHEN: k6 sends 100 concurrent WhatsApp webhook requests
THEN:
  - P50 < 50ms
  - P99 < 200ms
  - 0% error rate
  - All jobs enqueued correctly
```

### PERF-T2: Agent Worker Throughput

```
GIVEN: 2 agent worker replicas, BullMQ queue with 20 jobs
WHEN: Workers start processing
THEN:
  - 5 concurrent jobs per replica (concurrency=5)
  - Queue drains in < 60s (10 jobs/s burst)
  - No job failures
```

### PERF-T3: Redis Session Check Latency

```
GIVEN: 1000 pre-created sessions in Redis
WHEN: k6 sends 1000 concurrent GET /auth/me requests with valid JWTs
THEN:
  - P50 JWT validation < 5ms
  - P99 < 20ms
  - Redis EXISTS session:{jti} < 1ms per check
```

### PERF-T4: S3 File Resolution Time

```
GIVEN: User with all 5 overlay files in S3 (MinIO local)
WHEN: resolveUserFiles('user-id') (existing user, no seeding needed)
THEN:
  - 5 parallel S3 GetObject calls
  - Total time < 500ms (MinIO local)
  - Total time < 2s (AWS S3 with network latency)
```

---

## 9. BACKWARD COMPATIBILITY TESTS

### BACK-T1: Single-Process Mode Unchanged

```
GIVEN: OpenClaw monolith running WITHOUT OPENCLAW_TEAM_MODE
WHEN: All existing OpenClaw test suite runs
THEN:
  - ALL existing tests pass
  - No regressions in agent behavior
  - No regressions in tool dispatch
  - No regressions in plugin loading
```

### BACK-T2: Simple Plan Session Keys Preserved

```
GIVEN: Simple plan running with OPENCLAW_TEAM_MODE=1 (in-process mode)
AND: User with existing sessions (session keys without u: prefix)
WHEN: Upgrade to final plan (K8s mode)
THEN:
  - Existing session keys still valid
  - New sessions use u:{userId}:{channel}:{threadId} prefix
  - Vector memory correctly partitioned by session key
```

### BACK-T3: API Token Format Preserved

```
GIVEN: API tokens created in simple plan (ocp_ prefix, SHA-256 hash in SQLite)
WHEN: Migrated to Postgres via migrate-sqlite-to-postgres.ts
THEN:
  - Same tokens work with new system
  - No token re-issue required
  - auth-middleware handles same ocp_ format
```

---

## 10. TEST FILE LOCATION MAP

| Test File | What It Covers |
|-----------|---------------|
| `services/gateway/src/__tests__/auth-middleware.test.ts` | AUTH-T1..T10 |
| `services/gateway/src/__tests__/auth-routes.test.ts` | AUTH-T4..T9 |
| `services/gateway/src/__tests__/channel-router.test.ts` | CHAN-T1..T9 |
| `services/gateway/src/__tests__/channel-claim.test.ts` | CHAN-T3..T4 |
| `services/agent-worker/src/__tests__/secure-fs-s3.test.ts` | FS-T3..T8, SEC-T1..T2 |
| `services/agent-worker/src/__tests__/file-resolver-s3.test.ts` | FS-T1..T2 |
| `services/agent-worker/src/__tests__/job-processor.test.ts` | AGENT-T1..T3 |
| `services/shared/src/__tests__/jwt.test.ts` | AUTH-T1..T3 |
| `services/shared/src/__tests__/db.test.ts` | DB-2 queries, SEC-T5 |
| `services/shared/src/__tests__/hmac.test.ts` | SEC-T3, SEC-T6 |
| `services/shared/src/__tests__/rate-limiter.test.ts` | AUTH-T6, CHAN-T9 |
| `test/e2e/full-flow.test.ts` | AGENT-T4, CHAN-T1+T7 (Docker Compose) |
| `test/e2e/backward-compat.test.ts` | BACK-T1..T3 |
| `test/security/injection.test.ts` | SEC-T4..T5 |
