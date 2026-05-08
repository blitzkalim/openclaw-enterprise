# Epic List

> All epics derive from `/kalim/enterprise-simple-plan/`. Each epic ships independently, in the **build order** given in `00-overview/system-breakdown.md`. Each epic's stories live under `02-stories/epic-N-*.md`.

## EPIC 1 — Authentication & Identity Layer

**Goal**: Replace single-token gateway access with three-credential resolver (cookie / API token / legacy fallback) backed by SQLite, without breaking the existing `OPENCLAW_GATEWAY_TOKEN`.

**Source**: `04-auth-design/auth.md`, `07-minimal-db-changes/db.md`.

**Components**:
- `src/team/index.ts` — boot wiring
- `src/team/db.ts` + `src/team/db-migrate.ts` — SQLite schema
- `src/team/auth-middleware.ts` — `resolveTeamAuth(req)`
- `src/team/auth-routes.ts` — `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/reset`
- Patches: `src/index.ts`, `src/gateway/auth.ts`, `src/gateway/server-http.ts`

**Stories**: 1.1 → 1.7

---

## EPIC 2 — User Overlay File System

**Goal**: Lazy-create per-user file overlay (`SOUL.md`, `AGENTS.md`, `MEMORY.md`, `USER.md`, `TASKS.md`, `uploads/`, `conversations/`, `tmp/`, `tool_cache/`, `logs/`) seeded from `base/` on first request. `base/` stays read-only at runtime.

**Source**: `02-extension-strategy/strategy.md` Layer 5, `03-user-model/model.md` overlay section, `06-agent-usage/agents.md` per-user injection, `08-code-change-plan/changes.md` file-resolver section.

**Components**:
- `src/team/file-resolver.ts` — `resolveUserFiles(userId)` returning `UserFiles`
- Hook into `src/team/auth-middleware.ts` to attach `ctx.files` for non-admin users

**Stories**: 2.1 → 2.5

---

## EPIC 3 — Agent Runtime Integration

**Goal**: Wire `team.userId`, `team.workspaceId`, and `team.files` into the existing agent runtime (`src/agents/agent-command.ts`) without rewriting any LLM, tool, or streaming logic. Add user-prefixing to session keys.

**Source**: `06-agent-usage/agents.md`, `02-extension-strategy/strategy.md` patches.

**Components**:
- Patch: `src/agents/agent-command.ts` (+25)
- Patch: `src/sessions/session-key-utils.ts` (+5)
- Memory append/trim helper inside `src/team/file-resolver.ts` or co-located

**Stories**: 3.1 → 3.4

---

## EPIC 4 — Channel Routing (WhatsApp + Telegram)

**Goal**: Two webhook endpoints that verify signatures, map `external_id` → `userId`, and dispatch to existing OpenClaw runtime via the `team` ctx. Three sender-mapping modes (claim-code, admin-assign, auto-create guest).

**Source**: `05-channel-routing/routing.md`, `10-user-flows/flows.md`.

**Components**:
- `src/team/channel-router.ts` — `/webhooks/telegram/:wsId`, `/webhooks/whatsapp/:wsId`
- `src/team/channel-claim.ts` — claim-code generator + verifier
- Telegram secret-token check, WhatsApp HMAC-SHA256 verifier
- File-streaming for inbound documents into the user's `uploadsDir`

**Stories**: 4.1 → 4.7

---

## EPIC 5 — Secure File Access Enforcement

**Goal**: Wrap all team-mode file I/O behind `secureRead` / `secureWrite` that resolve the path, verify it falls under the user's root, and refuse anything that would escape (path traversal) or write to `base/`.

**Source**: `11-security-basics/security.md` §1b, `08-code-change-plan/changes.md` secure-fs section.

**Components**:
- `src/team/secure-fs.ts` — `secureRead`, `secureWrite`, `validatePath`, `validateWritePath`, `SecureFsViolationError`
- Hooked into agent-command and channel-router everywhere file I/O happens

**Stories**: 5.1 → 5.4

---

## EPIC 6 — Plugin Safety

**Goal**: When team mode is on, refuse to load plugins that haven't declared `team_safe: true` in their manifest, and inject a `secureRead`/`secureWrite`-backed `fs` proxy into plugin context for the ones that did.

**Source**: `06-agent-usage/agents.md` "What We Are NOT Doing" plugin sandboxing note, `08-code-change-plan/changes.md` plugin-guard.

**Components**:
- `src/team/plugin-guard.ts` — `assertPluginTeamSafe(manifest)`
- Patch: `src/plugins/plugin-loader.ts` (+30)

**Stories**: 6.1 → 6.3

---

## EPIC 7 — Admin APIs & UI (`/team`)

**Goal**: Two minimal HTML pages (`/login`, `/team`) plus REST endpoints for inviting users, disabling them, managing API tokens, listing channel identities, and managing channel-claim codes. Admin-only routes gated by `is_admin`.

**Source**: `04-auth-design/auth.md` Login UI, `03-user-model/model.md` invite flow, `09-deployment-model/deployment.md` first-run bootstrap.

**Components**:
- `src/team/team-routes.ts` — `/team` HTML + `/team/users`, `/team/tokens`, `/team/identities`
- `src/team/web/login.html`, `src/team/web/team.html`
- Bootstrap admin from `OPENCLAW_TEAM_ADMIN_EMAIL` / `_PASSWORD` on first start

**Stories**: 7.1 → 7.6

---

## EPIC 8 — Deployment & Configuration

**Goal**: Ship a working `docker-compose.yml`, `Caddyfile`, Dockerfile updates, env-var documentation, and the `migrate()` boot path that lazy-creates the SQLite schema and bootstrap admin.

**Source**: `09-deployment-model/deployment.md`.

**Components**:
- `docker-compose.yml`, `Caddyfile`, image build
- Boot sequence in `src/team/index.ts` and `src/index.ts` patch
- Env-var documentation
- Backup cron / `cp` snippets

**Stories**: 8.1 → 8.5

---

## Epic Dependency Graph

```
   ┌────────┐
   │ EPIC 1 │  Auth foundation — gates everything else
   └────┬───┘
        │
        ├──────────────────┐
        ▼                  ▼
   ┌────────┐         ┌────────┐
   │ EPIC 2 │         │ EPIC 7 │  Admin UI (depends on EPIC 1 only)
   │ files  │         │  /team │
   └────┬───┘         └────────┘
        │
        ├──────────────────┐
        ▼                  ▼
   ┌────────┐         ┌────────┐
   │ EPIC 5 │         │ EPIC 3 │  Agent integration (depends on EPIC 2)
   │secureFS│◄────────┤agents  │
   └────────┘         └────┬───┘
                           │
                           ▼
                      ┌────────┐
                      │ EPIC 6 │  Plugin safety (depends on EPIC 5)
                      │plugins │
                      └────────┘

   ┌────────┐
   │ EPIC 4 │  Channels (depends on EPIC 1, 2, 3, 5)
   │channels│
   └────────┘

   ┌────────┐
   │ EPIC 8 │  Deployment (final)
   │ deploy │
   └────────┘
```

## Total Story Count

| Epic | Stories | Approx LOC |
|---|---|---|
| EPIC 1 — Auth | 7 | ~340 |
| EPIC 2 — Files | 5 | ~120 |
| EPIC 3 — Agents | 4 | ~60 |
| EPIC 4 — Channels | 7 | ~240 |
| EPIC 5 — Security | 4 | ~90 |
| EPIC 6 — Plugins | 3 | ~60 |
| EPIC 7 — Admin UI | 6 | ~350 |
| EPIC 8 — Deployment | 5 | ~50 (config) |
| **Total** | **41** | **~1,310** |
