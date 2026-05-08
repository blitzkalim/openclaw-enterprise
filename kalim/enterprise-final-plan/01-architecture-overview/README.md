# 01 — Architecture Overview

## Design Principle: 3–4 Pods, Not 8+ Microservices

The simple plan runs everything in one Node.js process. A naive decomposition would split into 8+ services (auth, channel-router, agent-runtime, file-store, browser-pool, etc.) — each with its own repo, deploy pipeline, and operational burden.

We take a **pragmatic middle path**: group related concerns into 3–4 Pods that can scale independently at the boundaries that actually matter.

---

## Pod Decomposition

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Public Internet                                    │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │  HTTPS :443
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Kubernetes Ingress (nginx-ingress or cloud LB)                          │
│  TLS termination, path-based routing                                     │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│  POD 1 — API GATEWAY    │   │  POD 2 — AGENT WORKER   │
│  (Deployment, HPA)      │   │  (Deployment, HPA)      │
│                         │   │                         │
│  • HTTP/WS server       │   │  • BullMQ consumer      │
│  • JWT validation       │   │  • agent-command.ts     │
│    (JWKS, local verify) │   │    (LLM orchestration)  │
│  • Auth routes           │   │  • Tool dispatch        │
│    (/auth/login,logout)  │   │  • secureRead/Write     │
│  • Team admin routes     │   │    (against S3/MinIO)   │
│    (/team/*)             │   │  • Plugin execution     │
│  • Webhook receivers     │   │  • Memory writes        │
│    (/webhooks/wa,tg)     │   │  • Session management   │
│  • Rate limiting         │   │  • Vector memory ops    │
│  • Static UI serving     │   │                         │
│  • BullMQ producer       │   │  Optional sidecar:      │
│    (enqueue to Redis)    │   │  • Browser automation   │
│  • WebSocket relay       │   │    (Playwright/Puppeteer)│
│    (agent stream→client) │   │                         │
└────────────┬────────────┘   └────────────┬────────────┘
             │                              │
             │     ┌────────────────────┐   │
             └────►│  POD 3 — INFRA     │◄──┘
                   │  (StatefulSet or   │
                   │   managed services)│
                   │                    │
                   │  • Postgres 16     │
                   │    (users, sessions│
                   │     tokens, channel│
                   │     identities)    │
                   │  • Redis 7         │
                   │    (BullMQ queues, │
                   │     session cache, │
                   │     rate limits,   │
                   │     JWKS cache)    │
                   └────────────────────┘

                   ┌────────────────────┐
                   │  POD 4 — BROWSER   │
                   │  (OPTIONAL)        │
                   │                    │
                   │  • Playwright pool │
                   │  • gRPC/HTTP API   │
                   │    for agent worker│
                   │  • Heavy RAM, crash│
                   │    isolated        │
                   └────────────────────┘

                   ┌────────────────────┐
                   │  SHARED STORAGE    │
                   │  (not a Pod)       │
                   │                    │
                   │  • S3 / MinIO      │
                   │    OR              │
                   │  • ReadWriteMany   │
                   │    PVC (NFS/EFS)   │
                   │                    │
                   │  Holds:            │
                   │  • base/ (seeds)   │
                   │  • users/<id>/     │
                   │    (overlay files) │
                   └────────────────────┘
```

---

## Why These 3 Pods (Not More, Not Fewer)

| Boundary | Why it must be separate | Why NOT further split |
|---|---|---|
| **Gateway ↔ Agent Worker** | Gateway is I/O-bound (HTTP, webhooks, WS). Agent worker is CPU/LLM-bound (model calls, tool execution). Different scaling profiles. | Auth, channel-routing, admin routes, and webhook receivers are all lightweight HTTP handlers — putting them in separate Pods adds latency and operational overhead for zero scaling benefit. |
| **Agent Worker ↔ Infrastructure** | Postgres and Redis are stateful; agent workers are stateless consumers. They must survive independently. | Postgres and Redis are co-located in one Pod (or both managed) because they always scale together at this tier. Split only when Postgres needs its own HA cluster. |
| **Browser Pool (optional)** | Browser instances consume 200–500 MB RAM each, crash frequently, and have different lifecycle than agent sessions. | Only needed if browser automation is a core use case. Otherwise, browser runs as a sidecar or in-process in the agent worker Pod. |

### What We Explicitly Do NOT Separate

| Component | Stays inside | Reason |
|---|---|---|
| Auth routes (`/auth/login`, `/auth/logout`) | Gateway Pod | Auth is a few HTTP endpoints; separating into its own service adds a network hop for login with zero benefit at <100 users |
| Channel webhook receivers | Gateway Pod | They are HTTP POST handlers that verify a signature and enqueue a message — same I/O profile as all other gateway routes |
| File I/O (`secureRead`/`secureWrite`) | Agent Worker Pod | File reads happen during agent execution; adding a network call per file read would add latency to every LLM turn |
| Plugin execution | Agent Worker Pod | Plugins run in-process with the agent; extracting to a service would break the plugin SDK contract |

---

## Data Flow Between Pods

### Flow 1 — Inbound Webhook (WhatsApp/Telegram → Agent → Reply)

```
[1] Meta/Telegram → POST /webhooks/{channel}/{wsId}
        │
        ▼
[2] Gateway Pod
        a. Verify webhook signature (HMAC / secret-token)
        b. Look up channel_identities in Postgres → userId
        c. Enqueue job to BullMQ (Redis):
           { userId, workspaceId, channel, threadId, text, attachments }
        d. Return 200 to provider (async processing)
        │
        ▼
[3] Agent Worker Pod (BullMQ consumer)
        a. Dequeue job
        b. Fetch per-user files from S3/MinIO:
           SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md
        c. Build session key: u:<userId>:<channel>:<threadId>
        d. Execute agent-command.ts (LLM call, tool dispatch)
        e. Write updated MEMORY.md, TASKS.md back to S3/MinIO
        f. Enqueue outbound reply to Redis (or call channel API directly)
        │
        ▼
[4] Gateway Pod (or Agent Worker directly)
        → Send reply via existing channel extension send path
        → Reply lands in user's WhatsApp/Telegram
```

### Flow 2 — Browser Login (Human User)

```
[1] User → GET /login (served by Gateway Pod)
[2] User → POST /auth/login { email, password }
        │
        ▼
[3] Gateway Pod
        a. Query Postgres: SELECT * FROM users WHERE email = ?
        b. Verify Argon2id hash
        c. Create session row in Postgres + cache in Redis
        d. Issue JWT (RS256, signed with Pod-local private key)
        e. Set-Cookie: oc_session=<JWT>; HttpOnly; SameSite=Lax; Secure
        │
        ▼
[4] Subsequent requests carry JWT
        → Gateway Pod validates JWT locally (JWKS)
        → No Postgres lookup per request (Redis check only for revocation)
```

### Flow 3 — WebSocket Agent Stream (Real-Time)

```
[1] Browser → WSS /ws?token=<JWT>
        │
        ▼
[2] Gateway Pod
        a. Validate JWT
        b. Enqueue agent job to BullMQ
        c. Subscribe to Redis pub/sub channel: agent:stream:<sessionKey>
        │
        ▼
[3] Agent Worker Pod
        a. Dequeue job, execute agent
        b. As LLM tokens stream, publish to Redis pub/sub: agent:stream:<sessionKey>
        │
        ▼
[4] Gateway Pod receives pub/sub messages → forwards to WebSocket client
```

---

## Protocol Choices

| Communication | Protocol | Why |
|---|---|---|
| Client → Gateway | HTTPS / WSS | Standard web |
| Gateway → Agent Worker | BullMQ over Redis (async queue) | Decouples burst traffic from LLM processing; backpressure built-in |
| Agent Worker → Gateway (streaming) | Redis Pub/Sub | Lightweight, real-time, no persistent connection between pods |
| Gateway → Postgres | TCP (pg driver) | Direct query for auth, user lookup, channel_identities |
| Agent Worker → Postgres | TCP (pg driver) | Session persistence, memory metadata |
| Agent Worker → S3/MinIO | HTTP (S3 API) | Per-user file reads/writes |
| Agent Worker → Browser Pool | gRPC or HTTP (if Pod 4 exists) | Structured browser commands |
| Gateway ↔ Redis | TCP | Session cache, rate limits, BullMQ, pub/sub |

---

## Scaling Profile

| Pod | Scaling trigger | Replicas (typical) | Replicas (peak) |
|---|---|---|---|
| Gateway | Request rate (req/sec) | 2 | 5–10 |
| Agent Worker | Queue depth (pending jobs) | 2 | 10–20 (LLM-bound) |
| Infrastructure | N/A (stateful) | 1 (or managed) | 1 (+ read replicas if needed) |
| Browser Pool | Active browser sessions | 0–1 | 3–5 |

HPA (Horizontal Pod Autoscaler) configurations:

```yaml
# Gateway HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70

# Agent Worker HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: bullmq_queue_depth
          selector:
            matchLabels:
              queue: agent-jobs
        target:
          type: AverageValue
          averageValue: "5"
```

---

## What Each Pod Owns

### Pod 1 — API Gateway

| Concern | Source in simple plan | Location in this plan |
|---|---|---|
| HTTP server | `src/gateway/server-http.ts` | Gateway Pod |
| WebSocket server | `src/gateway/server-ws-runtime.ts` | Gateway Pod |
| Auth middleware | `src/team/auth-middleware.ts` | Gateway Pod (JWT validation) |
| Auth routes | `src/team/auth-routes.ts` | Gateway Pod |
| Team admin routes | `src/team/team-routes.ts` | Gateway Pod |
| Webhook receivers | `src/team/channel-router.ts` | Gateway Pod (verify + enqueue only) |
| Rate limiting | In-memory (simple plan) | Redis-backed (shared across replicas) |
| Static UI | `ui/` | Gateway Pod |

### Pod 2 — Agent Worker

| Concern | Source in simple plan | Location in this plan |
|---|---|---|
| Agent runtime | `src/agents/agent-command.ts` | Agent Worker Pod |
| Tool dispatch | `src/agents/pi-tools.ts` | Agent Worker Pod |
| File resolver | `src/team/file-resolver.ts` | Agent Worker Pod (reads from S3/MinIO) |
| Secure FS | `src/team/secure-fs.ts` | Agent Worker Pod (validates paths, reads/writes S3) |
| Plugin execution | `src/plugins/plugin-loader.ts` | Agent Worker Pod |
| Plugin guard | `src/team/plugin-guard.ts` | Agent Worker Pod |
| Memory writes | `secureWrite` to MEMORY.md | Agent Worker Pod → S3/MinIO |
| Vector memory | LanceDB | Agent Worker Pod (local or shared) |

### Pod 3 — Infrastructure

| Service | Replaces in simple plan | Purpose |
|---|---|---|
| Postgres 16 | `~/.openclaw/team.sqlite` | Users, sessions, tokens, channel_identities, claims |
| Redis 7 | In-memory rate limits | BullMQ queues, session cache, rate limits, pub/sub streaming, JWKS cache |

### Pod 4 — Browser Pool (Optional)

| Concern | Simple plan | This plan |
|---|---|---|
| Browser automation | In-process Playwright | Dedicated Pod with gRPC API |
| Lifecycle | Tied to agent process | Independent — crashes don't kill agents |
| Scaling | N/A | HPA on active browser sessions |
