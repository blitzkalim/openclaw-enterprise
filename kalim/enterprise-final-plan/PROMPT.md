# Enterprise Final Plan — Generation Prompt

## Goal

Produce a Kubernetes-deployable architecture plan for OpenClaw multi-user + multi-channel (WhatsApp + Telegram), constrained to **3–4 Pods maximum**. Preserve 100% of the functional requirements from `/kalim/enterprise-simple-plan/`. Only the deployment topology changes.

## Source Requirements (Read First)

Ingest every file under `/kalim/enterprise-simple-plan/` (sections 00–13). Capture:
- User + Workspace model, `is_admin`, invite flows, per-user overlay files
- Auth: cookie session, API token (`ocp_`), legacy gateway token, Secure FS
- Channel routing: Telegram + WhatsApp webhooks, `channel_identities`, claim modes A/B/C
- Agent reuse, session-key prefix `u:<userId>:`, per-user file injection, memory isolation
- DB schema: users, workspaces, user_sessions, api_tokens, channel_identities, channel_claims
- Security: user isolation, webhook verification, path traversal prevention, plugin guard

**Rule:** Every feature, security property, and data flow must be preserved. Only topology changes.

## Pod Constraint: 3–4 Pods Maximum

Do NOT decompose into 8+ microservices. The design must fit in 3–4 Kubernetes Pods:

| Pod | Contains | Scales |
|-----|----------|--------|
| **Pod 1 — API Gateway** | HTTP/WS entry, auth middleware (JWT validation), rate limiting, static UI, team admin routes, webhook receivers (WhatsApp + Telegram signature verification) | HPA on request rate |
| **Pod 2 — Agent Worker** | OpenClaw agent runtime (LLM orchestration, tool dispatch, streaming), browser automation, file I/O (secureRead/secureWrite against shared storage), plugin execution | HPA on queue depth |
| **Pod 3 — Infrastructure** | Postgres + Redis (or managed services in production) | StatefulSet or managed |
| **Pod 4 (optional) — Browser Pool** | Dedicated Playwright/Puppeteer instances, only if browser automation is heavy enough to justify separation from agent worker | HPA on browser sessions |

## Design Rules

1. **Minimal monolith changes.** Extract services by adding HTTP/gRPC clients where local function calls existed. Do not rewrite `agent-command.ts` internals.
2. **JWT for cross-pod auth.** Auth-service issues JWT (RS256); gateway validates locally via JWKS. Redis for session revocation + rate limits.
3. **Message queue between gateway and agent.** Gateway enqueues inbound messages (from webhooks or UI); agent workers dequeue and process. BullMQ over Redis preferred (already in ecosystem).
4. **Shared storage for per-user files.** S3/MinIO or NFS/PVC replaces `~/.openclaw/workspace/`. `secureRead`/`secureWrite` boundary enforcement moves into the agent worker (or a thin file-store sidecar).
5. **Backward compatibility.** Document migration from simple-plan (single EC2) to this plan. No forklift — incremental path.
6. **Every security property preserved or raised.** Add inter-pod auth, network policies, K8s secrets.

## Output Structure

Write to `/kalim/enterprise-final-plan/`:

```
00-summary/README.md
01-architecture-overview/README.md
02-service-contracts/README.md
03-auth-design/README.md
04-channel-routing/README.md
05-agent-runtime/README.md
06-data-model/README.md
07-kubernetes-deployment/README.md
08-code-change-plan/README.md
09-user-flows/README.md
10-security-model/README.md
11-migration-and-roadmap/README.md
12-risk-watch/README.md
```
