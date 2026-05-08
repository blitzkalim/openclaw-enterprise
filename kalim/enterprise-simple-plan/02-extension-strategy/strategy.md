# 02 — Extension Strategy

## Principle: Bolt-on, Not Refactor

We add a single new directory: `src/team/` (parallel to `src/enterprise/` from the big plan but **much smaller** — think ~1,000 lines, not 9,000). Everything else stays put.

OpenClaw core is **edited at exactly four points** — all of them are 5–30 line additions, all are guarded by an env flag, and all fall back to existing behavior when the flag is off.

Two new modules in `src/team/` provide the security backbone:
- **`src/team/file-resolver.ts`** — resolves per-user file paths, seeds from `base/`, clears `tmp/`
- **`src/team/secure-fs.ts`** — `secureRead`/`secureWrite` wrappers that enforce user boundary

## Where We Add Logic

```
┌──────────────────────────────────────────────────────────────────┐
│  HTTP request / WebSocket / Webhook                              │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/team/auth-middleware.ts             (NEW, ~80 lines)        │
│    - Try team JWT/cookie → resolve user_id                       │
│    - Try API token → resolve user_id                             │
│    - Else fall through to existing OPENCLAW_GATEWAY_TOKEN check  │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/gateway/auth.ts                     (PATCH, +15 lines)      │
│    - Call resolveTeamAuth() first                                │
│    - Attach { userId, workspaceId } to req                       │
│    - Existing token logic unchanged as fallback                  │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/team/channel-router.ts              (NEW, ~150 lines)       │
│    POST /webhooks/whatsapp                                       │
│    POST /webhooks/telegram                                       │
│      → verify signature                                          │
│      → look up channel_identity (phone → user_id)                │
│      → set sessionKey = `user:${userId}:${threadId}`             │
│      → forward to existing agent runtime                         │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/team/file-resolver.ts              (NEW, ~120 lines)        │
│    resolveUserFiles(userId) — called from auth-middleware        │
│    Seeds SOUL/AGENTS from base/, creates empty MEMORY/USER/TASKS │
│    Creates uploads/, conversations/, tmp/, tool_cache/, logs/    │
│    Clears tmp/ every call (session scratch space)                │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/team/secure-fs.ts                  (NEW, ~90 lines)         │
│    secureRead(userId, path)  — validates boundary, then reads    │
│    secureWrite(userId, path) — validates boundary, then writes   │
│    validatePath(userId, path) — path.resolve + boundary check    │
│    Blocks: path traversal, cross-user reads, writes to base/     │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/agents/agent-command.ts             (PATCH, +25 lines)      │
│    - Override workspaceDir to users/user_<id>/ when team present │
│    - Read SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md       │
│      via secureRead(userId, team.files.<path>)                   │
│    - Write MEMORY update via secureWrite on session end          │
│  (No changes to LLM call, tool dispatch, or streaming.)          │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/sessions/session-key-utils.ts       (PATCH, +5 lines)       │
│    - When userId present, prefix session key with `u:${userId}:` │
│    - Else fall back to existing key derivation                   │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/team/db.ts                          (NEW, ~120 lines)       │
│    - Better-sqlite3 over ~/.openclaw/team.sqlite                 │
│    - Tables: users, user_sessions, channel_identities,           │
│              workspaces (optional), api_tokens                   │
└──────────────────────────────────────────────────────────────────┘
```

## What We Don't Touch

- `src/agents/*` — agent runtime, tool dispatch, prompt building
- `src/channels/*` — channel core, binding compiler, allowlists
- `src/plugins/*` — plugin loader, plugin SDK
- `src/memory/*` — vector memory (we just key it by user)
- `src/config/*` — config IO, JSON5 parsing
- `extensions/*` — all 100+ extensions, including `telegram` and `whatsapp` plugins
- `ui/` — existing control UI (it keeps using `OPENCLAW_GATEWAY_TOKEN` or a per-user token)
- `src/cron/*`, `src/flows/*`, `src/skills/*`

## Activation Switch

The whole layer is gated by **one env var**:

```bash
OPENCLAW_TEAM_MODE=1
```

- Unset → OpenClaw behaves **bit-for-bit identical** to today. Single user, gateway token, no DB, no webhooks.
- Set → `src/team/init.ts` runs at boot:
  - Opens `~/.openclaw/team.sqlite` (creates schema if absent).
  - Registers `/auth/*` routes.
  - Registers `/webhooks/whatsapp` and `/webhooks/telegram`.
  - Installs the auth-middleware in front of the existing gateway auth.

This matches the enterprise plan's `DATABASE_URL` switch (`/kalim/enterprise-plan/16-backward-compatibility/`), but with SQLite + a single flag instead of Postgres + Redis.

## The Four Layers, in One Sentence

1. **Auth middleware** — resolves a `userId` if any team-mode credential is present.
2. **DB layer** — one SQLite file with five tiny tables.
3. **Channel router** — webhook endpoints that map sender → user → existing agent path.
4. **Session/memory keying** — prefix everything with `u:<userId>:` so two users on one install don't see each other's history.

That is the entire design. The next 10 sections expand each piece, but the picture above is the whole product.

## Layer 5 — User Overlay File Resolver (NEW)

A fifth layer sits between auth resolution and agent execution. After `user_id` is resolved, before the runtime call is made, the system resolves user-specific file paths.

```
┌──────────────────────────────────────────────────────────────────┐
│  src/team/file-resolver.ts               (NEW, ~120 lines)       │
│    resolveUserFiles(userId):                                      │
│      - Ensure workspace/users/user_<id>/ exists                  │
│      - SOUL.md:   if absent, copy from workspace/base/SOUL.md    │
│      - AGENTS.md: if absent, copy from workspace/base/AGENTS.md  │
│      - MEMORY.md: if absent, create empty file                   │
│      - USER.md:   if absent, create empty file                   │
│      - TASKS.md:  if absent, create empty file                   │
│      - conversations/, uploads/, tmp/, tool_cache/, logs/        │
│        → ensure directories exist                                │
│      - Return full UserFiles struct                              │
│    base/ stays read-only: skills/, tools/ only                   │
└──────────────────────────────────────────────────────────────────┘
```

### Workspace Directory Layout

```
~/.openclaw/workspace/
  base/                    ← READ-ONLY for runtime; operator edits only
    SOUL.md                ← baseline personality (seed for all users)
    AGENTS.md              ← baseline agent config (seed for all users)
    skills/                ← shared for all users — never per-user
    tools/                 ← shared for all users — never per-user

  users/
    user_<id>/             ← ALL runtime writes go here, never to base/
      SOUL.md              ← seeded from base/; user/agent may diverge
      AGENTS.md            ← seeded from base/; user/agent may diverge
      MEMORY.md            ← persistent cross-session memory (append-only)
      USER.md              ← user profile / preferences written by agent
      TASKS.md             ← pending tasks and reminders for this user
      uploads/             ← inbound PDFs, images, documents
      conversations/       ← per-session transcript files (optional archival)
      tmp/                 ← scratch space; cleared between sessions
      tool_cache/          ← cached tool results scoped to this user
      logs/                ← per-user agent execution logs
```

**Principle:** `base/` is the only shared directory and is treated as **read-only by the runtime**. No agent, skill, tool, or channel router may write to `base/`. All writes go to `users/user_<id>/`.

### File Resolution Rules (Enforced by `resolveUserFiles`)

| File / Directory | Seed rule | Writable at runtime |
|---|---|---|
| `users/<id>/SOUL.md` | Copy `base/SOUL.md` if missing | Yes — agent may append learnings |
| `users/<id>/AGENTS.md` | Copy `base/AGENTS.md` if missing | Yes — operator may edit per user |
| `users/<id>/MEMORY.md` | Create empty if missing | Yes — append-only by agent |
| `users/<id>/USER.md` | Create empty if missing | Yes — agent writes user profile/prefs |
| `users/<id>/TASKS.md` | Create empty if missing | Yes — agent writes pending tasks |
| `users/<id>/uploads/` | Create dir if missing | Yes — inbound files land here |
| `users/<id>/conversations/` | Create dir if missing | Yes — transcript archival |
| `users/<id>/tmp/` | Create dir if missing | Yes — cleared each session |
| `users/<id>/tool_cache/` | Create dir if missing | Yes — cached tool results |
| `users/<id>/logs/` | Create dir if missing | Yes — execution log files |
| `base/skills/`, `base/tools/` | Always from `base/` | **No — read-only** |

### What We Do NOT Do

- ❌ Duplicate skills or tools per user
- ❌ Create a new workspace per user
- ❌ Allow users to specify their own file paths (all paths resolved server-side)
- ❌ Modify OpenClaw's core file-loading logic
- ❌ Write anything to `base/` at runtime — it is permanently read-only
- ❌ Share any writable file across users — every runtime-written file lives under `users/user_<id>/`

## Why This Doesn't Become a Fork

- All four edits are inside `if (teamCtx) { … }` branches. Every existing call path is preserved.
- The new code lives in `src/team/`. Upstream rebases never touch it.
- Migration from upstream releases means resolving conflicts in 4 files (`auth.ts`, `agent-command.ts`, `session-key-utils.ts`, `index.ts`). Same exposure as a 200-line patch series.

## Why It Stays Small

| Big Plan | Simple Plan |
|---|---|
| Postgres + Redis + BullMQ + MinIO | SQLite file |
| JWT (RS256) + JWKS + refresh tokens | Cookie session + signed bearer for API |
| Tenant-router middleware | Single workspace assumed; optional table |
| RBAC matrix, role hierarchy | One bit: `is_admin` on users |
| Audit logger, billing meter, license check | Out of scope |
| Admin React dashboard (~3,000 lines) | Two minimal HTML pages: `/login` and `/team` |
| Gupshup + Meta + Twilio + Baileys multi-provider | Pick **one** WhatsApp path (Meta Cloud API webhook) + Telegram bot per workspace |
| 50+ new files | ~6 new files |

Everything cut here is recoverable: the big plan still applies if/when the project grows past 10 users.
