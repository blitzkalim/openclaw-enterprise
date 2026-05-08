# 06 — Data Model

## Three Storage Systems

| System | What it holds | Why this backend |
|---|---|---|
| **Postgres 16** | Users, sessions, tokens, channel identities, claims, workspace secrets | Relational data that must be consistent across all Pods; survives restarts |
| **Redis 7** | BullMQ queues, session cache, rate-limit counters, pub/sub channels, claim code cache, API token cache, JWKS cache | Ephemeral/fast state shared across Gateway + Worker replicas |
| **S3/MinIO** (or shared PVC) | Per-user overlay files (SOUL.md, AGENTS.md, MEMORY.md, etc.), base/ seeds, uploads, transcripts, logs | Blob storage that must be accessible from any agent worker replica |

---

## Postgres Schema

Direct port of the simple plan's SQLite schema to Postgres. Identical tables, identical columns, Postgres-native types.

```sql
-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  workspace_id  UUID REFERENCES workspaces(id),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ
);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email ON users(email);

-- Workspaces (optional grouping)
CREATE TABLE workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cookie-backed login sessions (for admin audit; JWT is the auth token)
CREATE TABLE user_sessions (
  id           UUID PRIMARY KEY,              -- matches JWT jti claim
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  user_agent   TEXT,
  ip_address   INET
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_exp  ON user_sessions(expires_at);

-- API tokens (for webhooks, CLI, scripts)
CREATE TABLE api_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,           -- sha256 of raw token; raw never stored
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_hash ON api_tokens(hash);

-- Channel identity mappings (WhatsApp phone / Telegram chat id → user)
CREATE TABLE channel_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  external_id  TEXT NOT NULL,                  -- E.164 phone or telegram chat id
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX idx_channel_identities_user ON channel_identities(user_id);
CREATE INDEX idx_channel_identities_lookup ON channel_identities(channel, external_id);

-- Claim codes for the "Mode A" link flow
CREATE TABLE channel_claims (
  code         TEXT PRIMARY KEY,               -- e.g. 'OC-7K2X9Q'
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ
);

-- Workspace secrets (encrypted channel API credentials)
CREATE TABLE workspace_secrets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES workspaces(id),
  secret_type   TEXT NOT NULL,                 -- 'whatsapp_app_secret', 'telegram_bot_token', etc.
  encrypted_val BYTEA NOT NULL,                -- AES-256-GCM encrypted
  iv            BYTEA NOT NULL,                -- Initialization vector
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, secret_type)
);
```

### Schema Diff from Simple Plan

| Change | Simple Plan (SQLite) | Final Plan (Postgres) | Reason |
|---|---|---|---|
| Primary key type | `TEXT (uuid)` | `UUID` native | Postgres has native UUID; gen_random_uuid() |
| Boolean | `INTEGER (0/1)` | `BOOLEAN` | Postgres native boolean |
| Timestamps | `TEXT (ISO)` | `TIMESTAMPTZ` | Postgres native timestamps with timezone |
| IP address | `TEXT` | `INET` | Postgres native IP type |
| Check constraints | None (app-enforced) | `CHECK (status IN (...))` | DB-level validation |
| New table | — | `workspace_secrets` | Channel secrets encrypted at rest in DB |

### Migration Function

```ts
// services/shared/src/db/migrate.ts
import { Pool } from 'pg';

export async function migrate(pool: Pool): Promise<void> {
  const result = await pool.query(
    "SELECT current_setting('openclaw.schema_version', true) as v"
  );
  const version = parseInt(result.rows[0]?.v || '0', 10);

  if (version < 1) {
    await pool.query(SCHEMA_V1);  // The CREATE TABLEs above
    await pool.query("SELECT set_config('openclaw.schema_version', '1', false)");
  }
  // Future versions chained here
}
```

---

## Redis Key Patterns

| Key Pattern | Type | TTL | Purpose | Set by | Read by |
|---|---|---|---|---|---|
| `session:{jti}` | String (JSON) | 30 days | Session existence check for JWT revocation | Gateway (login) | Gateway (every request) |
| `api_token:{sha256_hash}` | String (JSON) | 60 seconds | Cached API token → user mapping | Gateway (first lookup) | Gateway (subsequent requests) |
| `claim:{code}` | String (JSON) | 10 minutes | Claim code → userId + channel | Gateway (claim creation) | Gateway (claim redemption) |
| `rl:login:{ip}:{email}` | Sorted set | 15 minutes | Login rate limit counter | Gateway | Gateway |
| `rl:webhook:{ip}` | String (counter) | 1 second | Webhook rate limit | Gateway | Gateway |
| `rl:msg:{externalId}` | String (flag) | 2 seconds | Per-sender message cooldown | Gateway | Gateway |
| `jwks:cache` | String (JSON) | 5 minutes | Cached JWKS public keys | Agent Worker | Agent Worker |
| `agent:stream:{sessionKey}` | Pub/Sub channel | — | Streaming agent tokens | Agent Worker | Gateway |
| `agent:reply:{channel}:{threadId}` | Pub/Sub channel | — | Final agent reply for outbound send | Agent Worker | Gateway |

### BullMQ Queue Names

| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `agent-jobs` | Gateway Pod | Agent Worker Pod | Inbound messages for agent processing |
| `agent-jobs-dlq` | BullMQ (auto, after 3 failures) | Admin review | Dead letter queue for failed jobs |

---

## S3/MinIO Bucket Layout

```
Bucket: openclaw-workspace

base/                               ← READ-ONLY (never written by runtime)
  SOUL.md                           ← operator-authored personality seed
  AGENTS.md                         ← operator-authored agent config seed
  skills/                           ← shared skills
    <skill-name>/
      ...
  tools/                            ← shared tools
    <tool-name>/
      ...

users/
  user_{userId}/                    ← ALL runtime writes for this user
    SOUL.md                         ← seeded from base/ on first request
    AGENTS.md                       ← seeded from base/ on first request
    MEMORY.md                       ← starts empty; agent appends
    USER.md                         ← starts empty; agent writes profile
    TASKS.md                        ← starts empty; agent writes tasks
    uploads/
      {timestamp}_{filename}        ← inbound channel media
    conversations/
      {sessionKey}.jsonl            ← session transcripts
    tool_cache/
      {key}.json                    ← cached tool results
    logs/
      {date}.log                    ← execution logs
```

### `tmp/` Is NOT in S3

`tmp/` from the simple plan is ephemeral scratch space. In K8s, it maps to an `emptyDir` volume on the agent worker Pod, cleared per job. It never touches S3.

### `base/` Lifecycle

`base/` is uploaded by the operator (via CLI, CI/CD, or admin tool) and is **never written by any Pod at runtime**. It is the seed for new users. The agent worker reads from it only during first-time user provisioning.

### S3 Access Policies

| Pod | S3 Permissions |
|---|---|
| Gateway Pod | `PutObject` on `users/*/uploads/*` (for webhook attachment upload) |
| Agent Worker Pod | `GetObject` on `base/*` and `users/*`; `PutObject` on `users/*` (not `base/*`) |
| Neither Pod | `PutObject` on `base/*` — operator-only via CLI/CI |

These are enforced via IAM policies (AWS) or MinIO bucket policies (self-hosted).

---

## Schema Footprint Comparison

| Item | Simple Plan | Final Plan |
|---|---|---|
| Tables | 5–6 (SQLite) | 7 (Postgres, + workspace_secrets) |
| External services | None (SQLite file) | Postgres + Redis + S3/MinIO |
| Migration framework | One function, `user_version` pragma | One function, config setting |
| Indexes | 5 | 8 |
| Encrypted secrets storage | In SQLite, AES-256-GCM | In Postgres, AES-256-GCM (same) |
| Cross-Pod state sharing | N/A (one process) | Postgres + Redis + S3 |
