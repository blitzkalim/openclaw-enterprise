# 07 — Minimal DB Changes

## TL;DR

One new file: `~/.openclaw/team.sqlite`. Five tables. No changes to existing OpenClaw storage. SQLite via `better-sqlite3`. Postgres is optional and pluggable behind the same interface.

## Why SQLite, Not Postgres

- The big plan picks Postgres because it scales horizontally and supports per-tenant Row-Level Security. We are explicitly **not** scaling horizontally.
- SQLite ships as a library — no daemon, no port, no admin user, no migrations infra to bootstrap. `better-sqlite3` is synchronous, fast for our row counts (~1k–10k rows), and works inside the same Node process.
- We are already using SQLite for tasks (`~/.openclaw/tasks.sqlite`). One more file fits the operational story.
- A Postgres adapter is a one-day swap when needed: same SQL, same query shapes.

## Schema

All tables live in `~/.openclaw/team.sqlite`. We do **not** add columns to OpenClaw's existing files.

```sql
-- Users
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  workspace_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'disabled'
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT
);
CREATE INDEX idx_users_status ON users(status);

-- Workspaces (optional grouping)
CREATE TABLE workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Cookie-backed login sessions
CREATE TABLE user_sessions (
  id           TEXT PRIMARY KEY,            -- 32-byte hex; the cookie value
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  user_agent   TEXT,
  ip_address   TEXT
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_exp  ON user_sessions(expires_at);

-- API tokens (for webhooks, CLI, scripts)
CREATE TABLE api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,        -- sha256 of the token; raw token never stored
  last_used_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

-- WhatsApp / Telegram / future channel mappings
CREATE TABLE channel_identities (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  channel      TEXT NOT NULL,               -- 'whatsapp' | 'telegram'
  external_id  TEXT NOT NULL,               -- E.164 phone or telegram chat id
  display_name TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (channel, external_id)
);
CREATE INDEX idx_channel_identities_user ON channel_identities(user_id);

-- Optional: claim codes for the "Mode A" link flow (§05)
CREATE TABLE channel_claims (
  code         TEXT PRIMARY KEY,            -- e.g. 'OC-7K2X9Q'
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  consumed_at  TEXT
);
```

### Optional: `user_metadata` Table (Future, Not Created in v1)

Not required for the overlay model — the filesystem is the source of truth for per-user overlay state. Provided as a forward-compatibility hook for when an admin UI needs to display customization status:

```sql
-- OPTIONAL — not created in v1 schema; add in a future migrate() version bump
CREATE TABLE user_metadata (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  soul_custom   INTEGER NOT NULL DEFAULT 0,   -- 1 if user has edited their SOUL.md
  agents_custom INTEGER NOT NULL DEFAULT 0,   -- 1 if user has edited their AGENTS.md
  overlay_size  INTEGER NOT NULL DEFAULT 0,   -- last known total bytes in users/<id>/
  updated_at    TEXT NOT NULL
);
```

In v1, checking whether a user has customized their overlay means `stat`-ing the file. This table is a v2 candidate when an admin UI wants to show "which users have diverged from `base/`" without a filesystem walk.

That's it. Five tables (six counting the optional claim-code table), plus this one future-hook table. No `tenants`, no `roles`, no `permissions`, no `audit_logs`, no `usage_events`, no `bot_identities`, no `conversations`, no `messages`, no `leads`. Those all live in OpenClaw's existing storage (sessions/JSON, vector memory) or in the big plan if/when needed.

## Where We Add `user_id` in Existing OpenClaw Tables

**We don't.** OpenClaw's existing files (`~/.openclaw/sessions/*.json`, `tasks.sqlite`, LanceDB) are keyed by **session id**, and once we prefix the session id with `u:<userId>:` (§06), all of those become user-scoped automatically. Zero schema changes outside our new SQLite file.

This is the single biggest difference from the big plan: it adds `tenant_id` to ~12 existing tables (plan §07 / `tenancy-model.md`), each of which is a migration, an index, a query rewrite, and a leak risk. We avoid the whole class of problem by isolating at the session-key boundary.

## Migrations

We ship one file: `src/team/db/migrate.ts`. It's an idempotent function called once at boot when team mode is on:

```ts
export function migrate(db) {
  const v = db.pragma('user_version', { simple: true });
  if (v < 1) {
    db.exec(SCHEMA_V1);          // the CREATE TABLEs above
    db.pragma('user_version = 1');
  }
  // future versions chained here
}
```

No `knex`, no `node-pg-migrate`, no migration directory. Schema changes happen in code reviews and in this one function.

## Backups

The whole DB is a single file. The operator copies it like any other OpenClaw file:

```bash
cp ~/.openclaw/team.sqlite ~/backup/team-$(date +%F).sqlite
```

A nightly cron (using OpenClaw's existing cron) can do this automatically. No new tooling.

## Connection Pool

`better-sqlite3` is a single in-process handle. There is no pool. We open it once at boot and pass it as a singleton through `src/team/db.ts`. Read/write contention is not a real concern at this scale — SQLite's WAL mode handles concurrent readers and one writer cleanly.

## Postgres Adapter (Optional, Future)

If the operator sets `OPENCLAW_TEAM_DATABASE_URL=postgres://…`, `src/team/db.ts` switches to `pg`-based access using **the same SQL** (we stay within ANSI-SQL features that both support — UUID strings, ISO dates as text). This is the bridge into the big plan: same schema, same queries, different driver. We don't ship the adapter in v1; it's a 1-file follow-up.

## Schema Footprint Summary

| Item | This plan | Big plan |
|---|---|---|
| Tables | 5–6 | 15+ |
| Foreign-key cascades | 4 | 30+ |
| Indexes | 5 | 50+ |
| `tenant_id` columns added to existing tables | 0 | ~12 |
| Migration framework | one function | knex + migrations dir |
| Required external service | none (SQLite) | Postgres + Redis |

The schema in the big plan exists for very good reasons at the SaaS scale. None of those reasons apply on a single EC2 with 10 users.
