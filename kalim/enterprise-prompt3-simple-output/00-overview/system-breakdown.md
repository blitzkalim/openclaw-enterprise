# System Breakdown — OpenClaw Team Mode

> Source of truth: `/kalim/enterprise-simple-plan/` (sections 00–12).
> This document is the **execution view** of that design — what to build, in what order, by which component.

## What We Are Building

A bolt-on **`src/team/`** overlay (~1,105 LOC across 11 new files + 5 patches) that turns OpenClaw into a small-team, multi-user, WhatsApp/Telegram-enabled deployment. Activated by `OPENCLAW_TEAM_MODE=1`. Off by default — when off, OpenClaw is byte-identical to today.

## Component Map

```
                                    ┌─────────────────────────┐
                                    │  HTTP / WS / Webhook    │
                                    └────────────┬────────────┘
                                                 │
                ┌────────────────────────────────▼──────────────────────────────────┐
                │  src/gateway/auth.ts  (PATCH +15)                                  │
                │   ─ calls resolveTeamAuth() first; falls through to legacy chain   │
                └────────────────────────────────┬──────────────────────────────────┘
                                                 │
                ┌────────────────────────────────▼──────────────────────────────────┐
                │  src/team/auth-middleware.ts (NEW ~80)                             │
                │    1. cookie  oc_session  → user_sessions row → loadUser           │
                │    2. bearer  ocp_*       → api_tokens row    → loadUser           │
                │    3. legacy  GW token    → synthetic admin                        │
                │    + resolveUserFiles(userId) attaches ctx.files (real users only) │
                └────────────────────────────────┬──────────────────────────────────┘
                                                 │
                ┌────────────────────────────────▼──────────────────────────────────┐
                │  src/team/file-resolver.ts (NEW ~120)                              │
                │    resolveUserFiles(userId) → seeds SOUL/AGENTS from base/,        │
                │    creates MEMORY/USER/TASKS empty, mkdir uploads/conversations/   │
                │    /tmp/tool_cache/logs, clears tmp/ each call                     │
                └────────────────────────────────┬──────────────────────────────────┘
                                                 │
                ┌────────────────────────────────▼──────────────────────────────────┐
                │  src/team/secure-fs.ts (NEW ~90)                                   │
                │    secureRead / secureWrite — path.resolve + boundary check       │
                │    SecureFsViolationError on any cross-user / base/ write         │
                └────────────────────────────────┬──────────────────────────────────┘
                                                 │
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────────┐
        │  Routes (registered only when OPENCLAW_TEAM_MODE=1)                        │
        │                                                                            │
        │  src/team/auth-routes.ts  (~120)                                           │
        │    POST /auth/login   POST /auth/logout   GET /auth/me   POST /auth/reset  │
        │                                                                            │
        │  src/team/team-routes.ts  (~200)                                           │
        │    GET  /team                         (HTML)                               │
        │    POST /team/users                   (admin invite)                       │
        │    GET/DELETE /team/users/:id         (admin manage)                       │
        │    GET/POST/DELETE /team/tokens       (self API tokens)                    │
        │    GET/POST/DELETE /team/identities   (self channel mappings)              │
        │                                                                            │
        │  src/team/channel-router.ts  (~150)                                        │
        │    POST /webhooks/telegram/:wsId      (X-Telegram-Bot-Api-Secret-Token)    │
        │    POST /webhooks/whatsapp/:wsId      (X-Hub-Signature-256 HMAC)           │
        │    + claim flow + Mode A/B/C sender→user mapping                           │
        └───────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────────┐
        │  src/agents/agent-command.ts (PATCH +25)                                   │
        │    if (team?.files):                                                       │
        │      override workspaceDir → users/user_<id>/                              │
        │      load SOUL/AGENTS/MEMORY/USER/TASKS via secureRead                     │
        │      append MEMORY.md updates via secureWrite at session end                │
        │                                                                            │
        │  src/sessions/session-key-utils.ts (PATCH +5)                              │
        │    if (team?.userId): return `u:${userId}:${base}` else base               │
        │                                                                            │
        │  src/plugins/plugin-loader.ts (PATCH +30)                                  │
        │    if TEAM_MODE: assertPluginTeamSafe(manifest)                            │
        │                  inject secureRead/secureWrite-backed fs proxy             │
        └───────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────────┐
        │  Persistence                                                               │
        │   ~/.openclaw/team.sqlite  (better-sqlite3) — 5–6 tables                   │
        │   ~/.openclaw/workspace/base/                ─ READ-ONLY at runtime         │
        │   ~/.openclaw/workspace/users/user_<id>/     ─ all writes scoped here       │
        │   ~/.openclaw/sessions/u:<userId>:*.json     ─ existing OpenClaw store      │
        │   ~/.openclaw/memory/*                       ─ existing LanceDB             │
        └───────────────────────────────────────────────────────────────────────────┘
```

## Component Inventory

| Layer | File | New / Patch | Lines |
|---|---|---|---|
| Boot | `src/index.ts` | Patch | +5 |
| Gateway auth | `src/gateway/auth.ts` | Patch | +15 |
| HTTP server | `src/gateway/server-http.ts` | Patch | +10 |
| Sessions | `src/sessions/session-key-utils.ts` | Patch | +5 |
| Agent runtime | `src/agents/agent-command.ts` | Patch | +25 |
| Plugin loader | `src/plugins/plugin-loader.ts` | Patch | +30 |
| package.json | `package.json` | Patch | +5 deps |
| Boot entry | `src/team/index.ts` | New | ~60 |
| DB client | `src/team/db.ts` | New | ~150 |
| DB migrate | `src/team/db-migrate.ts` | New | ~50 |
| Auth middleware | `src/team/auth-middleware.ts` | New | ~80 |
| Auth routes | `src/team/auth-routes.ts` | New | ~120 |
| Team admin routes | `src/team/team-routes.ts` | New | ~200 |
| Channel router | `src/team/channel-router.ts` | New | ~150 |
| File resolver | `src/team/file-resolver.ts` | New | ~120 |
| Secure FS | `src/team/secure-fs.ts` | New | ~90 |
| Plugin guard | `src/team/plugin-guard.ts` | New | ~30 |
| Web pages | `src/team/web/login.html`, `team.html` | New | ~150 |

## SQLite Schema (`~/.openclaw/team.sqlite`)

| Table | Purpose | Owner Epic |
|---|---|---|
| `users` | Identity, password hash, admin flag, status | EPIC 1 |
| `workspaces` | Optional grouping | EPIC 1 |
| `user_sessions` | Cookie-backed login sessions | EPIC 1 |
| `api_tokens` | Hashed bearer tokens for webhooks/CLI | EPIC 1 |
| `channel_identities` | phone/chat-id → user_id | EPIC 4 |
| `channel_claims` | Mode-A claim codes | EPIC 4 |

## Filesystem Layout (`~/.openclaw/workspace/`)

```
workspace/
├── base/                 ← READ-ONLY at runtime; operator only
│   ├── SOUL.md           (seed for new users)
│   ├── AGENTS.md         (seed for new users)
│   ├── skills/           (shared across all users)
│   └── tools/            (shared across all users)
└── users/
    └── user_<userId>/
        ├── SOUL.md       (seeded from base; may diverge)
        ├── AGENTS.md     (seeded from base; may diverge)
        ├── MEMORY.md     (empty; agent-appended)
        ├── USER.md       (empty; agent-written profile)
        ├── TASKS.md      (empty; agent-written tasks)
        ├── uploads/
        ├── conversations/
        ├── tmp/          (cleared each session)
        ├── tool_cache/
        └── logs/
```

## Activation

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `OPENCLAW_TEAM_MODE` | Yes (when team mode is desired) | unset | `1` enables the entire `src/team/` overlay |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | unset | Existing OpenClaw token; legacy fallback for synthetic admin |
| `OPENCLAW_TEAM_ADMIN_EMAIL` | First-run only | unset | Bootstrap admin email |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` | First-run only | unset | Bootstrap admin password (cleared after seeding) |
| `OPENCLAW_PUBLIC_BASE_URL` | Yes for channels | unset | Used in webhook URL construction |
| `OPENCLAW_COOKIE_SECRET` | Recommended | random per-boot | HMAC for cookie signing + AES-GCM for channel secret encryption |
| `OPENCLAW_TEAM_ALLOW_SIGNUP` | Optional | `0` | `1` allows public self-registration |
| `OPENCLAW_TEAM_DATABASE_URL` | Optional | unset | Switch SQLite → Postgres (future) |
| `OPENCLAW_HOME` | Optional | `~/.openclaw` | Override storage root |

## Build Order (Optimal Critical Path)

1. **EPIC 1 — Auth foundation.** Without users you can't do anything. Boot → DB migrate → auth-middleware → `/auth/*` routes → integration test.
2. **EPIC 2 — File system layer.** Without `resolveUserFiles` and `secureRead/Write`, agent integration leaks across users. Build before EPIC 3.
3. **EPIC 3 — Agent integration.** Wire `team` ctx and file paths into agent runtime.
4. **EPIC 4 — Channel routing.** Telegram first (free, simpler verification), then WhatsApp (Meta Cloud HMAC).
5. **EPIC 5 — Security enforcement.** Plugin guard, rate limits, CSRF, encryption-at-rest. (Largely a hardening pass on top of 1–4.)
6. **EPIC 6 — Admin UI.** `/team` page, invite flow, identity linking. Last because everything below it must already work.
7. **EPIC 7 — Database & migrations.** Cross-cutting; primarily owned by EPIC 1 but ongoing.
8. **EPIC 8 — Deployment & config.** Docker Compose, Caddyfile, env-var docs. Final packaging.

## Testing Strategy (See `04-test-plans/test-cases.md`)

- **Functional**: every story has at least one happy-path test.
- **Security**: cross-user reads, path traversal, signature failures, expired sessions, plugin escape, base/ writes — every threat in §11 has a test.
- **Regression**: with `OPENCLAW_TEAM_MODE` unset, existing OpenClaw test suite passes unchanged. This is non-negotiable.
- **Integration**: full webhook → user resolution → agent → reply path tested end-to-end at least once per channel.
