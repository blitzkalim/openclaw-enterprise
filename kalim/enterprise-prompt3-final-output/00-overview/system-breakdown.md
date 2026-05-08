# System Breakdown — OpenClaw Enterprise (K8s Multi-User)

## What We Are Building

A Kubernetes-deployable, multi-user, channel-routing system on top of the existing OpenClaw agent runtime. The system splits a single Node.js process into 3–4 independent Pods: a stateless API Gateway, async Agent Workers, and a shared Infrastructure Pod (Postgres + Redis), plus optional Browser Pool.

---

## Pod Decomposition

| Pod | Role | Scaling |
|-----|------|---------|
| **Pod 1 — API Gateway** | HTTP/WS entry point, JWT validation, webhook receivers, team admin routes, BullMQ producer, static UI, channel reply sender | HPA on CPU/request rate (2–10 replicas) |
| **Pod 2 — Agent Worker** | BullMQ consumer, agent-command.ts execution, S3-backed file I/O, plugin execution, Redis pub/sub publisher | HPA on queue depth (2–20 replicas) |
| **Pod 3 — Infrastructure** | Postgres 16 + Redis 7 (or managed RDS + Elasticache) | StatefulSet (1 replica + read replicas if needed) |
| **Pod 4 — Browser Pool** | Playwright pool with gRPC API (OPTIONAL) | HPA on active browser sessions (0–5) |
| **S3/MinIO** | Per-user overlay files, base seeds, uploads, transcripts, logs | External (or in-cluster MinIO Deployment) |

---

## Epic Map

| Epic | Name | Pod(s) Affected | Complexity |
|------|------|-----------------|------------|
| **EPIC 1** | Authentication & Identity Layer | Gateway | High |
| **EPIC 2** | User Overlay File System | Agent Worker, S3 | High |
| **EPIC 3** | Agent Runtime Integration | Agent Worker | High |
| **EPIC 4** | Channel Routing (WhatsApp/Telegram) | Gateway | High |
| **EPIC 5** | Secure File Access Enforcement | Agent Worker | Medium |
| **EPIC 6** | Plugin Safety | Agent Worker | Medium |
| **EPIC 7** | Admin APIs & UI | Gateway | Medium |
| **EPIC 8** | Deployment & Config | All Pods | High |
| **EPIC 9** | Database & Infrastructure | Infra Pod, Shared Library | High |

---

## Preserved Features (Non-Negotiable)

- ✅ Three credential paths: JWT cookie, API token (`ocp_`), legacy gateway token
- ✅ Per-user overlay files: SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md, uploads/, conversations/, tmp/, tool_cache/, logs/
- ✅ `secureRead`/`secureWrite` path boundary enforcement (adapted to S3 key prefixes)
- ✅ WhatsApp Meta Cloud + Telegram webhooks
- ✅ Claim modes A (pre-claim), B (admin-assign), C (auto-create guest)
- ✅ Session-key prefix `u:<userId>:<channel>:<threadId>`
- ✅ Plugin `team_safe` manifest guard
- ✅ Webhook HMAC-SHA256 + Telegram secret-token verification
- ✅ Rate limiting (upgraded from in-memory to Redis-backed)
- ✅ Argon2id password hashing
- ✅ CSRF protection (SameSite=Lax + signed CSRF token)

---

## Key Architectural Contracts

### Gateway → Agent Worker
- **Protocol:** BullMQ over Redis (queue: `agent-jobs`)
- **Job payload:** `AgentJobPayload` (userId, sessionKey, channel, text, attachments, replyChannel)
- **Dedup:** `webhookMessageId` as BullMQ jobId
- **DLQ:** `agent-jobs-dlq` after 3 failures

### Agent Worker → Gateway (streaming)
- **Protocol:** Redis Pub/Sub
- **Channels:** `agent:stream:{sessionKey}` (tokens), `agent:reply:{channel}:{threadId}` (final reply)

### Shared Storage
- **Postgres:** Users, sessions, tokens, channel_identities, claims, workspace_secrets
- **Redis:** BullMQ queues, session cache, rate limits, pub/sub, claim codes, API token cache, JWKS cache
- **S3/MinIO:** Per-user overlay files, base seeds, uploads, transcripts, logs

---

## Service Structure

```
services/
  gateway/          ~1,200 lines — HTTP server, auth, webhooks, relay
  agent-worker/     ~800 lines  — BullMQ consumer, S3 FS, plugin guard
  shared/           ~400 lines  — DB, Redis, S3, crypto, types
  browser-pool/     ~300 lines  — gRPC Playwright pool (optional)

charts/openclaw/    ~500 lines  — Helm chart templates
docker-compose.yml  ~80 lines   — Local dev
```

---

## Implementation Phases

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 0 — Foundation | Week 1–2 | `services/shared/`, Docker Compose, CI |
| 1 — Gateway | Week 2–4 | Full Gateway Pod functional |
| 2 — Agent Worker | Week 4–6 | Full Agent Worker Pod functional, E2E flow works |
| 3 — K8s Deployment | Week 6–7 | Helm chart, Dockerfiles, bootstrap Job |
| 4 — Hardening | Week 7–8 | Security, monitoring, migration script, optional Browser Pool |

**Total: 8 weeks, 1–2 engineers.**

---

## Story Count by Epic

| Epic | Stories | Tasks |
|------|---------|-------|
| EPIC 1 — Auth | 6 | 18 |
| EPIC 2 — File System | 5 | 15 |
| EPIC 3 — Agent Integration | 5 | 15 |
| EPIC 4 — Channel Routing | 6 | 18 |
| EPIC 5 — Security | 4 | 12 |
| EPIC 6 — Plugin Safety | 3 | 9 |
| EPIC 7 — Admin APIs & UI | 5 | 15 |
| EPIC 8 — Deployment | 6 | 18 |
| EPIC 9 — Database | 4 | 12 |
| **Total** | **44** | **132** |
