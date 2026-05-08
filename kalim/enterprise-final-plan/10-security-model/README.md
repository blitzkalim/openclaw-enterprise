# 10 — Security Model

## Scope

All security properties from the simple plan are **preserved or raised**. This document adds the distributed-topology-specific threats and mitigations that don't exist in a single-process deployment.

---

## Security Properties: Simple Plan → Final Plan

| Property | Simple Plan | Final Plan | Change |
|---|---|---|---|
| Password hashing | ✅ Argon2id | ✅ Argon2id | None |
| Session revocation | ✅ Instant (SQLite DELETE) | ✅ Instant (Redis DEL) | Backend only |
| CSRF | ✅ SameSite=Lax + CSRF token | ✅ Same | None |
| Webhook signature verification | ✅ HMAC-SHA256 / secret-token | ✅ Same | None |
| User isolation (session key prefix) | ✅ `u:<userId>:` | ✅ Same | None |
| File path isolation | ✅ `secureRead`/`secureWrite` (filesystem) | ✅ `secureRead`/`secureWrite` (S3 key prefix) | Backend only |
| `base/` read-only enforcement | ✅ `validateWritePath` blocks writes | ✅ `validateS3WriteKey` blocks writes | Backend only |
| Plugin `team_safe` guard | ✅ Manifest check at boot | ✅ Same | None |
| Rate limiting | ✅ In-memory (one process) | ✅ Redis-backed (shared across replicas) | Upgrade |
| API token storage | ✅ SHA-256 hash only | ✅ Same | None |
| Channel secret encryption | ✅ AES-256-GCM in SQLite | ✅ AES-256-GCM in Postgres | Backend only |
| Cross-replica auth | ❌ N/A | ✅ JWT + JWKS (stateless) | **New** |
| Inter-Pod auth | ❌ N/A | ✅ Network policies + shared secrets | **New** |
| Secret management | ⚠️ Env vars | ✅ K8s Secrets (or external vault) | **Upgrade** |
| TLS | ✅ Caddy auto-cert | ✅ Ingress + cert-manager | Same level |
| Network segmentation | ❌ N/A (one process) | ✅ K8s NetworkPolicy | **New** |

---

## New Threats (Distributed Topology)

### Threat 1 — Inter-Pod Communication Eavesdropping

| Threat | A network attacker reads traffic between Gateway and Redis, or Gateway and Postgres |
|---|---|
| **Severity** | High — session tokens, user data, agent content in transit |
| **Mitigation** | TLS for all inter-Pod connections: Postgres (`sslmode=require`), Redis (`tls: true`), S3 (HTTPS endpoint). For self-hosted infra, use mTLS via service mesh (Istio/Linkerd) or K8s-native cert rotation. |
| **Implementation** | Postgres: `DATABASE_URL=postgres://...?sslmode=require`. Redis: `REDIS_URL=rediss://...` (TLS). S3: always HTTPS. |

### Threat 2 — Rogue Pod Accessing Shared State

| Threat | A compromised or misconfigured Pod reads/writes data it shouldn't |
|---|---|
| **Severity** | High |
| **Mitigation** | K8s NetworkPolicy (§07) restricts which Pods can reach Postgres/Redis/S3. Only `gateway` and `agent-worker` can connect to infra. Agent worker cannot receive inbound traffic. Browser pool can only be reached by agent worker on gRPC port. |

### Threat 3 — BullMQ Job Tampering

| Threat | Attacker injects a crafted job into the Redis queue with a fake userId |
|---|---|
| **Severity** | Medium — would execute agent as wrong user |
| **Mitigation** | (a) Redis is not exposed outside the cluster (NetworkPolicy). (b) BullMQ producer signs job payloads with HMAC using `OPENCLAW_QUEUE_SECRET`. Agent worker verifies HMAC before processing. (c) Redis AUTH password required. |

```ts
// Gateway — when enqueuing
import { createHmac } from 'node:crypto';
const signature = createHmac('sha256', process.env.OPENCLAW_QUEUE_SECRET!)
  .update(JSON.stringify(payload))
  .digest('hex');
await queue.add('agent-job', { ...payload, _sig: signature });

// Agent Worker — when dequeuing
const { _sig, ...payload } = job.data;
const expected = createHmac('sha256', process.env.OPENCLAW_QUEUE_SECRET!)
  .update(JSON.stringify(payload))
  .digest('hex');
if (!timingSafeEqual(Buffer.from(_sig), Buffer.from(expected))) {
  throw new Error('Job signature mismatch — possible tampering');
}
```

### Threat 4 — S3 Bucket Misconfiguration

| Threat | S3 bucket is publicly readable or writable |
|---|---|
| **Severity** | Critical — all user data exposed |
| **Mitigation** | (a) Bucket policy: `Block all public access` enabled. (b) IAM roles scoped: Gateway gets `PutObject` on `users/*/uploads/*` only. Agent worker gets `GetObject` + `PutObject` on `users/*` and `GetObject` on `base/*`. Neither gets `PutObject` on `base/*`. (c) MinIO (self-hosted): access key scoped to the bucket with custom policy. |

### Threat 5 — JWT Key Compromise

| Threat | Attacker obtains the RS256 private key |
|---|---|
| **Severity** | Critical — can forge JWTs for any user |
| **Mitigation** | (a) Private key stored as K8s Secret, mounted only in Gateway Pod. (b) Agent worker never sees the private key — only the public key (via JWKS). (c) Key rotation every 90 days. Old key removed from JWKS after 30-day grace. (d) In production: use external secrets manager (AWS Secrets Manager, HashiCorp Vault) with auto-rotation. |

### Threat 6 — Redis Pub/Sub Message Injection

| Threat | Attacker publishes fake agent reply to `agent:reply:whatsapp:+91...` |
|---|---|
| **Severity** | Medium — could send arbitrary messages to users' phones |
| **Mitigation** | (a) Redis not exposed outside cluster. (b) Reply messages carry a signature (same HMAC pattern as jobs). Gateway verifies before sending outbound. (c) NetworkPolicy: only agent-worker Pods can publish to `agent:reply:*`. |

---

## Defense-in-Depth Table

| Layer | What it stops | Implementation |
|---|---|---|
| K8s Ingress TLS | Eavesdropping, MITM on public traffic | cert-manager + Let's Encrypt |
| K8s NetworkPolicy | Unauthorized Pod-to-Pod communication | Calico/Cilium network plugin |
| JWT RS256 | Forged auth tokens | Gateway-only private key + JWKS |
| Redis AUTH | Unauthorized Redis access | Password in K8s Secret |
| Postgres SSL | DB connection eavesdropping | `sslmode=require` |
| S3 IAM / MinIO policy | Bucket-level access control | Scoped IAM roles per Pod |
| Webhook HMAC | Spoofed inbound webhooks | HMAC-SHA256 / secret-token verification |
| BullMQ job signing | Queue message tampering | HMAC on job payload |
| Redis pub/sub signing | Reply message injection | HMAC on reply payload |
| `secureRead`/`secureWrite` | Cross-user file access, path traversal, `base/` writes | S3 key prefix validation |
| `team_safe` plugin guard | Untrusted plugins in team mode | Manifest check at boot |
| Argon2id | Offline password cracking | CPU-hard hash function |
| Redis session check | JWT revocation | `EXISTS session:<jti>` per request |
| Rate limiting (Redis) | Brute-force login, webhook flood, LLM cost abuse | Sliding window + token bucket |
| CSRF token | Cross-site request forgery | Signed JTI hash in form |

---

## What We Log (Preserved + Extended)

### Logged (same as simple plan)

- `/auth/login` success and failure (with IP, not password)
- `/auth/logout`
- API token creation and deletion (hash only)
- Webhook signature failures
- New `channel_identity` claim
- Inbound message dispatched (userId, channel, message length)
- `SecureFsViolationError` events (always, regardless of log level)

### New Logs (K8s-specific)

- BullMQ job enqueue/dequeue/complete/fail (job ID, userId, duration)
- JWT validation failures (expired, revoked, invalid signature)
- Inter-Pod HMAC verification failures (queue + pub/sub)
- S3 operation errors (access denied, not found, timeout)
- Pod startup/shutdown events
- Health check failures

### Not Logged (same as simple plan)

- Message contents (privacy)
- Agent prompt or response text (privacy)
- Tool inputs or outputs (privacy)
- Secrets, passwords, JWT payloads

---

## Secrets Management

| Secret | Simple Plan | Final Plan |
|---|---|---|
| `OPENCLAW_GATEWAY_TOKEN` | Env var | K8s Secret (mounted as env) |
| `OPENCLAW_COOKIE_SECRET` | Env var | K8s Secret |
| JWT private/public keys | N/A | K8s Secret (or external vault) |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` | Env var (cleared after first run) | K8s Secret (bootstrap Job only) |
| WhatsApp app secret | SQLite, AES-256-GCM | Postgres, AES-256-GCM + K8s Secret for encryption key |
| Telegram bot token | Same | Same |
| LLM provider keys | OpenClaw config (env) | K8s Secret (mounted in agent worker only) |
| Postgres password | N/A | K8s Secret |
| Redis password | N/A | K8s Secret |
| S3 access key/secret | N/A | K8s Secret |
| `OPENCLAW_QUEUE_SECRET` | N/A | K8s Secret (Gateway + Agent Worker) |
| `OPENCLAW_SECRETS_KEY` | N/A | K8s Secret (Gateway only — for workspace_secrets AES key) |

### External Vault Integration (Optional)

For production, replace K8s Secrets with:
- **AWS Secrets Manager** + External Secrets Operator
- **HashiCorp Vault** + Vault Secrets Operator
- **GCP Secret Manager** + External Secrets Operator

The service code reads from env vars regardless — the secret injection method is a K8s concern, not an application concern.

---

## Threat Model Summary

| Threat | Mitigation | Residual Risk |
|---|---|---|
| Random scanner hits `/login` | Rate limit + Argon2id | Low |
| Stolen JWT cookie | Redis revocation, short-lived option | Low |
| Stolen API token | DELETE row, hash invalidated | Low |
| Forged webhook | HMAC/secret-token verification | None |
| Webhook replay | Dedup by `webhookMessageId` (BullMQ jobId) | Low |
| Malicious teammate | Admin can disable; small-team trust model | Accepted |
| Cross-user file leak | `secureRead`/`secureWrite` S3 key validation | Low |
| Cross-user memory leak | Session-key prefix on all vector/session storage | Low |
| LLM credit drain via spam | Rate limit per `external_id` | Low |
| Rogue Pod | NetworkPolicy + Redis AUTH + Postgres SSL | Low |
| Queue message tampering | HMAC job signing | Low |
| S3 bucket exposure | IAM scoping, block public access | Low |
| JWT key compromise | K8s Secret + rotation + external vault | Medium |
| Plugin supply-chain | `team_safe` manifest + operator vetting | Accepted |
| Container escape | Out of scope — operator runs trusted images | Accepted |

---

## Single Most Important Operational Habit

> **Lock down the K8s namespace.** RBAC on `kubectl` access to the `openclaw` namespace. Only cluster admins should be able to `exec` into Pods, read Secrets, or port-forward to Postgres/Redis. This is the K8s equivalent of the simple plan's "restrict who has `~/.openclaw/`."
