# 08 — Code Change Plan

## Summary

| Category | Deliverables | Approx Lines |
|---|---|---|
| **New: Gateway service** (`services/gateway/`) | HTTP server, JWT auth, webhook handlers, team routes, BullMQ producer, reply sender | ~1,200 |
| **New: Agent Worker service** (`services/agent-worker/`) | BullMQ consumer, S3-backed secureRead/secureWrite, file resolver, plugin guard, agent execution wrapper | ~800 |
| **New: Shared library** (`services/shared/`) | Postgres schema/queries, Redis helpers, S3 adapter, types, SecureFsViolationError | ~400 |
| **New: Browser Pool service** (`services/browser-pool/`) (optional) | gRPC server, Playwright pool manager | ~300 |
| **Patch: OpenClaw monolith** | Same 5 patches as simple plan + queue consumer adapter | ~120 |
| **New: Helm chart** (`charts/openclaw/`) | Templates, values, configmaps, secrets, network policies | ~500 |
| **New: Docker Compose** (local dev) | docker-compose.yml + .env.example | ~80 |
| **Total** | | **~3,400** |

Compare: simple plan = ~1,105 lines. The additional ~2,300 lines come from splitting into services, adding queue/S3 adapters, Helm chart, and Docker Compose.

---

## Repository Structure

```
openclaw/                              ← existing monolith (minimal patches)
  src/
    team/                              ← same overlay as simple plan (patched)
    agents/agent-command.ts            ← patched (+25 lines, same as simple plan)
    gateway/auth.ts                    ← patched (+15 lines, same as simple plan)
    sessions/session-key-utils.ts      ← patched (+5 lines, same as simple plan)
    plugins/plugin-loader.ts           ← patched (+30 lines, same as simple plan)
    index.ts                           ← patched (+5 lines, same as simple plan)

services/                              ← NEW: deployable service packages
  gateway/
    src/
      index.ts                         ← HTTP server entry
      auth-middleware.ts               ← JWT validation + Redis session check
      auth-routes.ts                   ← /auth/login, /logout, /me, /reset
      team-routes.ts                   ← /team/*, user CRUD, token CRUD, identity CRUD
      channel-router.ts                ← /webhooks/whatsapp, /webhooks/telegram
      channel-claim.ts                 ← Claim code generation + redemption
      channel-reply.ts                 ← Redis pub/sub → outbound channel API calls
      ws-relay.ts                      ← WebSocket ↔ Redis pub/sub relay
      rate-limiter.ts                  ← Redis-backed rate limiting
      health.ts                        ← /healthz, /readyz
      web/
        login.html                     ← server-rendered login page
        team.html                      ← server-rendered admin page
    Dockerfile
    package.json
    tsconfig.json

  agent-worker/
    src/
      index.ts                         ← BullMQ worker entry
      job-processor.ts                 ← Dequeue → resolve files → execute agent → write back
      secure-fs-s3.ts                  ← S3-backed secureRead/secureWrite/validateKey
      file-resolver-s3.ts             ← S3-backed resolveUserFiles (seed from base/)
      plugin-guard.ts                  ← assertPluginTeamSafe(manifest)
      stream-publisher.ts             ← Publishes agent tokens to Redis pub/sub
      health.ts                        ← BullMQ health check
    Dockerfile
    package.json
    tsconfig.json

  shared/
    src/
      db/
        schema.sql                     ← Postgres DDL
        migrate.ts                     ← Idempotent migration
        queries.ts                     ← Parameterized query functions
      redis/
        client.ts                      ← Redis connection + helpers
        session-store.ts               ← session:{jti} get/set/del
        rate-limiter.ts                ← Sliding window + token bucket
      s3/
        client.ts                      ← S3Client factory
        helpers.ts                     ← getObject, putObject wrappers
      types/
        team-ctx.ts                    ← TeamCtx, UserFiles, AgentJobPayload types
        errors.ts                      ← SecureFsViolationError
      crypto/
        jwt.ts                         ← JWT sign/verify + JWKS generation
        password.ts                    ← Argon2id hash/verify
        secrets.ts                     ← AES-256-GCM encrypt/decrypt for workspace secrets
    package.json
    tsconfig.json

  browser-pool/                        ← OPTIONAL
    src/
      index.ts                         ← gRPC server entry
      pool-manager.ts                  ← Playwright browser pool
      proto/browser.proto              ← Service definition
    Dockerfile
    package.json

charts/
  openclaw/
    Chart.yaml
    values.yaml
    values-dev.yaml
    values-prod.yaml
    templates/
      ...                              ← (see §07)

docker-compose.yml                     ← Local dev (see §07)
docker-compose.override.yml           ← Dev overrides
.env.example                           ← Template env file
```

---

## Patches to OpenClaw Monolith (Identical to Simple Plan)

The monolith patches are **exactly the same** as the simple plan. The `src/team/` overlay code is reused as-is in both the monolith (for backward compat / single-process mode) and extracted into the service packages (for K8s mode).

| File | Change | Lines | Risk |
|---|---|---|---|
| `src/index.ts` | Call `initTeamModule()` if `OPENCLAW_TEAM_MODE=1` | +5 | Low |
| `src/gateway/auth.ts` | Call `resolveTeamAuth(req)` first; fall through on miss | +15 | Low |
| `src/gateway/server-http.ts` | Mount team routes when team mode on | +10 | Low |
| `src/sessions/session-key-utils.ts` | Prefix key with `u:<userId>:` when team ctx present | +5 | Low |
| `src/agents/agent-command.ts` | Accept `team` ctx; read per-user files; write memory | +25 | Low–Medium |
| `src/plugins/plugin-loader.ts` | Inject secureRead/secureWrite proxy + team_safe check | +30 | Medium |
| `package.json` | Add `better-sqlite3`, `argon2` (monolith deps) | +2 deps | Low |

**Why keep monolith patches?** The monolith continues to work as a single-process deployment (simple plan mode). The K8s services extract the same logic into separate packages. An operator can run either mode:

| Mode | How to run | What's active |
|---|---|---|
| **Simple (single process)** | `OPENCLAW_TEAM_MODE=1 pnpm dev` | Monolith + `src/team/` overlay, SQLite, local disk |
| **K8s (distributed)** | `helm install openclaw charts/openclaw/` | Gateway Pod + Agent Worker Pod + Infra Pod, Postgres, Redis, S3 |

---

## New Files by Service

### Gateway Service (~1,200 lines)

| File | Purpose | Lines |
|---|---|---|
| `services/gateway/src/index.ts` | Express/Fastify HTTP server, route registration, JWKS endpoint | ~100 |
| `services/gateway/src/auth-middleware.ts` | JWT decode + verify (JWKS), Redis session check, API token hash lookup, legacy token check | ~120 |
| `services/gateway/src/auth-routes.ts` | POST `/auth/login` (Argon2 verify, JWT issue, Redis session create), POST `/auth/logout`, GET `/auth/me` | ~150 |
| `services/gateway/src/team-routes.ts` | GET/POST `/team/users`, POST/DELETE `/team/tokens`, POST `/team/identities`, GET `/team` (HTML) | ~250 |
| `services/gateway/src/channel-router.ts` | POST `/webhooks/whatsapp/:wsId`, POST `/webhooks/telegram/:wsId` — verify signature, resolve user, enqueue to BullMQ | ~200 |
| `services/gateway/src/channel-claim.ts` | Claim code generation, Redis + Postgres storage, redemption handler | ~80 |
| `services/gateway/src/channel-reply.ts` | Subscribe to `agent:reply:*` Redis pub/sub, send outbound via WhatsApp/Telegram APIs | ~100 |
| `services/gateway/src/ws-relay.ts` | WebSocket server, subscribe to `agent:stream:{sessionKey}`, relay tokens to client | ~80 |
| `services/gateway/src/rate-limiter.ts` | Redis-backed sliding window (login) + token bucket (webhooks) + cooldown (messages) | ~60 |
| `services/gateway/src/health.ts` | `/healthz`, `/readyz` (Postgres + Redis connectivity check) | ~30 |
| `services/gateway/src/web/login.html` | Server-rendered login form | ~60 |
| `services/gateway/src/web/team.html` | Server-rendered admin panel | ~150 |

### Agent Worker Service (~800 lines)

| File | Purpose | Lines |
|---|---|---|
| `services/agent-worker/src/index.ts` | BullMQ Worker registration, graceful shutdown | ~60 |
| `services/agent-worker/src/job-processor.ts` | Dequeue job → resolve files → build TeamCtx → call agent-command → write back → publish reply | ~200 |
| `services/agent-worker/src/secure-fs-s3.ts` | `secureRead`, `secureWrite`, `validateS3Key`, `validateS3WriteKey`, `SecureFsViolationError` | ~120 |
| `services/agent-worker/src/file-resolver-s3.ts` | S3-backed `resolveUserFiles`: check/seed SOUL.md, AGENTS.md; create empty MEMORY.md, USER.md, TASKS.md; download to local scratch | ~180 |
| `services/agent-worker/src/plugin-guard.ts` | `assertPluginTeamSafe(manifest)` — identical to simple plan | ~30 |
| `services/agent-worker/src/stream-publisher.ts` | Wraps agent output stream → Redis pub/sub publish | ~60 |
| `services/agent-worker/src/health.ts` | BullMQ worker health + S3 head-bucket check | ~30 |

### Shared Library (~400 lines)

| File | Purpose | Lines |
|---|---|---|
| `services/shared/src/db/migrate.ts` | Idempotent Postgres schema migration | ~50 |
| `services/shared/src/db/queries.ts` | `findUserByEmail`, `createSession`, `findApiToken`, `findChannelIdentity`, etc. | ~120 |
| `services/shared/src/redis/client.ts` | Redis connection factory | ~20 |
| `services/shared/src/redis/session-store.ts` | `getSession`, `setSession`, `deleteSession` | ~40 |
| `services/shared/src/s3/client.ts` | S3Client factory from env vars | ~20 |
| `services/shared/src/s3/helpers.ts` | `getObject`, `putObject`, `headObject`, `objectExists` | ~40 |
| `services/shared/src/types/team-ctx.ts` | `TeamCtx`, `UserFiles`, `AgentJobPayload`, `AgentReplyMessage` | ~50 |
| `services/shared/src/types/errors.ts` | `SecureFsViolationError` | ~15 |
| `services/shared/src/crypto/jwt.ts` | `signJwt`, `verifyJwt`, `generateJwks` | ~60 |
| `services/shared/src/crypto/password.ts` | `hashPassword`, `verifyPassword` (Argon2id) | ~20 |
| `services/shared/src/crypto/secrets.ts` | `encryptSecret`, `decryptSecret` (AES-256-GCM) | ~30 |

---

## What We Explicitly Do NOT Change

| File/Area | Why untouched |
|---|---|
| `src/agents/*` (beyond the +25 line patch) | Agent runtime internals, prompt building, tool dispatch — all unchanged |
| `src/channels/*` | Channel binding compiler, allowlists — unchanged |
| `src/plugins/*` (beyond the +30 line patch) | Plugin loader, SDK — unchanged |
| `src/memory/*` | Vector memory — isolated by session-key prefix |
| `src/config/*` | Config IO, JSON5 — unchanged |
| `extensions/*` (all 100+) | Every extension — unchanged |
| `ui/` | React control UI — unchanged |
| `src/cron/*`, `src/flows/*`, `src/skills/*` | Unchanged |

---

## Docker Images (Build Matrix)

| Image | Dockerfile | Base | Contents |
|---|---|---|---|
| `openclaw-gateway` | `services/gateway/Dockerfile` | `node:22-alpine` | Gateway service + shared lib + static UI assets |
| `openclaw-agent-worker` | `services/agent-worker/Dockerfile` | `node:22-alpine` | Agent worker + shared lib + OpenClaw agent runtime |
| `openclaw-browser-pool` | `services/browser-pool/Dockerfile` | `mcr.microsoft.com/playwright:v1.x` | Browser pool gRPC server |

### Agent Worker Image — Special Consideration

The agent worker image must include the **full OpenClaw agent runtime** (`src/agents/`, `src/plugins/`, `extensions/`). This means the agent worker Docker image is built from the OpenClaw monolith root, with the worker entry point replacing the gateway entry point.

```dockerfile
# services/agent-worker/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/skills ./skills
ENV OPENCLAW_TEAM_MODE=1
CMD ["node", "dist/services/agent-worker/src/index.js"]
```

---

## Tests to Add

| Test File | What it asserts |
|---|---|
| `services/gateway/src/__tests__/auth-middleware.test.ts` | JWT validation, API token lookup, legacy token fallback, expired JWT, revoked session |
| `services/gateway/src/__tests__/channel-router.test.ts` | HMAC verification, Telegram secret check, user resolution, BullMQ enqueue, claim flow |
| `services/agent-worker/src/__tests__/job-processor.test.ts` | File resolution from S3, agent execution, memory writeback, reply publish |
| `services/agent-worker/src/__tests__/secure-fs-s3.test.ts` | Path validation, cross-user block, base/ write block, traversal block |
| `services/shared/src/__tests__/db.test.ts` | Schema migration, CRUD operations, cascade deletes |
| `services/shared/src/__tests__/jwt.test.ts` | Sign/verify round-trip, expired token rejection, key rotation |
| Integration: `test/e2e/team-k8s.test.ts` | Full flow: login → enqueue → agent execute → reply (against Docker Compose) |
| Regression: existing OpenClaw test suite | Must pass with `OPENCLAW_TEAM_MODE` unset (backward compat) |
