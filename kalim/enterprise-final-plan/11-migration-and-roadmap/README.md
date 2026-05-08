# 11 — Migration Path & Implementation Roadmap

## Part A — Migration from Simple Plan to Final Plan

An operator running the simple plan (single EC2, SQLite, local disk) can migrate to the final plan (K8s, Postgres, Redis, S3) **incrementally** — no forklift required.

---

### Migration Steps

| Step | What | Downtime | Risk |
|---|---|---|---|
| 1 | Provision infrastructure (Postgres, Redis, S3/MinIO) | None | None — new infra, no traffic yet |
| 2 | Migrate SQLite → Postgres | 5–10 min | Low — schema is identical, data is small |
| 3 | Migrate local files → S3/MinIO | 5–30 min (depends on data size) | Low — file copy |
| 4 | Deploy Gateway Pod + Agent Worker Pod | 2–5 min | Medium — cut-over moment |
| 5 | Update DNS / Ingress to point to K8s | 1–2 min | Low — DNS TTL |
| 6 | Verify all flows, decommission EC2 | None | None |

### Step 2 — SQLite → Postgres Migration

```bash
# On the EC2 running the simple plan:

# 1. Export SQLite to SQL
sqlite3 ~/.openclaw/team.sqlite .dump > team-dump.sql

# 2. Transform SQLite SQL → Postgres SQL (simple sed/awk for type changes)
#    - INTEGER 0/1 → BOOLEAN
#    - TEXT (uuid) → UUID
#    - TEXT (ISO) → TIMESTAMPTZ
#    Or use the migration script:
node scripts/migrate-sqlite-to-postgres.js \
  --sqlite ~/.openclaw/team.sqlite \
  --postgres postgres://openclaw:pass@pg-host:5432/openclaw

# 3. Verify row counts
psql -c "SELECT 'users', count(*) FROM users
         UNION ALL SELECT 'sessions', count(*) FROM user_sessions
         UNION ALL SELECT 'tokens', count(*) FROM api_tokens
         UNION ALL SELECT 'identities', count(*) FROM channel_identities;"
```

The migration script is ~100 lines: read each SQLite table, transform types, insert into Postgres.

### Step 3 — Local Files → S3/MinIO Migration

```bash
# Upload base/ directory
aws s3 sync ~/.openclaw/workspace/base/ s3://openclaw-workspace/base/

# Upload all user directories
aws s3 sync ~/.openclaw/workspace/users/ s3://openclaw-workspace/users/

# Verify
aws s3 ls s3://openclaw-workspace/base/
aws s3 ls s3://openclaw-workspace/users/ --recursive | head -20
```

For MinIO, use `mc` (MinIO Client) instead of `aws` CLI with the same commands.

### Step 4 — Deploy K8s Pods

```bash
# Generate JWT keys (one-time)
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem

# Create K8s secrets
kubectl create secret generic openclaw-secrets \
  --from-literal=database-url='postgres://openclaw:pass@pg:5432/openclaw' \
  --from-literal=redis-url='redis://:pass@redis:6379' \
  --from-literal=gateway-token='<existing OPENCLAW_GATEWAY_TOKEN>' \
  --from-literal=cookie-secret='<existing OPENCLAW_COOKIE_SECRET>' \
  --from-literal=queue-secret='<generate random 32 bytes>' \
  --from-literal=secrets-key='<generate random 32 bytes>' \
  --from-file=jwt-private=jwt-private.pem \
  --from-file=jwt-public=jwt-public.pem

# Install Helm chart
helm install openclaw charts/openclaw/ \
  -f charts/openclaw/values-prod.yaml \
  --set gateway.env.OPENCLAW_PUBLIC_BASE_URL=https://oc.example.com
```

### Rollback Plan

If anything fails after cut-over:
1. Point DNS back to EC2
2. The EC2 still has the original SQLite + local files
3. The simple plan's OpenClaw process can be restarted immediately
4. No data loss — the migration is a **copy**, not a move

### Session Continuity

- **Cookie sessions:** Users must re-login after migration. SQLite sessions are not migrated to Redis. JWT cookies issued by the new Gateway Pod replace the old cookie sessions.
- **API tokens:** Migrated from SQLite to Postgres in Step 2. Work immediately — they are hash-based lookups, no token re-issue needed.
- **Channel identities:** Migrated in Step 2. Webhooks continue to resolve correctly.
- **Agent memory:** Migrated in Step 3. MEMORY.md, SOUL.md, AGENTS.md carry over.

---

## Part B — Implementation Roadmap

### Phase 0 — Foundation (Week 1–2)

| Deliverable | Details | Dependencies |
|---|---|---|
| `services/shared/` library | Postgres schema + migrate, Redis client, S3 client, JWT sign/verify, Argon2id, types | None |
| Docker Compose for local dev | Postgres, Redis, MinIO, gateway, agent-worker | `services/shared/` |
| CI pipeline | Build + test for shared, gateway, agent-worker | Docker Compose |

**Exit criteria:** `docker compose up` starts all services; `pnpm test` passes for shared library.

### Phase 1 — Gateway Pod (Week 2–4)

| Deliverable | Details | Dependencies |
|---|---|---|
| `services/gateway/` HTTP server | Express/Fastify, health checks, JWKS endpoint | `services/shared/` |
| Auth routes | `/auth/login`, `/logout`, `/me` — JWT issuance, Redis session, Argon2id | `services/shared/crypto/` |
| Team admin routes | `/team/users`, `/team/tokens`, `/team/identities` — Postgres CRUD | `services/shared/db/` |
| Login + Team HTML pages | Server-rendered, no React | None |
| Webhook receivers | `/webhooks/whatsapp/:wsId`, `/webhooks/telegram/:wsId` — verify + enqueue | `services/shared/redis/` |
| Channel reply sender | Redis pub/sub subscriber → outbound WhatsApp/Telegram API | `services/shared/redis/` |
| Rate limiter | Redis-backed sliding window + token bucket | `services/shared/redis/` |
| WebSocket relay | WS ↔ Redis pub/sub for browser agent streaming | `services/shared/redis/` |

**Exit criteria:** Can login via browser, create users, link channel identity (claim flow), enqueue a webhook job to BullMQ. Outbound reply sender works.

### Phase 2 — Agent Worker Pod (Week 4–6)

| Deliverable | Details | Dependencies |
|---|---|---|
| `services/agent-worker/` BullMQ consumer | Dequeue jobs, process, mark complete | `services/shared/redis/` |
| S3-backed file resolver | `resolveUserFiles` against S3/MinIO: seed from `base/`, download to scratch | `services/shared/s3/` |
| S3-backed Secure FS | `secureRead`, `secureWrite`, `validateS3Key`, `validateS3WriteKey` | `services/shared/s3/` |
| Agent runtime integration | Call `agent-command.ts` with TeamCtx, stream tokens to Redis pub/sub | OpenClaw monolith patches |
| Plugin guard | `assertPluginTeamSafe` at worker boot | None |
| Memory write-back | Upload updated MEMORY.md, USER.md, TASKS.md to S3 after agent execution | `services/shared/s3/` |

**Exit criteria:** End-to-end flow works: login → send WhatsApp message → webhook → gateway enqueues → agent worker dequeues → LLM call → reply published → gateway sends outbound → user sees reply.

### Phase 3 — Kubernetes Deployment (Week 6–7)

| Deliverable | Details | Dependencies |
|---|---|---|
| Helm chart | Templates for all Pods, Services, HPAs, PVCs, Secrets, ConfigMaps, NetworkPolicies | Phase 1 + 2 complete |
| Dockerfiles | Gateway, Agent Worker, Browser Pool (optional) | Phase 1 + 2 complete |
| Bootstrap Job | Schema migration + admin user creation + `base/` upload | `services/shared/db/` |
| HPA configuration | Gateway on CPU, Agent Worker on queue depth | Metrics server or KEDA |
| NetworkPolicy | Restrict inter-Pod communication | None |
| Health checks | `/healthz`, `/readyz` for gateway; BullMQ health for worker | Phase 1 + 2 |

**Exit criteria:** `helm install` deploys all Pods; all health checks green; end-to-end flow works in K8s cluster.

### Phase 4 — Hardening + Browser Pool (Week 7–8)

| Deliverable | Details | Dependencies |
|---|---|---|
| BullMQ job signing | HMAC on job payloads | `services/shared/crypto/` |
| Redis pub/sub signing | HMAC on reply messages | `services/shared/crypto/` |
| Inter-Pod TLS | Postgres SSL, Redis TLS, S3 HTTPS | Infrastructure |
| Browser Pool Pod (optional) | gRPC server + Playwright pool + agent worker client | Phase 2 |
| Migration script | SQLite → Postgres, local files → S3 | Phase 3 |
| Monitoring | Prometheus metrics, structured logging, health dashboards | Phase 3 |
| Documentation | Operator guide, upgrade path, troubleshooting | All phases |

**Exit criteria:** Security review passes. Migration from simple plan tested. Monitoring dashboard live.

---

### Timeline Summary

| Phase | Weeks | Deliverable | Pods Active |
|---|---|---|---|
| 0 — Foundation | 1–2 | Shared library, Docker Compose, CI | Local dev only |
| 1 — Gateway | 2–4 | Gateway Pod fully functional | Gateway + Infra |
| 2 — Agent Worker | 4–6 | Agent Worker Pod fully functional | Gateway + Agent Worker + Infra |
| 3 — K8s Deployment | 6–7 | Helm chart, Dockerfiles, bootstrap | All Pods in K8s |
| 4 — Hardening | 7–8 | Security, monitoring, migration, browser pool | All Pods + optional Pod 4 |

**Total: ~8 weeks, 1–2 engineers.**

Compare: simple plan = 4 weeks, 1 engineer. The additional 4 weeks cover service extraction, queue integration, S3 adapter, Helm chart, and security hardening.

---

### What Can Be Cut to Ship Faster

| Cut | Saves | Impact |
|---|---|---|
| Skip Browser Pool (Pod 4) | 1 week | Browser runs in-process in agent worker |
| Skip BullMQ job signing | 2 days | Rely on NetworkPolicy only for queue security |
| Skip Redis pub/sub signing | 2 days | Rely on NetworkPolicy only for reply security |
| Use shared PVC instead of S3/MinIO | 3 days | `secureRead`/`secureWrite` use filesystem (like simple plan) instead of S3 SDK |
| Use Docker Compose instead of Helm | 1 week | Deploy on a single VM with Compose; add Helm later |

**Minimum viable K8s deployment: ~6 weeks** (cut Pod 4, signing, use shared PVC, ship Helm).
