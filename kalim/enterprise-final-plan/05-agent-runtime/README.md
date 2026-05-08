# 05 — Agent Runtime

## Principle: Queue Consumer, Not HTTP Server

In the simple plan, the agent runtime is called directly by the channel router (same process, same function call). In the final plan, the agent worker Pod is a **BullMQ consumer** that dequeues jobs from Redis and executes them asynchronously.

The agent runtime code (`src/agents/agent-command.ts`) is **not rewritten**. The change is:
- Instead of being called by an HTTP handler, it is called by a queue consumer wrapper
- Instead of reading files from local disk, it reads from S3/MinIO via `secureRead`
- Instead of writing files to local disk, it writes to S3/MinIO via `secureWrite`
- Instead of returning output to an HTTP response, it publishes tokens to Redis Pub/Sub

---

## What Is Preserved (100%)

| Feature | Simple Plan | Final Plan | Change |
|---|---|---|---|
| Agent config reuse | Global shared agents | Identical | None |
| Per-user SOUL.md | `workspace/users/user_<id>/SOUL.md` | `s3://workspace/users/user_<id>/SOUL.md` | Storage backend only |
| Per-user AGENTS.md | Same | Same | Storage backend only |
| Per-user MEMORY.md | Same | Same | Storage backend only |
| Per-user USER.md | Same | Same | Storage backend only |
| Per-user TASKS.md | Same | Same | Storage backend only |
| Session key prefix | `u:<userId>:<channel>:<threadId>` | Identical | None |
| Vector memory isolation | LanceDB keyed by session id | Same (see Vector Memory section) | Storage strategy |
| Skills from `base/` | Read-only shared | Read-only shared from S3 | Storage backend only |
| Tools from `base/` | Read-only shared | Read-only shared from S3 | Storage backend only |
| Plugin execution | In-process | In-process (in agent worker) | None |
| Plugin `team_safe` guard | Manifest check at boot | Identical | None |
| MEMORY.md append + soft cap | 8 KB, trim oldest lines | Identical | None |
| `tmp/` cleared per session | `fs.rm` + `fs.mkdir` | `emptyDir` volume, cleared per job | Mechanism only |

---

## Agent Worker Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT WORKER POD                                            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Queue Consumer (BullMQ Worker)                      │    │
│  │    → Dequeue job from 'agent-jobs' queue            │    │
│  │    → Validate job payload                           │    │
│  │    → Resolve per-user files from S3/MinIO           │    │
│  │    → Call agent-command.ts with team context          │    │
│  │    → Publish streaming tokens to Redis Pub/Sub       │    │
│  │    → Write updated files back to S3/MinIO            │    │
│  │    → Mark job complete                               │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │  Agent Runtime (src/agents/agent-command.ts)          │    │
│  │    → LLM orchestration (unchanged)                   │    │
│  │    → Tool dispatch (unchanged)                       │    │
│  │    → Skill invocation (unchanged)                    │    │
│  │    → Streaming output (redirected to Redis Pub/Sub)  │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │  Secure FS Adapter (S3-backed)                       │    │
│  │    secureRead(userId, s3Key)  → GetObject            │    │
│  │    secureWrite(userId, s3Key) → PutObject            │    │
│  │    validateS3Key() → prefix check                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Plugin Loader + Guard                               │    │
│  │    assertPluginTeamSafe(manifest) at boot            │    │
│  │    Injected fs proxy: secureRead/secureWrite-backed  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Volumes:                                                    │
│    emptyDir: /tmp/agent-scratch   ← per-job scratch space   │
│    configMap: base/skills/, base/tools/ (read-only mount)   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Job Processing Lifecycle

```
1. DEQUEUE
   BullMQ worker picks up job from 'agent-jobs' queue.
   Job payload: { userId, sessionKey, channel, text, attachments, replyChannel, ... }

2. FILE RESOLUTION (replaces resolveUserFiles)
   a. Check S3: does users/user_{userId}/SOUL.md exist?
      → If not: copy base/SOUL.md → users/user_{userId}/SOUL.md  (first-time seed)
   b. Same for AGENTS.md
   c. Ensure MEMORY.md, USER.md, TASKS.md exist (create empty if missing)
   d. Download all 5 files to local /tmp/agent-scratch/{userId}/
      (fast local reads during agent execution)
   e. Clear /tmp/agent-scratch/{userId}/tmp/ (scratch space)

3. BUILD TEAM CONTEXT
   const teamCtx = {
     userId: job.data.userId,
     workspaceId: job.data.workspaceId,
     isAdmin: job.data.isAdmin,
     files: {
       soulPath:         '/tmp/agent-scratch/{userId}/SOUL.md',
       agentsPath:       '/tmp/agent-scratch/{userId}/AGENTS.md',
       memoryPath:       '/tmp/agent-scratch/{userId}/MEMORY.md',
       userProfilePath:  '/tmp/agent-scratch/{userId}/USER.md',
       tasksPath:        '/tmp/agent-scratch/{userId}/TASKS.md',
       uploadsDir:       's3://openclaw-workspace/users/user_{userId}/uploads/',
       conversationsDir: 's3://openclaw-workspace/users/user_{userId}/conversations/',
       tmpDir:           '/tmp/agent-scratch/{userId}/tmp/',
       toolCacheDir:     '/tmp/agent-scratch/{userId}/tool_cache/',
       logsDir:          's3://openclaw-workspace/users/user_{userId}/logs/',
     }
   };

4. EXECUTE AGENT
   Call agent-command.ts with the built teamCtx.
   Agent reads SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md from local cache.
   Agent streams tokens → published to Redis Pub/Sub channel: job.data.replyChannel

5. WRITE BACK
   a. If MEMORY.md was updated (append): upload to S3
   b. If USER.md was updated: upload to S3
   c. If TASKS.md was updated: upload to S3
   d. Upload conversation transcript to S3: users/{userId}/conversations/{sessionKey}.jsonl
   e. Upload execution log to S3: users/{userId}/logs/{date}.log
   f. Clean up /tmp/agent-scratch/{userId}/

6. PUBLISH REPLY
   Publish final reply to Redis:
     channel: agent:reply:{channel}:{threadId}
     data: { text, attachments, userId, channel, threadId }

7. MARK COMPLETE
   Job marked as completed in BullMQ.
```

---

## Secure FS Adapter (S3-Backed)

The simple plan's `secureRead`/`secureWrite` validates filesystem paths. The final plan validates S3 key prefixes with identical security semantics.

```ts
// services/agent-worker/src/secure-fs-s3.ts

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ /* config from env */ });
const BUCKET = process.env.OPENCLAW_S3_BUCKET || 'openclaw-workspace';

export class SecureFsViolationError extends Error {
  constructor(userId: string, key: string, reason: string) {
    super(`[SecureFS-S3] user=${userId} key=${key} reason=${reason}`);
    this.name = 'SecureFsViolationError';
  }
}

export function validateS3Key(userId: string, key: string): string {
  const userPrefix = `users/user_${userId}/`;
  const basePrefix = 'base/';
  if (!key.startsWith(userPrefix) && !key.startsWith(basePrefix)) {
    throw new SecureFsViolationError(userId, key, 'outside user and base prefix');
  }
  // Block path traversal in key
  if (key.includes('..') || key.includes('//')) {
    throw new SecureFsViolationError(userId, key, 'path traversal detected');
  }
  return key;
}

export function validateS3WriteKey(userId: string, key: string): string {
  const validated = validateS3Key(userId, key);
  if (validated.startsWith('base/')) {
    throw new SecureFsViolationError(userId, key, 'writes to base/ forbidden');
  }
  return validated;
}

export async function secureRead(userId: string, key: string): Promise<string> {
  const safe = validateS3Key(userId, key);
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: safe }));
  return resp.Body!.transformToString('utf-8');
}

export async function secureWrite(
  userId: string,
  key: string,
  content: string,
  options?: { append?: boolean }
): Promise<void> {
  const safe = validateS3WriteKey(userId, key);
  if (options?.append) {
    // S3 doesn't support append — read, concatenate, write back
    const existing = await secureRead(userId, safe).catch(() => '');
    content = existing + content;
  }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: safe, Body: content, ContentType: 'text/plain',
  }));
}
```

### S3 Append Limitation

S3 doesn't support native append. For `MEMORY.md` (append-only), the worker:
1. `GetObject` → existing content
2. Concatenate new line
3. `PutObject` → full content

At the scale of this plan (<10 users, MEMORY.md < 8 KB), this is fine. For higher scale, switch to a database-backed memory store.

### Alternative: Shared PVC Instead of S3

If S3/MinIO is too much infrastructure, use a `ReadWriteMany` PVC (NFS/EFS):

| Storage Backend | Pros | Cons |
|---|---|---|
| **S3/MinIO** | No shared filesystem needed; object versioning; CDN-ready | No native append; requires S3 SDK; latency for small files |
| **ReadWriteMany PVC** | Filesystem semantics preserved; `secureRead`/`secureWrite` from simple plan work as-is | Requires NFS/EFS provisioner; concurrent write locking needed |

The architecture supports both. The `secureRead`/`secureWrite` interface is the abstraction layer.

---

## Vector Memory Strategy

The simple plan uses LanceDB (file-based vector DB) keyed by session id prefix `u:<userId>:`. In K8s with multiple agent workers, LanceDB's file-based storage needs a shared location.

### Option A — LanceDB on Shared PVC (Recommended for <50 Users)

```
ReadWriteMany PVC mounted at /data/lancedb/ on all agent worker Pods
LanceDB tables keyed by session id (u:<userId>:...)
File-level locking handled by LanceDB's WAL mode
```

**Pros:** Zero code change from simple plan. LanceDB already handles concurrent readers.
**Cons:** Write contention at high concurrency. NFS latency.

### Option B — LanceDB on S3 (LanceDB supports S3-backed tables)

```
LanceDB configured with S3 storage backend
Each table stored as Parquet files in S3
Session-key prefix provides user isolation
```

**Pros:** No shared filesystem needed. Scales to many workers.
**Cons:** Higher latency per query. LanceDB S3 support is newer.

### Option C — Replace LanceDB with pgvector (Future)

```
Postgres with pgvector extension
Vectors stored in Postgres alongside user/session tables
Queries scoped by user_id column
```

**Pros:** One less infrastructure component. ACID guarantees.
**Cons:** More migration work. Different query patterns.

**Recommendation:** Start with Option A (shared PVC). Migrate to Option B or C when vector query volume justifies it.

---

## Concurrency (Preserved from Simple Plan)

Two users' jobs processed by different (or same) agent worker replicas:

- Session keys are different → no contention
- S3 file paths are different → no collision
- LLM calls are independent → upstream parallelism
- Shared skills/tools are read-only → no write contention
- BullMQ processes jobs independently per worker → natural isolation

---

## Plugin Execution

Plugins load in the agent worker Pod at startup:

1. Read plugin manifests from `base/` (S3 or ConfigMap mount)
2. `assertPluginTeamSafe(manifest)` → reject plugins without `team_safe: true`
3. Inject `secureRead`/`secureWrite`-backed `fs` proxy into plugin context
4. Plugins that import `node:fs` directly bypass this → same limitation as simple plan

---

## Agent Worker Pod Spec (Reference)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openclaw-agent-worker
  template:
    metadata:
      labels:
        app: openclaw-agent-worker
    spec:
      containers:
        - name: agent-worker
          image: ghcr.io/openclaw/openclaw-agent-worker:latest
          env:
            - name: OPENCLAW_TEAM_MODE
              value: "1"
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: openclaw-secrets
                  key: redis-url
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: openclaw-secrets
                  key: database-url
            - name: OPENCLAW_S3_BUCKET
              value: openclaw-workspace
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: openclaw-s3
                  key: access-key
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: openclaw-s3
                  key: secret-key
            - name: S3_ENDPOINT
              value: "http://minio:9000"    # for MinIO; omit for AWS S3
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          volumeMounts:
            - name: scratch
              mountPath: /tmp/agent-scratch
            - name: lancedb
              mountPath: /data/lancedb
      volumes:
        - name: scratch
          emptyDir: {}
        - name: lancedb
          persistentVolumeClaim:
            claimName: openclaw-lancedb    # ReadWriteMany
```
