# Multi-Tenant Architecture

## Design Principle

Keep deployable layers minimal. Do NOT build 20 microservices. Six containers maximum for full production.

## Deployable Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        INGRESS                               │
│  (Nginx / Traefik / Cloudflare / AWS ALB)                   │
│  - TLS termination                                           │
│  - WebSocket proxying                                        │
│  - Rate limiting (L7)                                        │
│  - Static asset caching                                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                     AUTH SERVICE                               │
│  (Node.js / Fastify — separate from gateway)                  │
│  - User registration, login, password reset                   │
│  - JWT issuance (access + refresh tokens)                     │
│  - OAuth handlers (Google, future SSO)                        │
│  - MFA endpoints (TOTP ready)                                 │
│  - Tenant provisioning                                        │
│  - API key management                                         │
│  - Postgres + Redis for sessions                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                  ADMIN UI (React SPA)                          │
│  - Tenant dashboard                                           │
│  - User management                                            │
│  - Agent configuration                                        │
│  - Channel setup wizard                                       │
│  - Billing / usage views                                      │
│  - Analytics                                                  │
│  - Built as separate Vite app, served via Nginx               │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                 GATEWAY API (Modified OpenClaw)              │
│  - All upstream gateway features preserved                   │
│  - Auth replaced with JWT validation middleware              │
│  - Config adapter reads from Postgres per tenant             │
│  - Session store uses Redis (tenant-scoped keys)               │
│  - Channel router resolves tenant from webhook path/header   │
│  - Agent config loaded from tenant_config table              │
│  - Audit logger pushes to Postgres async                     │
│  - Billing meter records usage to Postgres                   │
│  - WebSocket connections carry tenant_id in JWT claim        │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                 WORKER RUNTIME (BullMQ / Bee-Queue)           │
│  - Background job processing                                 │
│  - CRM sync jobs                                             │
│  - Report generation                                         │
│  - Email notifications                                       │
│  - Bulk imports                                              │
│  - Scales independently from gateway                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Postgres   │  │   Redis     │  │   Object Storage    │  │
│  │  (primary)  │  │  (cache/    │  │  (MinIO / S3 / GCS) │  │
│  │             │  │  sessions)  │  │                     │  │
│  │  tenants    │  │             │  │  media files        │  │
│  │  users      │  │  sessions   │  │  documents          │  │
│  │  configs    │  │  queues     │  │  exports            │  │
│  │  audit_logs │  │  rate limit │  │                     │  │
│  │  billing    │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Why Separate Auth Service?

OpenClaw's `src/gateway/auth.ts` is tightly coupled to:
- Single token comparison (`OPENCLAW_GATEWAY_TOKEN`)
- Startup auth resolution (`src/gateway/startup-auth.ts`)
- Device pairing logic
- Tailscale header parsing

Replacing it inline creates high merge conflict risk. A separate Auth Service:
- Issues JWTs with `tenant_id`, `user_id`, `roles[]` claims
- Gateway validates JWT only (stateless)
- Preserves upstream auth logic for backward compatibility mode
- Can be swapped with external IdP later (Keycloak, Authentik)

## Gateway Modification Strategy

### Minimal Changes to Core

| File | Change | Lines |
|------|--------|-------|
| `src/gateway/auth.ts` | Add JWT validation path; fallback to `OPENCLAW_GATEWAY_TOKEN` for single-user mode | +40 |
| `src/gateway/server-http.ts` | Inject `tenantContext` middleware before route dispatch | +20 |
| `src/gateway/server-ws-runtime.ts` | Extract tenant from JWT in WS handshake | +15 |
| `src/config/io.ts` | Add Postgres adapter alongside file adapter; select by `DATABASE_URL` env | +80 |
| `src/sessions/session-store.ts` | Add Redis adapter alongside file store; select by `REDIS_URL` env | +60 |
| `src/agents/agent-command.ts` | Pass `tenant_id` to `resolveAgentRuntimeConfig()` | +10 |
| `src/channels/plugins/configured-binding-compiler.ts` | Filter channels by `tenant_id` from context | +20 |

### New Enterprise Overlay Files

| File | Purpose |
|------|---------|
| `src/enterprise/tenant-context.ts` | Resolve tenant from hostname, path prefix, or JWT claim |
| `src/enterprise/auth-adapter.ts` | JWT validation using Auth Service public key |
| `src/enterprise/db-client.ts` | Knex/Prisma Postgres client with tenant filter helper |
| `src/enterprise/redis-client.ts` | Ioredis client with key prefixing by tenant |
| `src/enterprise/config-adapter.ts` | Read/write tenant config to Postgres `tenant_configs` |
| `src/enterprise/audit-logger.ts` | Async insert to `audit_logs` table |
| `src/enterprise/billing-meter.ts` | Record LLM token usage per tenant |
| `src/enterprise/channel-router.ts` | Route inbound webhooks to tenant by path |

## Communication Patterns

1. **Synchronous (Gateway <-> Auth)**
   - JWT validation: local (public key cached, no network call)
   - Token refresh: gateway redirects to Auth Service
   - User lookup: gateway queries Postgres directly (shared pool)

2. **Asynchronous (Gateway -> Workers)**
   - BullMQ Redis queue
   - Jobs: CRM sync, report generation, bulk operations
   - Gateway enqueues, workers process

3. **Event Streaming (Internal)**
   - Redis Pub/Sub for cross-gateway events (if multiple replicas)
   - Tenant-scoped channels: `events:tenant:{id}`

## Scaling Strategy

### Phase 1: Single Gateway (MVP)
- 1x Gateway container
- 1x Auth Service container
- 1x Postgres, 1x Redis
- Object storage: local volume or MinIO

### Phase 2: Multi-Gateway (10+ tenants)
- 2-3x Gateway containers behind Nginx (sticky sessions for WS)
- Shared Postgres, Redis, Object Storage
- WebSocket balancing: IP hash or tenant-aware routing

### Phase 3: Separated Workers (50+ tenants)
- Gateway: 3-5 replicas
- Workers: 2-5 replicas (scales with queue depth)
- Auth Service: 2 replicas
- Postgres: read replica for analytics queries

### Phase 4: Enterprise (500+ tenants)
- Gateway: auto-scaled (HPA on CPU/memory)
- Workers: auto-scaled (HPA on queue depth)
- Postgres: connection pooling (PgBouncer)
- Redis: Cluster mode
- Object Storage: Cloud-native (S3 / GCS / Azure Blob)
- CDN for static assets

## Kubernetes Deployment

```yaml
# Simplified Helm values
replicaCount:
  gateway: 2
  auth: 2
  workers: 2
  adminui: 2

persistence:
  postgres:
    enabled: true
    size: 50Gi
  redis:
    enabled: true
    size: 10Gi
  minio:
    enabled: true
    size: 100Gi

ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"

autoscaling:
  gateway:
    enabled: false  # Enable in Phase 3
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
```

## Network Topology

```
Internet
  -> Cloudflare / ALB (TLS, DDoS)
    -> Kubernetes Ingress (Nginx)
      -> /auth/*      -> Auth Service
      -> /admin/*     -> Admin UI
      -> /api/*       -> Gateway API
      -> /v1/*        -> Gateway API (OpenAI compatible)
      -> /webhooks/*  -> Gateway API (Channel webhooks)
      -> /ws/*        -> Gateway API (WebSocket upgrade)
      -> /static/*    -> Admin UI / Object Storage
```
