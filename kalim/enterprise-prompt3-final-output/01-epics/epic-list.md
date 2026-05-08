# Epic List — OpenClaw Enterprise

---

## EPIC 1 — Authentication & Identity Layer

**Goal:** Make auth stateless across multiple Gateway Pod replicas using JWT (RS256) while preserving all three existing credential paths.

**Key deliverables:**
- `services/gateway/src/auth-middleware.ts` — JWT decode + JWKS verify + Redis session check + API token hash lookup + legacy token fallback
- `services/gateway/src/auth-routes.ts` — `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/reset`
- `services/shared/src/crypto/jwt.ts` — `signJwt`, `verifyJwt`, `generateJwks`
- `services/shared/src/crypto/password.ts` — Argon2id hash/verify
- `services/shared/src/redis/session-store.ts` — `getSession`, `setSession`, `deleteSession`
- JWKS endpoint `GET /.well-known/jwks.json`
- JWT key rotation strategy (90-day rotation, 30-day grace)

**Stories:** AUTH-1 through AUTH-6

---

## EPIC 2 — User Overlay File System

**Goal:** Migrate per-user overlay files from local disk to S3/MinIO while maintaining the exact same file semantics and isolation guarantees.

**Key deliverables:**
- `services/agent-worker/src/file-resolver-s3.ts` — S3-backed `resolveUserFiles`: seed from `base/`, download to scratch
- `services/shared/src/s3/client.ts` — S3Client factory
- `services/shared/src/s3/helpers.ts` — `getObject`, `putObject`, `headObject`, `objectExists`
- Per-user S3 prefix: `users/user_{userId}/`
- Base seed: `base/` (read-only, operator-uploaded)
- `tmp/` mapped to `emptyDir` volume (not in S3)

**Stories:** FS-1 through FS-5

---

## EPIC 3 — Agent Runtime Integration

**Goal:** Connect the existing `agent-command.ts` runtime to the BullMQ queue consumer and S3-backed file system, replacing direct HTTP handler invocation with async queue processing.

**Key deliverables:**
- `services/agent-worker/src/index.ts` — BullMQ Worker registration, graceful shutdown
- `services/agent-worker/src/job-processor.ts` — Dequeue → resolve files → build TeamCtx → call agent-command → write back → publish reply
- `services/agent-worker/src/stream-publisher.ts` — LLM token streaming to Redis pub/sub
- `services/gateway/src/ws-relay.ts` — WebSocket ↔ Redis pub/sub relay for browser clients
- Patches to `src/agents/agent-command.ts` (+25 lines) and `src/index.ts` (+5 lines)

**Stories:** AGENT-1 through AGENT-5

---

## EPIC 4 — Channel Routing (WhatsApp / Telegram)

**Goal:** Preserve the complete channel routing system (webhooks, claim flows, outbound replies) with the single architectural change: gateway verifies + enqueues instead of directly calling the agent.

**Key deliverables:**
- `services/gateway/src/channel-router.ts` — HMAC verification, user resolution, BullMQ enqueue
- `services/gateway/src/channel-claim.ts` — Claim code generation (Mode A), Redis + Postgres storage, redemption
- `services/gateway/src/channel-reply.ts` — Redis pub/sub subscriber → outbound WhatsApp/Telegram API
- `services/gateway/src/rate-limiter.ts` — Redis-backed rate limiting (login, webhooks, per-sender)
- Modes A/B/C claim logic

**Stories:** CHAN-1 through CHAN-6

---

## EPIC 5 — Secure File Access Enforcement

**Goal:** Replace filesystem-path-based `secureRead`/`secureWrite` with S3-key-prefix-based validation, maintaining identical security semantics: users can only access their own prefix, `base/` is read-only.

**Key deliverables:**
- `services/agent-worker/src/secure-fs-s3.ts` — `secureRead`, `secureWrite`, `validateS3Key`, `validateS3WriteKey`, `SecureFsViolationError`
- Path traversal detection (`..`, `//` in keys)
- `base/` write blocking
- Cross-user key blocking
- HMAC signing of BullMQ job payloads (queue tampering protection)
- HMAC signing of Redis pub/sub reply messages

**Stories:** SEC-1 through SEC-4

---

## EPIC 6 — Plugin Safety

**Goal:** Enforce the `team_safe` manifest requirement for all plugins loaded in the Agent Worker Pod, and inject a `secureRead`/`secureWrite`-backed `fs` proxy to prevent direct filesystem access.

**Key deliverables:**
- `services/agent-worker/src/plugin-guard.ts` — `assertPluginTeamSafe(manifest)` — rejects plugins without `team_safe: true`
- Patch to `src/plugins/plugin-loader.ts` (+30 lines) — inject fs proxy, call guard
- Plugin fs proxy that intercepts `fs.readFile`, `fs.writeFile`, routes to `secureRead`/`secureWrite`

**Stories:** PLUGIN-1 through PLUGIN-3

---

## EPIC 7 — Admin APIs & UI

**Goal:** Implement the team admin HTTP routes and server-rendered HTML pages for user management, API token management, and channel identity linking.

**Key deliverables:**
- `services/gateway/src/team-routes.ts` — `/team/users` CRUD, `/team/tokens` CRUD, `/team/identities` CRUD
- `services/gateway/src/web/login.html` — Server-rendered login form
- `services/gateway/src/web/team.html` — Server-rendered admin panel (users, tokens, identities, DLQ)
- DLQ admin view (`/team/admin/dlq`)
- CSRF token generation + validation

**Stories:** ADMIN-1 through ADMIN-5

---

## EPIC 8 — Deployment & Config

**Goal:** Package the system for both local development (Docker Compose) and production (Helm chart on Kubernetes) with proper health checks, HPA, NetworkPolicies, and a first-run bootstrap Job.

**Key deliverables:**
- `docker-compose.yml` + `.env.example` — Local dev with Postgres, Redis, MinIO, gateway, agent-worker
- `services/gateway/Dockerfile` — Gateway image (node:22-alpine)
- `services/agent-worker/Dockerfile` — Agent worker image (includes full OpenClaw runtime)
- `charts/openclaw/` — Full Helm chart (gateway, agent-worker, infra, browser-pool, bootstrap Job, NetworkPolicies, HPAs, PVCs)
- `scripts/migrate-sqlite-to-postgres.js` — Migration script from simple plan

**Stories:** DEPLOY-1 through DEPLOY-6

---

## EPIC 9 — Database & Infrastructure (Shared Library)

**Goal:** Build the shared library that both Gateway and Agent Worker use: Postgres schema, migrations, queries, Redis helpers, S3 helpers, crypto utilities, and type definitions.

**Key deliverables:**
- `services/shared/src/db/schema.sql` — Postgres DDL (7 tables)
- `services/shared/src/db/migrate.ts` — Idempotent migration runner
- `services/shared/src/db/queries.ts` — Parameterized query functions
- `services/shared/src/redis/client.ts` — Redis connection factory
- `services/shared/src/types/team-ctx.ts` — `TeamCtx`, `UserFiles`, `AgentJobPayload`, `AgentReplyMessage`
- `services/shared/src/crypto/secrets.ts` — AES-256-GCM for workspace_secrets

**Stories:** DB-1 through DB-4

---

## Epic Priority (Delivery Order)

| Priority | Epic | Reason |
|----------|------|--------|
| P0 | EPIC 9 — Database | Every other service depends on shared lib |
| P0 | EPIC 1 — Auth | Gateway can't do anything without auth |
| P1 | EPIC 2 — File System | Agent Worker depends on S3-backed FS |
| P1 | EPIC 4 — Channel Routing | Core user-facing feature |
| P2 | EPIC 3 — Agent Integration | Connects gateway to agent worker |
| P2 | EPIC 5 — Security | Must be done before hardening phase |
| P2 | EPIC 6 — Plugin Safety | Needed when agent runtime runs in worker |
| P3 | EPIC 7 — Admin UI | Needed for user management |
| P3 | EPIC 8 — Deployment | Needed for production launch |
