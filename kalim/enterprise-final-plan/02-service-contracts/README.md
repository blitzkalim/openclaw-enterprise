# 02 — Service Contracts

## Overview

Three communication boundaries exist in this architecture:

1. **Gateway Pod ↔ Postgres/Redis** (synchronous queries)
2. **Gateway Pod → Agent Worker Pod** (async via BullMQ queue)
3. **Agent Worker Pod → Gateway Pod** (streaming via Redis Pub/Sub)
4. **Agent Worker Pod ↔ S3/MinIO** (file reads/writes)
5. **Agent Worker Pod ↔ Browser Pool Pod** (optional, gRPC/HTTP)

This document defines the contracts for each boundary.

---

## 1. BullMQ Job Schemas (Gateway → Agent Worker)

### Queue: `agent-jobs`

The gateway enqueues a job for every inbound message (webhook, HTTP chat, or WebSocket).

```ts
// Job payload — enqueued by Gateway Pod
interface AgentJobPayload {
  // Identity (resolved by gateway from JWT/cookie/API token)
  userId: string;
  workspaceId: string | null;
  isAdmin: boolean;
  source: 'cookie' | 'api-token' | 'legacy';

  // Message
  channel: 'whatsapp' | 'telegram' | 'web' | 'api';
  threadId: string;                    // chat id, phone, or browser session id
  sessionKey: string;                  // pre-computed: u:<userId>:<channel>:<threadId>
  text: string;
  attachments?: AttachmentRef[];       // S3 keys for uploaded files

  // Routing
  agentId?: string;                    // optional: which agent to invoke
  replyChannel?: string;               // Redis pub/sub channel for streaming response

  // Metadata
  webhookMessageId?: string;           // for idempotency / dedup
  timestamp: string;                   // ISO 8601
}

interface AttachmentRef {
  s3Key: string;                       // e.g. "users/user_abc/uploads/1714500000_doc.pdf"
  mimeType: string;
  originalName?: string;
}
```

### Queue Options

```ts
// BullMQ job options
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400 },    // keep completed jobs for 24h
  removeOnFail: { age: 604800 },       // keep failed jobs for 7 days
  jobId: payload.webhookMessageId,      // dedup by webhook message id
}
```

### Dead Letter Queue: `agent-jobs-dlq`

Jobs that fail all 3 attempts are moved to the DLQ. The gateway serves a `/team/admin/dlq` page listing failed jobs for admin review.

---

## 2. Redis Pub/Sub Schemas (Agent Worker → Gateway)

### Channel Pattern: `agent:stream:{sessionKey}`

Agent workers publish streaming tokens and final responses to this channel. The gateway subscribes when a WebSocket client is connected.

```ts
// Published by Agent Worker
interface AgentStreamMessage {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  sessionKey: string;
  data: string;                        // partial token text, or JSON for tool events
  timestamp: string;
}
```

### Channel Pattern: `agent:reply:{channel}:{threadId}`

For channel replies (WhatsApp/Telegram), the agent worker publishes the final response. The gateway (or a dedicated reply worker) picks it up and sends via the channel's API.

```ts
// Published by Agent Worker
interface AgentReplyMessage {
  channel: 'whatsapp' | 'telegram';
  threadId: string;
  userId: string;
  text: string;
  attachments?: { s3Key: string; mimeType: string }[];
  timestamp: string;
}
```

---

## 3. Gateway HTTP API (Exposed to Clients)

### Auth Routes

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| POST | `/auth/login` | None | `{ email, password }` | `Set-Cookie: oc_session=<JWT>` + `{ user }` |
| POST | `/auth/logout` | JWT cookie | — | Clear cookie + `204` |
| GET | `/auth/me` | JWT cookie or Bearer | — | `{ userId, email, name, isAdmin, workspaceId }` |
| POST | `/auth/reset` | Reset token | `{ token, newPassword }` | `200` |

### Team Admin Routes

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/team` | JWT (any user) | — | HTML page |
| POST | `/team/users` | JWT (admin) | `{ email, name }` | `{ userId, inviteUrl }` |
| DELETE | `/team/users/:id` | JWT (admin) | — | `204` |
| POST | `/team/tokens` | JWT (any user) | `{ name }` | `{ tokenId, token }` (shown once) |
| DELETE | `/team/tokens/:id` | JWT (owner) | — | `204` |
| POST | `/team/identities` | JWT (any user) | `{ channel }` | `{ claimCode }` |
| GET | `/team/identities` | JWT (any user) | — | `[{ channel, externalId, displayName }]` |

### Webhook Routes

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/webhooks/whatsapp/:wsId` | HMAC-SHA256 header | Meta Cloud API payload | `200` (async) |
| POST | `/webhooks/telegram/:wsId` | Secret-token header | Telegram update JSON | `200` (async) |

### WebSocket

| Path | Auth | Purpose |
|---|---|---|
| `WSS /ws` | JWT as query param or cookie | Real-time agent streaming; gateway relays from Redis Pub/Sub |

---

## 4. Gateway → Postgres Queries (Direct)

The gateway Pod connects to Postgres directly for:

| Query | When | Table |
|---|---|---|
| `SELECT * FROM users WHERE email = ?` | Login | `users` |
| `INSERT INTO user_sessions (...)` | Login | `user_sessions` |
| `DELETE FROM user_sessions WHERE id = ?` | Logout | `user_sessions` |
| `SELECT user_id FROM api_tokens WHERE hash = ?` | API token auth | `api_tokens` |
| `SELECT * FROM channel_identities WHERE channel = ? AND external_id = ?` | Webhook routing | `channel_identities` |
| `INSERT INTO channel_identities (...)` | Claim flow | `channel_identities` |
| `INSERT INTO users (...)` | Invite / auto-create guest | `users` |
| `INSERT INTO api_tokens (...)` | Token creation | `api_tokens` |

All queries use parameterized statements. No ORM — raw `pg` driver with prepared statements.

---

## 5. Agent Worker → S3/MinIO API

The agent worker reads and writes per-user files via the S3 API.

### Bucket Layout

```
openclaw-workspace/
  base/
    SOUL.md
    AGENTS.md
    skills/
    tools/
  users/
    user_{userId}/
      SOUL.md
      AGENTS.md
      MEMORY.md
      USER.md
      TASKS.md
      uploads/{timestamp}_{filename}
      conversations/{sessionKey}.jsonl
      tmp/                              ← ephemeral; agent-local, NOT in S3
      tool_cache/{key}.json
      logs/{date}.log
```

### File Operations

| Operation | S3 Call | When |
|---|---|---|
| Read SOUL.md | `GetObject(bucket, users/user_{id}/SOUL.md)` | Agent job start |
| Read AGENTS.md | `GetObject(bucket, users/user_{id}/AGENTS.md)` | Agent job start |
| Read MEMORY.md | `GetObject(bucket, users/user_{id}/MEMORY.md)` | Agent job start |
| Read USER.md | `GetObject(bucket, users/user_{id}/USER.md)` | Agent job start |
| Read TASKS.md | `GetObject(bucket, users/user_{id}/TASKS.md)` | Agent job start |
| Write MEMORY.md | `PutObject(bucket, users/user_{id}/MEMORY.md)` | Agent job end |
| Write USER.md | `PutObject(bucket, users/user_{id}/USER.md)` | Agent job end |
| Write TASKS.md | `PutObject(bucket, users/user_{id}/TASKS.md)` | Agent job end |
| Upload attachment | `PutObject(bucket, users/user_{id}/uploads/...)` | Webhook with document |
| Read base/SOUL.md | `GetObject(bucket, base/SOUL.md)` | First-time user seeding |
| Write transcript | `PutObject(bucket, users/user_{id}/conversations/...)` | Agent job end |
| Write log | `PutObject(bucket, users/user_{id}/logs/...)` | Agent job end |

### `tmp/` Handling

`tmp/` is **NOT stored in S3**. It is local ephemeral disk on the agent worker Pod. Cleared at the start of each job. Use `emptyDir` volume in the Pod spec.

### Path Validation (Secure FS in S3 Context)

The `secureRead`/`secureWrite` functions from the simple plan are adapted to validate S3 key prefixes instead of filesystem paths:

```ts
function validateS3Key(userId: string, key: string): string {
  const userPrefix = `users/user_${userId}/`;
  const basePrefix = 'base/';
  if (!key.startsWith(userPrefix) && !key.startsWith(basePrefix)) {
    throw new SecureFsViolationError(userId, key, 'outside user and base prefix');
  }
  return key;
}

function validateS3WriteKey(userId: string, key: string): string {
  const validated = validateS3Key(userId, key);
  if (validated.startsWith('base/')) {
    throw new SecureFsViolationError(userId, key, 'writes to base/ forbidden');
  }
  return validated;
}
```

---

## 6. Agent Worker → Browser Pool (Optional, Pod 4)

If the browser pool is deployed as a separate Pod:

### gRPC Service Definition

```protobuf
service BrowserPool {
  rpc CreateSession(CreateSessionRequest) returns (SessionHandle);
  rpc Navigate(NavigateRequest) returns (PageResult);
  rpc ExecuteScript(ScriptRequest) returns (ScriptResult);
  rpc Screenshot(ScreenshotRequest) returns (ScreenshotResult);
  rpc CloseSession(SessionHandle) returns (Empty);
}

message CreateSessionRequest {
  string user_id = 1;        // for logging/isolation
  bool headless = 2;
  int32 viewport_width = 3;
  int32 viewport_height = 4;
}

message SessionHandle {
  string session_id = 1;
}
```

If browser pool is NOT deployed, the agent worker runs Playwright in-process (same as simple plan). The `BrowserPool` interface is abstracted so the agent code doesn't know which mode is active.

---

## 7. Contract Versioning

All inter-service contracts use semantic versioning headers:

```
X-Contract-Version: 1.0
```

Breaking changes require a version bump. The gateway and agent worker must agree on the same major version. Minor/patch changes are backward-compatible.
