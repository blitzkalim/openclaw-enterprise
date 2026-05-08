# 12 — Risk Watch

## Distributed-Topology-Specific Risks

These risks do not exist in the simple plan (single process, single disk). They are introduced by splitting into multiple Pods with shared state.

---

## Risk Matrix

| # | Risk | Severity | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | **Message queue durability — job lost between enqueue and dequeue** | High | Low | User message silently dropped; no reply sent | BullMQ persistence: Redis AOF enabled (`appendonly yes`); jobs survive Redis restart. DLQ for failed jobs after 3 retries. Gateway returns 200 only after successful enqueue (if Redis down → 503 to provider → provider retries). | Infra / DevOps |
| R2 | **S3/MinIO unavailable during agent execution** | High | Low | Agent cannot read SOUL.md, MEMORY.md; job fails | Agent worker retries S3 reads 3 times with exponential backoff. If still failing, job goes to DLQ. Health check includes S3 head-bucket probe — Pod marked unready if S3 unreachable. | Agent Worker |
| R3 | **Vector memory (LanceDB) concurrent write corruption on shared PVC** | Medium | Medium | Corrupted vector index; user queries return wrong results | LanceDB uses WAL mode for concurrent access. If contention increases: move to LanceDB S3 backend (Option B in §05) or pgvector (Option C). Monitor write latency as early warning. | Agent Worker |
| R4 | **Redis Pub/Sub message lost (agent reply never reaches gateway)** | Medium | Low | Agent executes successfully but user never gets reply | Redis Pub/Sub is fire-and-forget — if no subscriber is listening, message is lost. Mitigation: Gateway subscribes to reply channels BEFORE enqueuing the job. Fallback: agent worker also writes reply to a `pending_replies` Redis list with 5-minute TTL; gateway polls this list as backup. | Gateway + Agent Worker |
| R5 | **JWT private key rotation breaks in-flight sessions** | Medium | Low | Users get 401 after key rotation until they re-login | JWKS endpoint serves both old and new keys for 30-day grace period. Agent workers refresh JWKS cache every 5 minutes. Rotation is manual (operator generates new key, updates K8s Secret, restarts Gateway Pods). | Gateway / Ops |
| R6 | **S3 append emulation (read-modify-write) causes MEMORY.md race condition** | Medium | Medium | Two concurrent agent jobs for the same user both read MEMORY.md, append different lines, and one overwrites the other's append | At <10 users this is rare. Mitigations: (a) BullMQ uses `limiter: { max: 1, duration: 1000 }` per userId group key — ensures only one job per user at a time. (b) For higher concurrency: switch MEMORY.md to a Postgres table with row-level append (no read-modify-write). | Agent Worker |
| R7 | **Gateway Pod replica count drops to 0 during rolling update** | Medium | Low | Webhooks return 503; Meta/Telegram stop retrying after N failures | Deployment strategy: `maxUnavailable: 0, maxSurge: 1` — always at least N replicas running. PodDisruptionBudget: `minAvailable: 1`. Readiness probe must pass before old Pod is terminated. | K8s / Helm |
| R8 | **Agent worker processes stale job after long queue delay** | Low | Low | User sent message 10 minutes ago; agent replies to outdated context | BullMQ job TTL: set `ttl: 300000` (5 minutes). Jobs older than 5 minutes are discarded. Gateway can re-enqueue if user sends a follow-up. | Agent Worker |
| R9 | **Postgres connection pool exhaustion** | Medium | Medium | Gateway or Agent Worker cannot query users/sessions; requests fail with connection timeout | Use `pg` pool with `max: 20` per Pod. Monitor `pg_stat_activity` for connection count. If approaching limit: increase pool size or add PgBouncer as connection pooler sidecar. | Infra |
| R10 | **MinIO single-node data loss** | High | Low | All user files (SOUL.md, MEMORY.md, uploads) lost | For self-hosted MinIO: use erasure coding mode (minimum 4 drives). For production: use managed S3 (11 nines durability). Daily backup of MinIO volumes to cold storage. | Infra / Ops |
| R11 | **Browser Pool Pod crash loop kills all browser sessions** | Low | Medium | Browser automation tasks fail repeatedly | Browser Pool is isolated in its own Pod — crashes don't affect Gateway or Agent Worker. Pod restart policy: `restartPolicy: Always` with exponential backoff. Agent worker timeout on browser gRPC calls: 30 seconds, then fallback to non-browser execution. | Browser Pool |
| R12 | **Channel webhook secret (WhatsApp app_secret) rotated upstream but not updated in Postgres** | Medium | Low | All inbound WhatsApp webhooks fail signature verification; messages silently dropped | Admin must update the secret in `/team` page (which updates Postgres `workspace_secrets`). Gateway caches decrypted secrets in-memory; cache TTL: 5 minutes. Monitor webhook signature failure rate — alert if > 10 failures/minute. | Gateway / Ops |

---

## Monitoring Recommendations

| Metric | Alert Threshold | Why |
|---|---|---|
| BullMQ `agent-jobs` queue depth | > 50 pending jobs for > 2 min | Agent workers falling behind; need more replicas |
| BullMQ `agent-jobs-dlq` depth | > 0 | Failed jobs need admin attention |
| BullMQ job processing time (p95) | > 30 seconds | LLM latency spike or agent worker issue |
| Gateway request latency (p95) | > 200ms | Gateway should be fast (enqueue only) |
| Webhook signature failure rate | > 10/min | Secret mismatch or attack |
| Redis memory usage | > 80% of maxmemory | Risk of eviction; scale Redis or increase limit |
| Postgres connection count | > 80% of max_connections | Connection pool exhaustion approaching |
| S3 error rate (5xx) | > 1% of requests | Storage backend issue |
| Pod restart count | > 3 in 10 minutes | Crash loop — investigate |
| JWT validation failure rate | > 5/min (excluding expired) | Possible key mismatch or attack |
| LanceDB query latency (p95) | > 500ms | Shared PVC contention; consider migrating vector store |

### Recommended Stack

| Tool | Purpose |
|---|---|
| **Prometheus** | Metrics collection from all Pods |
| **Grafana** | Dashboards for queue depth, latency, error rates |
| **Loki** (or EFK) | Log aggregation from all Pods |
| **AlertManager** | Alert routing (Slack, PagerDuty, email) |
| **BullMQ Board** (or custom) | Queue inspection UI for admin |

---

## Operational Runbooks (Quick Reference)

### Runbook: User reports "message sent but no reply"

```
1. Check BullMQ dashboard: is the job in agent-jobs queue? in DLQ?
2. If in DLQ: read error message, check agent worker logs
3. If not in any queue: check gateway logs for webhook receipt + enqueue
4. If gateway received but didn't enqueue: check Redis connectivity
5. If job completed but no reply: check Redis pub/sub + gateway reply subscriber logs
6. If reply published but not sent: check channel API credentials, rate limits
```

### Runbook: Webhook signature failures spike

```
1. Check if the channel provider (Meta/Telegram) rotated their secret
2. Compare stored secret in Postgres workspace_secrets with provider dashboard
3. If mismatch: admin updates secret in /team page
4. Wait 5 minutes for gateway cache to refresh (or restart gateway Pods)
```

### Runbook: Agent worker queue depth growing

```
1. Check HPA status: kubectl get hpa agent-worker-hpa
2. If not scaling: check HPA metrics source (KEDA or metrics-server)
3. If scaling but still growing: check agent worker logs for slow LLM responses
4. If LLM provider is slow: nothing to do — backpressure is working correctly
5. If jobs are failing: check DLQ, agent worker logs, S3 connectivity
```

### Runbook: Memory.md race condition suspected

```
1. Check if two jobs for the same userId ran concurrently
   (BullMQ dashboard → filter by userId)
2. If yes: enable per-user job limiter:
   queue.add('agent-job', payload, { group: { id: userId, limit: { max: 1 } } })
3. If frequent: migrate MEMORY.md to Postgres-backed storage
```

---

## Risk Acceptance

| Accepted Risk | Why Accepted | When to Revisit |
|---|---|---|
| Plugin imports `node:fs` directly, bypassing secureRead/secureWrite | Same as simple plan — operator trusts plugin choices; full sandboxing is big-plan scope | When untrusted third-party plugins are installed |
| Malicious teammate with valid credentials | Small-team trust model; admin can disable | When team grows past 20 or handles sensitive customer data |
| No MFA, no OAuth, no SSO | Out of scope for v1 | When contractually required by a customer |
| No immutable audit log | Structured logs + S3 log files are "good enough" | When SOC 2 or compliance audit is needed |
| LanceDB on shared PVC has write contention risk | Fine for <10 concurrent users | When vector query volume exceeds shared PVC throughput |
| S3 read-modify-write for MEMORY.md append | BullMQ per-user limiter prevents concurrent writes | When user count exceeds limiter capacity |

---

## Summary

The final plan introduces **12 new risks** that don't exist in the simple plan, all stemming from the distributed topology. Every risk has a concrete mitigation. The most critical are:

1. **R1 (Queue durability)** — Redis AOF + DLQ + 503 on Redis failure
2. **R4 (Pub/Sub reply loss)** — Subscribe-before-enqueue + pending_replies fallback
3. **R6 (MEMORY.md race)** — Per-user job limiter in BullMQ
4. **R10 (MinIO data loss)** — Erasure coding or managed S3

The operational burden is higher than the simple plan. A team should adopt the final plan only when the scaling benefits justify the operational cost.
