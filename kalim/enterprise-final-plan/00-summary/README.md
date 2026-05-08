# 00 — Summary

## What We Are Building

A **Kubernetes-deployable, multi-user + channel-routing system** for OpenClaw. Same functional scope as the simple plan — users, WhatsApp, Telegram, per-user agent context — but deployed as **3–4 independent Pods** that scale horizontally.

Not a SaaS platform. Not a fork. A topology upgrade of the simple plan's overlay that replaces "one process, one disk" with "stateless gateway, async agent workers, shared Postgres + Redis + object storage."

## How It Differs from the Simple Plan

| Dimension | Simple Plan | Final Plan |
|---|---|---|
| Deployment | One Node.js process + Docker Compose on one EC2 | 3–4 Kubernetes Pods |
| State | SQLite file on local disk | Postgres + Redis (managed or StatefulSet) |
| File storage | `~/.openclaw/workspace/` on local disk | S3/MinIO or shared PVC |
| Auth | Cookie session in SQLite + in-process lookup | JWT (RS256) + Redis session store + JWKS endpoint |
| Message flow | Webhook → in-process function call → agent | Webhook → message queue (BullMQ/Redis) → agent worker |
| Scaling | Vertical only (bigger EC2) | Horizontal: HPA on gateway, HPA on agent workers |
| Browser automation | In-process Playwright | Separate Pod (optional) or sidecar |
| Code changes | ~1,105 lines in `src/team/` | Same overlay logic, split across Pod boundaries + queue/client adapters |

## What We Preserve (100% from Simple Plan)

- ✅ User + Workspace model with `is_admin` bit
- ✅ Three credential paths: cookie session, API token (`ocp_`), legacy gateway token
- ✅ Per-user overlay files: SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md, uploads/, conversations/, tmp/, tool_cache/, logs/
- ✅ `secureRead`/`secureWrite` path boundary enforcement
- ✅ Channel routing: WhatsApp Meta Cloud + Telegram webhooks
- ✅ Claim modes A (pre-claim), B (admin-assign), C (auto-create guest)
- ✅ Session-key prefix `u:<userId>:<channel>:<threadId>`
- ✅ Plugin `team_safe` manifest guard
- ✅ Webhook signature verification (HMAC-SHA256 / secret-token)
- ✅ Rate limiting, CSRF, Argon2id passwords

## What We Are Explicitly NOT Building

Same exclusions as simple plan:
- ❌ Multi-tenant SaaS, tenant-router middleware, per-tenant schemas
- ❌ RBAC matrices, role hierarchies, custom roles
- ❌ Admin React dashboard
- ❌ WhatsApp multi-provider abstraction
- ❌ Audit logs, billing meter, usage events, license gates
- ❌ Per-user model picking, per-tenant agent configs

## Pod Layout (3–4 Pods)

```
Pod 1 — API Gateway     │ HTTP/WS entry, JWT validation, rate limits,
                         │ webhook receivers, team admin routes, static UI
─────────────────────────┤
Pod 2 — Agent Worker     │ OpenClaw agent runtime, LLM orchestration,
                         │ tool dispatch, secureRead/secureWrite, plugins
─────────────────────────┤
Pod 3 — Infrastructure   │ Postgres + Redis (or managed services)
─────────────────────────┤
Pod 4 — Browser Pool     │ Playwright/Puppeteer (OPTIONAL — only if
         (optional)      │ browser load justifies separation)
```

## One-Sentence Pitch

> **The simple plan's ~1,105-line team overlay, re-topologized into 3–4 Kubernetes Pods — stateless gateway, async agent workers, Postgres + Redis + S3 — preserving every feature, every security property, and the same per-user file isolation model.**

## Output Layout

```
/kalim/enterprise-final-plan/
  PROMPT.md                        ← generation prompt used to create this plan
  00-summary/                      ← this file
  01-architecture-overview/        ← Pod decomposition, data flow, protocols
  02-service-contracts/            ← API specs for gateway ↔ worker ↔ infra
  03-auth-design/                  ← JWT + Redis session store + JWKS
  04-channel-routing/              ← Webhooks in gateway Pod, enqueue to worker
  05-agent-runtime/                ← Agent worker: dequeue, execute, write back
  06-data-model/                   ← Postgres schema, Redis keys, S3 layout
  07-kubernetes-deployment/        ← Helm chart, HPA, PVC, env, secrets
  08-code-change-plan/             ← Exact files changed, new repos/services
  09-user-flows/                   ← Same 3 flows annotated with Pod boundaries
  10-security-model/               ← Threat model, network policies, mTLS
  11-migration-and-roadmap/        ← Simple plan → final plan migration path
  12-risk-watch/                   ← Distributed-topology-specific risks
```
