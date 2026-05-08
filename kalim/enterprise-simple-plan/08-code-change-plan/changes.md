# 08 — Code Change Plan

## Summary

| Category | Files | Approx Lines |
|---|---|---|
| **New** (`src/team/`) | 11 | ~1,010 |
| **Patch** (existing OpenClaw) | 5 | ~95 |
| **Total** | **16** | **~1,105** |

Compare to the big plan's `~9,200 lines, 50+ new files` (`/kalim/enterprise-plan/15-code-change-map/`). Same shape, ~12× smaller surface.

## New Files

All under `src/team/`. Self-contained: nothing in here is referenced from outside the four upstream patch points.

| File | Purpose | Lines |
|---|---|---|
| `src/team/index.ts` | Boot entrypoint; registers routes, opens DB, exports `resolveTeamAuth` | ~60 |
| `src/team/db.ts` | better-sqlite3 client + repository functions | ~150 |
| `src/team/db-migrate.ts` | Idempotent schema bootstrap (§07) | ~50 |
| `src/team/auth-middleware.ts` | Resolves cookie / API token / legacy → `TeamCtx` | ~80 |
| `src/team/auth-routes.ts` | `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/reset` | ~120 |
| `src/team/team-routes.ts` | `/team` UI + `/team/users`, `/team/tokens`, `/team/identities` admin endpoints | ~200 |
| `src/team/channel-router.ts` | `/webhooks/whatsapp/:wsId` + `/webhooks/telegram/:wsId`, claim handler | ~150 |
| `src/team/file-resolver.ts` | Per-user overlay: ensure all dirs, seed SOUL.md + AGENTS.md from `base/`, create MEMORY/USER/TASKS empty, clear `tmp/` each call, return full `UserFiles` struct | ~120 |
| `src/team/secure-fs.ts` | `secureRead(userId, path)`, `secureWrite(userId, path)`, `validatePath`, `validateWritePath`, `SecureFsViolationError` — path boundary enforcement for all user file I/O | ~90 |
| `src/team/plugin-guard.ts` | `assertPluginTeamSafe(manifest)` — rejects plugins without `team_safe: true` in their manifest when `OPENCLAW_TEAM_MODE=1` | ~30 |
| `src/team/web/` | Two static-rendered HTML pages (`login.html`, `team.html`) | ~150 |

## Patches to Existing OpenClaw

Each patch is a short, additive change inside an `if (teamCtx) { … }` guard. Rebases on upstream cost minutes, not hours.

| File | Current Purpose | Change Needed | Risk | Notes |
|---|---|---|---|---|
| `src/index.ts` | Process entry | Call `await initTeamModule()` after gateway boot if `OPENCLAW_TEAM_MODE=1` | **Low** | Wrapped in env-flag check |
| `src/gateway/auth.ts` | Bearer-token + Tailscale + proxy + device auth | At top of the existing authorize fn, call `resolveTeamAuth(req)`; on hit, attach `req.team` and return ok. On miss, fall through to existing logic untouched. | **Low** | ~15 lines; the entire existing chain is preserved |
| `src/gateway/server-http.ts` | Static route registration | Mount `auth-routes`, `team-routes`, `channel-router` only when team mode is on | **Low** | Two `if (TEAM_MODE) app.use(...)` lines |
| `src/sessions/session-key-utils.ts` | Derives session key from connection / channel | When `team.userId` is present in the derivation input, prefix the resulting key with `u:<userId>:` | **Low** | ~5 lines, default branch unchanged |
| `src/agents/agent-command.ts` | Agent runtime orchestrator (~1,200 lines) | When `teamCtx.files` present: override `workspaceDir` to `users/user_<id>/`; load MEMORY/USER/TASKS via `secureRead`; prepend to system prompt; on session end write memory update via `secureWrite` | **Low–Medium** | ~25 lines, all inside `if (teamCtx?.files)` guard |
| `src/plugins/plugin-loader.ts` | Loads and executes plugins | When team mode is on, inject `secureRead`/`secureWrite`-backed `fs` proxy into plugin context; call `assertPluginTeamSafe(manifest)` before loading | **Medium** | ~30 lines, only active when `OPENCLAW_TEAM_MODE=1` |
| `package.json` | npm manifest | Add `better-sqlite3`, `argon2` (or use Node `crypto.scrypt` to avoid native deps); optionally `cookie` | **Low** | 2 deps |

### What we explicitly do NOT patch

| File | Why |
|---|---|
| `src/gateway/server-ws-runtime.ts` | WebSocket auth path is shared with HTTP via the same `authorize` function in `auth.ts`; one patch point covers both |
| `src/gateway/server-methods-list.ts` | We do not gate gateway methods by user role; not needed for "small team" |
| `src/config/io.ts` | Config stays in JSON5; we don't move it to DB |
| `src/channels/plugins/configured-binding-compiler.ts` | Channel bindings remain global; user mapping happens at the webhook router, not at the binding compiler |
| `src/agents/pi-tools.ts` and other tool files | No tenant-aware tool wrapping — simple plan trusts tools; plugin context injection (via `plugin-loader.ts`) is sufficient |
| `src/media/store.ts` | Unchanged; team-mode media is routed to `uploads/` by the channel router, not by the media store |
| `extensions/telegram/`, `extensions/whatsapp/`, all `extensions/*` | Untouched. The webhook router in `src/team/channel-router.ts` is *additive* — it lives alongside the existing extensions |
| `src/plugins/*`, `src/skills/*`, `src/memory/*` | All unchanged |
| `ui/` (React control UI) | Unchanged. Continues to work with the gateway token. Team users open `/login` instead. |

## Patch Snippets (Reference)

### `src/index.ts`

```ts
import { initTeamModule } from './team';

async function main() {
  await initGateway();
  if (process.env.OPENCLAW_TEAM_MODE === '1') {
    await initTeamModule();
  }
}
```

### `src/gateway/auth.ts`

```ts
import { resolveTeamAuth } from '../team/auth-middleware';

export function authorizeHttpGatewayConnect(req) {
  if (process.env.OPENCLAW_TEAM_MODE === '1') {
    const team = resolveTeamAuth(req);
    if (team) {
      (req as any).team = team;
      return true;
    }
  }
  // Existing logic: gateway token, Tailscale, proxy, device-token
  return existingAuthLogic(req);
}
```

### `src/sessions/session-key-utils.ts`

```ts
export function deriveSessionKey(parts) {
  const base = existingDerivation(parts);          // unchanged
  const userId = parts.team?.userId;
  return userId ? `u:${userId}:${base}` : base;
}
```

### `src/agents/agent-command.ts` (the runtime entry)

```ts
// On the inbound runtime request shape:
type RuntimeRequest = {
  /* existing fields */
  team?: { userId: string; workspaceId: string | null; isAdmin: boolean };
};

// In the fn that constructs per-call ctx:
const ctx = {
  ...existingCtx,
  team: req.team,
};
```

That is the entirety of the agent-runtime change. No prompt logic, no tool dispatch, no streaming code is touched.

## Migration Risk Per Patch

| Patch point | Upstream churn likelihood | Conflict severity |
|---|---|---|
| `src/index.ts` boot | Low | Trivial — boot call is a one-liner |
| `src/gateway/auth.ts` | Medium (auth churns) | Low — our addition is at the top, before existing logic |
| `src/gateway/server-http.ts` | Medium (routes churn) | Low — our routes are namespaced under `/auth/*`, `/team/*`, `/webhooks/*` |
| `src/sessions/session-key-utils.ts` | Low | Trivial |
| `src/agents/agent-command.ts` | High (large file, active dev) | Low — additive optional field |
| `package.json` | Constant | Trivial |

The biggest exposure is `agent-command.ts` because it changes often. Mitigation: the only thing we add is "accept an extra optional field on the request shape and pass it through". If upstream renames the request shape, our patch follows the rename; we never depend on internal logic.

## Tests to Add

Bundled with the new files in `src/team/`:

| Test | What it asserts |
|---|---|
| `src/team/auth-middleware.test.ts` | Cookie, API token, legacy fallback all resolve correctly; bad creds 401 |
| `src/team/db.test.ts` | Schema migrates, repos round-trip, cascade deletes |
| `src/team/channel-router.test.ts` | Telegram secret-token check, WhatsApp HMAC verify, Mode-A claim flow, unknown sender drop |
| `src/team/integration.test.ts` | End-to-end: login → POST webhook → agent runtime gets `userId` → response sent |

Plus one **regression test** to assert that with `OPENCLAW_TEAM_MODE` unset, the existing OpenClaw test suite passes unchanged. This is the single most important guard against scope creep into upstream code.

## Build Integration

No bundler, no build-step changes. Same `tsc` invocation. `better-sqlite3` is the only native dep; document the prebuild for Linux/macOS/Windows in `09-deployment-model`.

---

## File Resolver Layer (NEW)

### Component: `src/team/file-resolver.ts`

Single exported function. Pure filesystem — no SQLite dependency, no HTTP, no agent runtime coupling.

```ts
import path from 'node:path';
import fs   from 'node:fs/promises';

const OPENCLAW_HOME  = process.env.OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`;
const WORKSPACE_ROOT = path.join(OPENCLAW_HOME, 'workspace');
const BASE_DIR       = path.join(WORKSPACE_ROOT, 'base');

export type UserFiles = {
  // Seeded from base/ on first use
  soulPath:         string;   // absolute path — guaranteed to exist
  agentsPath:       string;   // absolute path — guaranteed to exist
  // Created empty on first use
  memoryPath:       string;   // absolute path — guaranteed to exist (may be empty)
  userProfilePath:  string;   // absolute path — USER.md, agent writes profile/prefs
  tasksPath:        string;   // absolute path — TASKS.md, agent writes pending tasks
  // Directories created on first use
  uploadsDir:       string;   // inbound PDFs / images
  conversationsDir: string;   // per-session transcript files
  tmpDir:           string;   // scratch space; cleared each session
  toolCacheDir:     string;   // cached tool results
  logsDir:          string;   // execution log files
};

async function ensureEmpty(filePath: string): Promise<void> {
  try { await fs.access(filePath); } catch { await fs.writeFile(filePath, '', 'utf8'); }
}

async function ensureCopied(src: string, dest: string): Promise<void> {
  try { await fs.access(dest); } catch { await fs.copyFile(src, dest); }
}

export async function resolveUserFiles(userId: string): Promise<UserFiles> {
  const userDir = path.join(WORKSPACE_ROOT, 'users', `user_${userId}`);

  // Step 1 — ensure user root + all subdirectories
  const uploadsDir        = path.join(userDir, 'uploads');
  const conversationsDir  = path.join(userDir, 'conversations');
  const tmpDir            = path.join(userDir, 'tmp');
  const toolCacheDir      = path.join(userDir, 'tool_cache');
  const logsDir           = path.join(userDir, 'logs');

  await Promise.all([
    fs.mkdir(userDir,           { recursive: true }),
    fs.mkdir(uploadsDir,        { recursive: true }),
    fs.mkdir(conversationsDir,  { recursive: true }),
    fs.mkdir(tmpDir,            { recursive: true }),
    fs.mkdir(toolCacheDir,      { recursive: true }),
    fs.mkdir(logsDir,           { recursive: true }),
  ]);

  // Step 2 — files seeded from base/ (copy once, never overwrite)
  const soulPath   = path.join(userDir, 'SOUL.md');
  const agentsPath = path.join(userDir, 'AGENTS.md');
  await ensureCopied(path.join(BASE_DIR, 'SOUL.md'),   soulPath);
  await ensureCopied(path.join(BASE_DIR, 'AGENTS.md'), agentsPath);

  // Step 3 — files created empty on first use
  const memoryPath      = path.join(userDir, 'MEMORY.md');
  const userProfilePath = path.join(userDir, 'USER.md');
  const tasksPath       = path.join(userDir, 'TASKS.md');
  await Promise.all([
    ensureEmpty(memoryPath),
    ensureEmpty(userProfilePath),
    ensureEmpty(tasksPath),
  ]);

  // Step 4 — clear tmp/ at the start of each session
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  return {
    soulPath, agentsPath,
    memoryPath, userProfilePath, tasksPath,
    uploadsDir, conversationsDir, tmpDir, toolCacheDir, logsDir,
  };
}
```

### Patch: `src/team/auth-middleware.ts` (+5 lines)

```ts
// After existing credential resolution — add at the bottom of resolveTeamAuth():
if (ctx && ctx.userId !== 'admin') {
  ctx.files = await resolveUserFiles(ctx.userId);
}
```

That is the entire integration point. No other file calls `resolveUserFiles` directly.

### Why This Component Is Separate

- Callable from auth middleware without importing agent runtime.
- Unit-testable against a temp directory — no DB, no LLM needed.
- Single place that constructs user file paths — no other code builds them.
- Idempotent: running it N times for the same user never overwrites an existing file.

### Tests to Add

| Test file | What it asserts |
|---|---|
| `src/team/file-resolver.test.ts` | First call creates all dirs + seeds SOUL/AGENTS, creates empty MEMORY/USER/TASKS; second call returns same paths without overwriting; `tmp/` is cleared on every call; missing `base/SOUL.md` throws clearly; `admin` user never passed to resolver |
| Update `src/team/integration.test.ts` | Agent receives `ctx.team.files` with all 10 fields as valid absolute paths; user A's `memoryPath` !== user B's; user A's `logsDir` !== user B's; no shared writable path exists across users |
