# 03 — User Model

## The Whole Model

```
User                        ← always required when team mode is on
  └─ belongs to 0..1 Workspace   (optional, lazy)
```

Two entities. That is the entire data model for identity. No tenants, no orgs, no platforms, no role tables, no permission catalogs.

## User

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (uuid) | Stable id used everywhere downstream |
| `email` | TEXT UNIQUE | Login identifier |
| `password_hash` | TEXT | Argon2id (or bcrypt — whatever ships with the chosen lib) |
| `name` | TEXT | Display name; default to email's local part |
| `is_admin` | INTEGER (0/1) | The **only** role bit. Admins can invite, deactivate, and edit channel mappings |
| `workspace_id` | TEXT NULL | NULL means the user is in the default/implicit workspace |
| `created_at` | TEXT (ISO) | |
| `last_seen_at` | TEXT (ISO) NULL | |
| `status` | TEXT | `active` \| `disabled` |

Soft delete by setting `status = 'disabled'`. No cascade deletes. No GDPR tooling — out of scope for OSS-friendly small-team mode.

## Workspace (Optional)

Use only if a single OpenClaw install is shared by **two cooperating teams** that should not see each other's WhatsApp conversations.

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT (uuid) | |
| `name` | TEXT | Display name |
| `created_at` | TEXT (ISO) | |

If you do not create a workspace, every user has `workspace_id = NULL` and they all share the same view. **This is the default.** A workspace is just a grouping label that participates in session-key prefixing — nothing more.

## Counts and Limits

| Limit | Value | Why |
|---|---|---|
| Users per install | recommended ≤ 10 | SQLite write contention, single-process gateway, manual ops |
| Workspaces per install | recommended ≤ 3 | Same |
| Hard cap enforced in code? | **No** | Friction without value at this scale; the OSS user can override |

If the user base grows past these numbers, the project should migrate to the full enterprise plan (Postgres, JWT, RBAC).

## Why No Roles Beyond `is_admin`

Two reasons:

1. **Real cost.** A role+permission system means a permission catalog, role table, role-assignment table, middleware to check permissions per method, and UI to assign them. That's the bulk of `/kalim/enterprise-plan/06-rbac-design/`. For 10 users, the value is near zero.
2. **OpenClaw doesn't enforce per-method permissions today.** Adding a permission gate would require touching `src/gateway/server-methods-list.ts` and every method registration. We deliberately don't.

`is_admin` exists for one reason: to gate **who can invite a new user, change channel webhook secrets, or disable an account**. That's a single check in three or four routes.

## Why a Workspace Field but No Workspace Logic

The `workspace_id` column on `users` and on `channel_identities` (see §07) lets an admin segment two teams in the same install **without** building a tenant-router. Session keys and channel-identity lookups are scoped by it when present, ignored when null. This is a 5-line condition, not a feature.

If two workspaces is not enough, the project has outgrown this plan and should adopt the full multi-tenant design.

## How a User Comes Into Existence

| Path | Who creates | When |
|---|---|---|
| **Bootstrap admin** | First-run script | At `OPENCLAW_TEAM_MODE=1` startup, if the `users` table is empty, create one admin from `OPENCLAW_TEAM_ADMIN_EMAIL` + `OPENCLAW_TEAM_ADMIN_PASSWORD` env vars |
| **Invite** | Admin via `/team` page | POST `/team/users` with email; sets a one-time `invite_token`; user opens `/team/accept?token=…` and sets a password |
| **Self-register** | Optional | Off by default. Toggle `OPENCLAW_TEAM_ALLOW_SIGNUP=1` if running on a private network |

We **do not** ship email-sending. The invite link is shown to the admin in the UI; they share it manually (Slack, WhatsApp, email — their choice).

## What Existing OpenClaw Sees

When a request resolves, the gateway sees one extra thing:

```ts
req.team = {
  userId: 'u_a3f…',
  workspaceId: 'w_91…' | null,
  isAdmin: false,
};
```

Or `req.team` is `undefined` when team mode is off, in which case OpenClaw behaves exactly as it does today. That single optional shape is the entire identity contract that flows into the rest of the system.

After file resolution (see §02, Layer 5), `req.team` gains three additional fields:

```ts
req.team = {
  userId:      'u_a3f…',
  workspaceId: 'w_91…' | null,
  isAdmin:     false,
  // Attached by resolveUserFiles() — present on every real user request:
  files: {
    soulPath:          '~/.openclaw/workspace/users/user_u_a3f/SOUL.md',
    agentsPath:        '~/.openclaw/workspace/users/user_u_a3f/AGENTS.md',
    memoryPath:        '~/.openclaw/workspace/users/user_u_a3f/MEMORY.md',
    userProfilePath:   '~/.openclaw/workspace/users/user_u_a3f/USER.md',
    tasksPath:         '~/.openclaw/workspace/users/user_u_a3f/TASKS.md',
    uploadsDir:        '~/.openclaw/workspace/users/user_u_a3f/uploads/',
    conversationsDir:  '~/.openclaw/workspace/users/user_u_a3f/conversations/',
    tmpDir:            '~/.openclaw/workspace/users/user_u_a3f/tmp/',
    toolCacheDir:      '~/.openclaw/workspace/users/user_u_a3f/tool_cache/',
    logsDir:           '~/.openclaw/workspace/users/user_u_a3f/logs/',
  }
};
```

The synthetic `admin` user (legacy gateway token) does **not** get `files` — it uses the global `base/` files directly, as single-user OpenClaw always has.

## Per-User Agent Context (Overlay Files)

Each user operates with isolated agent context files stored on disk at:

```
~/.openclaw/workspace/users/user_<id>/   ← ALL writes go here
  SOUL.md          ← agent personality for this user
  AGENTS.md        ← agent instructions for this user
  MEMORY.md        ← persistent cross-session memory
  USER.md          ← user profile and preferences (written by agent)
  TASKS.md         ← pending tasks and reminders (written by agent)
  uploads/         ← inbound PDFs, images, documents
  conversations/   ← per-session transcript files (optional archival)
  tmp/             ← scratch space; cleared between sessions
  tool_cache/      ← cached tool results scoped to this user
  logs/            ← per-user agent execution logs
```

**`base/` is shared and read-only.** No runtime write may touch it.

These files are **not** created at user-registration time. They are lazy-initialized on the user's **first request** by `resolveUserFiles(userId)` in `src/team/file-resolver.ts`.

### Why Per-User Files Instead of Alternatives

| Approach | Problem |
|---|---|
| Shared SOUL.md | Priya's agent behavior changes Amit's; one edit affects everyone |
| Shared MEMORY.md | Amit reads Priya's conversation context; concurrent writes corrupt the file |
| Full workspace duplication | Skills/tools doubled per user; upgrades must touch every copy |
| **User overlay (this design)** | Files isolated per user; skills/tools shared from `base/`; base upgrades propagate automatically to unseeded users |

### Isolation Contract

| Isolated per user (all under `users/user_<id>/`) | Shared — read-only from `base/` |
|---|---|
| `SOUL.md` (agent personality) | `base/skills/` |
| `AGENTS.md` (agent config/instructions) | `base/tools/` |
| `MEMORY.md` (persistent cross-session context) | `base/SOUL.md` (seed only) |
| `USER.md` (user profile / preferences) | `base/AGENTS.md` (seed only) |
| `TASKS.md` (pending tasks / reminders) | Agent runtime code |
| `uploads/` (inbound files) | Plugin runtime |
| `conversations/` (session transcripts) | LLM model config |
| `tmp/` (scratch space, session-scoped) | |
| `tool_cache/` (cached tool results) | |
| `logs/` (execution logs) | |
| Chat history (session-key prefix `u:<id>:`) | |

### Seeding Behavior

When a user's file does not yet exist:

```
SOUL.md         → copied from base/SOUL.md   (gets baseline personality)
AGENTS.md       → copied from base/AGENTS.md (gets baseline agent config)
MEMORY.md       → created as empty file      (no prior context)
USER.md         → created as empty file      (agent populates over time)
TASKS.md        → created as empty file      (agent populates over time)
uploads/        → empty directory created
conversations/  → empty directory created
tmp/            → empty directory created    (cleared each session start)
tool_cache/     → empty directory created
logs/           → empty directory created
```

Once a user's copy exists it is **never overwritten** by the resolver — their file diverges from `base/` freely. An operator who wants to reset a user to baseline simply deletes their `users/user_<id>/` directory; the next request re-seeds it.
