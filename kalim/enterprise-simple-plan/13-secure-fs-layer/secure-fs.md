# 13 — Secure File System Layer

## Why This Document Exists

The previous sections established the User Overlay Model (per-user `SOUL.md`, `AGENTS.md`,
`MEMORY.md`, etc.) and defined `resolveUserFiles()` as the path resolver. This document
completes the picture by adding the **enforcement layer**: a Secure FS module that wraps
every file read and write so that no code — not the agent runtime, not a plugin, not a
skill — can access files outside the resolved user boundary, even by accident.

## Codebase Facts (Verified from Source)

From reading the actual OpenClaw source before writing this document:

| Source file | Relevant finding |
|---|---|
| `src/agents/workspace.ts` | Exports `DEFAULT_SOUL_FILENAME`, `DEFAULT_AGENTS_FILENAME`, `DEFAULT_USER_FILENAME`, `DEFAULT_MEMORY_FILENAME` — these are the real constant names |
| `src/agents/workspace.ts` | `readWorkspaceFileWithGuards()` uses `openBoundaryFile()` with a `workspaceDir` root — **this is the real boundary mechanism** |
| `src/agents/agent-paths.ts` | `resolveOpenClawAgentDir()` resolves from `resolveStateDir()` → `~/.openclaw/agents/<id>/agent/` |
| `src/agents/bootstrap-files.ts` | `resolveBootstrapFilesForRun()` takes a `workspaceDir` parameter and passes it through `sanitizeBootstrapFiles()` — all paths must be under `workspaceDir` |
| `src/config/paths.ts` | State dir = `~/.openclaw`, overrideable via `OPENCLAW_STATE_DIR` |
| `src/media/store.ts` | Writes to `resolveConfigDir()/media/` — a **shared, unscoped** directory in the base install |
| `src/media/store.ts` | `openBoundaryFile` / `MEDIA_FILE_MODE = 0o644` — files are readable by non-owner UIDs for Docker sandbox access |

**Critical gap:** `src/media/store.ts` stores all inbound media in a single shared
`~/.openclaw/media/` directory. In team mode with multiple users, media from user A and
user B land in the same folder. The overlay model fixes this by routing each user's
media to their own `uploads/` directory.

---

## SECTION 1 — Updated Architecture

```
Channel webhook (WhatsApp / Telegram)
  │
  ▼
src/team/auth-middleware.ts
  resolveTeamAuth(req)
    → verify credential (cookie / API token / legacy gateway token)
    → resolveUserFiles(userId)                    ← path resolver
    → attach req.team.files                       ← all paths now on context
  │
  ▼
src/team/channel-router.ts
  → verify webhook signature
  → map external sender → userId
  → stream media attachments → team.files.uploadsDir  (via secureWrite)
  │
  ▼
src/agents/agent-command.ts  (patched, +25 lines)
  → read SOUL.md    via secureRead(userId, team.files.soulPath)
  → read AGENTS.md  via secureRead(userId, team.files.agentsPath)
  → read MEMORY.md  via secureRead(userId, team.files.memoryPath)
  → read USER.md    via secureRead(userId, team.files.userProfilePath)
  → read TASKS.md   via secureRead(userId, team.files.tasksPath)
  → read skills     via fs.readFile(base/skills/…)      (read-only, not user-writable)
  │
  ▼
Agent executes
  │
  ▼
Write outputs:
  → MEMORY update    via secureWrite(userId, team.files.memoryPath)
  → USER.md update   via secureWrite(userId, team.files.userProfilePath)
  → TASKS.md update  via secureWrite(userId, team.files.tasksPath)
  → transcript       via secureWrite(userId, team.files.conversationsDir/<session>.jsonl)
  → tool cache       via secureWrite(userId, team.files.toolCacheDir/<key>.json)
  → logs             via secureWrite(userId, team.files.logsDir/<date>.log)
  → tmp scratch      via secureWrite(userId, team.files.tmpDir/<name>)
```

**Invariants:**
- `secureRead` / `secureWrite` reject any path not under `workspace/users/user_<userId>/`
  or `workspace/base/` (read-only).
- `base/` is checked for writes: any `secureWrite` targeting `base/` → throws immediately.
- Skills/tools load from `base/` via plain `fs.readFile` (they are operator-authored, not
  user-controlled, so no traversal risk from user input).

---

## SECTION 2 — Final Filesystem Layout

```
~/.openclaw/                                    ← OPENCLAW_STATE_DIR
  openclaw.json                                 ← global config (unchanged)
  sessions/                                     ← OpenClaw session JSONL files
    u:<userId>:<channel>:<thread>.jsonl         ← prefixed by team mode
  agents/                                       ← OpenClaw agent runtime state
  media/                                        ← legacy shared media (kept for backward compat)
  team.sqlite                                   ← team mode DB (new)

  workspace/
    base/                                       ← READ-ONLY at runtime
      SOUL.md                                   ← operator-authored personality seed
      AGENTS.md                                 ← operator-authored agent config seed
      skills/                                   ← shared skills (all users)
      tools/                                    ← shared tools (all users)

    users/
      user_<userId>/                            ← ALL user runtime I/O goes here
        SOUL.md          ← seeded from base/ on first request
        AGENTS.md        ← seeded from base/ on first request
        MEMORY.md        ← empty on first request; agent appends
        USER.md          ← empty on first request; agent writes profile
        TASKS.md         ← empty on first request; agent writes tasks
        uploads/         ← inbound channel media (replaces shared media/ for team mode)
        conversations/   ← session transcript archival
        tmp/             ← cleared each session
        tool_cache/      ← cached tool results
        logs/            ← execution logs
```

Key change from the base install: in team mode, inbound media from `src/media/store.ts`
is redirected to `workspace/users/user_<id>/uploads/` instead of the shared `media/`
folder. This is done by passing `team.files.uploadsDir` as the target when the channel
router calls the media store helper.

---

## SECTION 3 — File Resolution Logic

### `resolveUserFiles(userId)` — full specification

```ts
// src/team/file-resolver.ts

import path from 'node:path';
import fs   from 'node:fs/promises';

const OPENCLAW_HOME  = process.env.OPENCLAW_STATE_DIR
  ?? process.env.OPENCLAW_HOME
  ?? `${process.env.HOME}/.openclaw`;

export const WORKSPACE_ROOT = path.join(OPENCLAW_HOME, 'workspace');
export const BASE_DIR        = path.join(WORKSPACE_ROOT, 'base');

export type UserFiles = {
  // Files seeded from base/ on first use (copy-on-absent)
  soulPath:         string;
  agentsPath:       string;
  // Files created empty on first use
  memoryPath:       string;
  userProfilePath:  string;   // USER.md
  tasksPath:        string;   // TASKS.md
  // Directories created on first use
  uploadsDir:       string;
  conversationsDir: string;
  tmpDir:           string;   // cleared every call
  toolCacheDir:     string;
  logsDir:          string;
};

async function ensureEmpty(p: string): Promise<void> {
  try { await fs.access(p); }
  catch { await fs.writeFile(p, '', 'utf8'); }
}

async function ensureCopied(src: string, dest: string): Promise<void> {
  try { await fs.access(dest); }
  catch { await fs.copyFile(src, dest); }
}

export async function resolveUserFiles(userId: string): Promise<UserFiles> {
  if (!userId || userId === 'admin') {
    throw new Error('resolveUserFiles must not be called for admin/legacy users');
  }

  const userDir = path.join(WORKSPACE_ROOT, 'users', `user_${userId}`);

  // Step 1 — create all subdirectories in parallel
  const uploadsDir        = path.join(userDir, 'uploads');
  const conversationsDir  = path.join(userDir, 'conversations');
  const tmpDir            = path.join(userDir, 'tmp');
  const toolCacheDir      = path.join(userDir, 'tool_cache');
  const logsDir           = path.join(userDir, 'logs');

  await Promise.all([
    fs.mkdir(userDir,          { recursive: true }),
    fs.mkdir(uploadsDir,       { recursive: true }),
    fs.mkdir(conversationsDir, { recursive: true }),
    fs.mkdir(toolCacheDir,     { recursive: true }),
    fs.mkdir(logsDir,          { recursive: true }),
  ]);

  // Step 2 — seed from base/ (never overwrites existing user copy)
  const soulPath   = path.join(userDir, 'SOUL.md');
  const agentsPath = path.join(userDir, 'AGENTS.md');
  await ensureCopied(path.join(BASE_DIR, 'SOUL.md'),   soulPath);
  await ensureCopied(path.join(BASE_DIR, 'AGENTS.md'), agentsPath);

  // Step 3 — create empty files on first use
  const memoryPath      = path.join(userDir, 'MEMORY.md');
  const userProfilePath = path.join(userDir, 'USER.md');
  const tasksPath       = path.join(userDir, 'TASKS.md');
  await Promise.all([
    ensureEmpty(memoryPath),
    ensureEmpty(userProfilePath),
    ensureEmpty(tasksPath),
  ]);

  // Step 4 — clear tmp/ every session (scratch space)
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  return {
    soulPath, agentsPath,
    memoryPath, userProfilePath, tasksPath,
    uploadsDir, conversationsDir, tmpDir, toolCacheDir, logsDir,
  };
}
```

### Resolution rules summary

| File / Dir | On first use | On subsequent uses |
|---|---|---|
| `SOUL.md` | Copied from `base/SOUL.md` | Existing file used as-is |
| `AGENTS.md` | Copied from `base/AGENTS.md` | Existing file used as-is |
| `MEMORY.md` | Created empty | Existing file used as-is |
| `USER.md` | Created empty | Existing file used as-is |
| `TASKS.md` | Created empty | Existing file used as-is |
| `uploads/` | Directory created | Directory exists, used as-is |
| `conversations/` | Directory created | Directory exists, used as-is |
| `tmp/` | Directory created + **cleared** | **Cleared every call** |
| `tool_cache/` | Directory created | Directory exists, used as-is |
| `logs/` | Directory created | Directory exists, used as-is |
| `base/skills/`, `base/tools/` | Never created — always from `base/` | Same |

---

## SECTION 4 — Security Model

### Secure FS Module: `src/team/secure-fs.ts`

This is the enforcement layer. **All agent-layer file I/O in team mode must go through
these two functions.** They are the single chokepoint that prevents cross-user access.

```ts
// src/team/secure-fs.ts

import path from 'node:path';
import fs   from 'node:fs/promises';
import { WORKSPACE_ROOT, BASE_DIR } from './file-resolver.js';

export class SecureFsViolationError extends Error {
  constructor(userId: string, attempted: string, reason: string) {
    super(`[SecureFS] user=${userId} path=${attempted} reason=${reason}`);
    this.name = 'SecureFsViolationError';
  }
}

// ─── Path Validator ────────────────────────────────────────────────────────

export function validatePath(userId: string, targetPath: string): string {
  // 1. Resolve to absolute, collapse any .. sequences
  const resolved = path.resolve(targetPath);

  // 2. Allowed read roots
  const userRoot = path.join(WORKSPACE_ROOT, 'users', `user_${userId}`);
  const baseRoot = BASE_DIR;

  const underUser = resolved.startsWith(userRoot + path.sep)
    || resolved === userRoot;
  const underBase = resolved.startsWith(baseRoot + path.sep)
    || resolved === baseRoot;

  if (!underUser && !underBase) {
    throw new SecureFsViolationError(
      userId, resolved,
      `path is outside user root (${userRoot}) and base root (${baseRoot})`,
    );
  }

  return resolved;
}

export function validateWritePath(userId: string, targetPath: string): string {
  const resolved = validatePath(userId, targetPath);

  // Writes to base/ are always denied
  if (resolved.startsWith(BASE_DIR + path.sep) || resolved === BASE_DIR) {
    throw new SecureFsViolationError(
      userId, resolved,
      'writes to base/ are forbidden — base/ is read-only at runtime',
    );
  }

  return resolved;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function secureRead(
  userId: string,
  targetPath: string,
  encoding: BufferEncoding = 'utf8',
): Promise<string> {
  const safe = validatePath(userId, targetPath);
  return fs.readFile(safe, encoding);
}

export async function secureWrite(
  userId: string,
  targetPath: string,
  content: string,
  options?: { append?: boolean },
): Promise<void> {
  const safe = validateWritePath(userId, targetPath);
  if (options?.append) {
    await fs.appendFile(safe, content, 'utf8');
  } else {
    await fs.writeFile(safe, content, 'utf8');
  }
}

export async function secureReadDir(
  userId: string,
  dirPath: string,
): Promise<string[]> {
  const safe = validatePath(userId, dirPath);
  const entries = await fs.readdir(safe);
  return entries;
}

export async function secureStat(
  userId: string,
  targetPath: string,
): Promise<import('node:fs').Stats> {
  const safe = validatePath(userId, targetPath);
  return fs.stat(safe);
}
```

### Path Validator — attack surface coverage

| Attack | How it's blocked |
|---|---|
| `../../base/SOUL.md` | `path.resolve()` collapses traversal; result checked against `userRoot` |
| `/etc/passwd` | Absolute path outside both roots → `SecureFsViolationError` |
| `workspace/users/user_alice/../user_bob/MEMORY.md` | `path.resolve()` → `user_bob/MEMORY.md`; not under `user_alice` root → denied |
| Write to `base/SOUL.md` | `validateWritePath` checks `BASE_DIR` prefix → denied |
| Plugin opens arbitrary path | Plugin must call `secureRead`/`secureWrite` (enforced by wrapper, see §6) |
| Symlink pointing outside boundary | `path.resolve()` follows symlinks; resolved absolute path checked against boundary |

### Enforcement rules

```
secureRead(userId, path):
  1. path.resolve(path) → resolvedPath
  2. resolvedPath must start with users/user_<userId>/ OR base/
  3. If neither → SecureFsViolationError
  4. Call fs.readFile(resolvedPath)

secureWrite(userId, path, content):
  1. path.resolve(path) → resolvedPath
  2. resolvedPath must start with users/user_<userId>/
  3. resolvedPath must NOT start with base/
  4. If violation → SecureFsViolationError
  5. Call fs.writeFile / fs.appendFile(resolvedPath)
```

---

## SECTION 5 — Exact Code Change Plan

### New files (all under `src/team/`)

| File | Purpose | Lines |
|---|---|---|
| `src/team/file-resolver.ts` | `resolveUserFiles(userId)` — path resolver | ~120 |
| `src/team/secure-fs.ts` | `secureRead`, `secureWrite`, `validatePath`, `validateWritePath` | ~90 |

### Patches to existing OpenClaw files

#### Patch A — `src/agents/agent-command.ts`

**Current purpose:** Agent orchestrator. Loads bootstrap files (which include SOUL.md,
AGENTS.md) from `workspaceDir` and executes the model loop.

**Existing relevant code pattern (verified from `bootstrap-files.ts`):**
```ts
// Current: loads from a single workspaceDir, no user concept
const bootstrapFiles = await resolveBootstrapFilesForRun({
  workspaceDir: params.workspaceDir,
  config: params.config,
  sessionKey: params.sessionKey,
});
```

**Proposed change** (+25 lines, inside `if (teamCtx)` guard):
```ts
// NEW: when team context is present, override workspaceDir to user's directory
// and pass resolved file paths explicitly

import { secureRead, secureWrite } from '../team/secure-fs.js';

// In the agent execution entry point, after teamCtx is available:
if (params.teamCtx?.files) {
  const { files, userId } = params.teamCtx;

  // Override bootstrap workspaceDir to user's overlay directory
  // resolveBootstrapFilesForRun will find SOUL.md, AGENTS.md there
  params.workspaceDir = path.dirname(files.soulPath);   // = users/user_<id>/

  // Load MEMORY.md content to prepend as context
  const memoryContent = await secureRead(userId, files.memoryPath).catch(() => '');

  // Load USER.md content
  const userProfile = await secureRead(userId, files.userProfilePath).catch(() => '');

  // Load TASKS.md content
  const tasks = await secureRead(userId, files.tasksPath).catch(() => '');

  // Prepend all three to the system prompt extras
  params.extraSystemContext = [memoryContent, userProfile, tasks]
    .filter(Boolean)
    .join('\n\n---\n\n');
}
```

**On session end (memory write):**
```ts
// After model response, if MEMORY_UPDATE event emitted:
if (event.type === 'memory_update' && params.teamCtx?.files) {
  const { files, userId } = params.teamCtx;
  await secureWrite(userId, files.memoryPath, `\n${event.content}`, { append: true });
}
```

**Risk level:** Low — entire block is inside `if (params.teamCtx?.files)`. Without team
mode, code path is unchanged.

**Backward compatibility:** 100% — `params.teamCtx` is `undefined` for legacy/single-user.

---

#### Patch B — `src/gateway/auth.ts`

**Current purpose:** Resolves `OPENCLAW_GATEWAY_TOKEN`, Tailscope, trusted-proxy, device-
pairing auth. Entry: `authorizeHttpGatewayConnect`.

**Proposed change** (+15 lines):
```ts
// At the top of authorizeHttpGatewayConnect, before existing logic:
import { resolveTeamAuth } from '../team/auth-middleware.js';

const teamCtx = await resolveTeamAuth(req);
if (teamCtx) {
  req.team = teamCtx;       // has .files attached
  return { authorized: true, teamCtx };
}
// fall through to existing auth logic unchanged
```

**Risk level:** Low — the existing chain is the fallback.

---

#### Patch C — `src/media/store.ts` (additive hook)

**Current purpose:** Saves inbound media to `~/.openclaw/media/` (shared directory).

**Gap identified:** In team mode, media from all users lands in one shared folder. Two
users uploading `contract.pdf` would collide.

**Proposed change:** Channel router calls `streamToUserUploads()` instead of the
unscoped media store write when a `teamCtx` is present.

```ts
// src/team/channel-router.ts — when processing an inbound document:
if (message.document && team?.files) {
  const { files, userId } = team;
  const filename   = `${Date.now()}_${sanitizeFilename(message.document.file_id)}.pdf`;
  const destPath   = path.join(files.uploadsDir, filename);
  await secureWrite(userId, destPath, '');        // ensure path is valid first
  await streamTelegramFile(botToken, message.document.file_id, destPath);
  message.resolvedAttachments = [{ path: destPath, mimeType: 'application/pdf' }];
}
```

The existing `src/media/store.ts` is **not modified**. The channel router simply routes
around it for team-mode messages.

**Risk level:** None — existing `store.ts` unchanged; new path is channel-router-only.

---

#### Patch D — `src/index.ts`

**Proposed change** (+8 lines, env-gated):
```ts
if (process.env.OPENCLAW_TEAM_MODE === '1') {
  const { initTeamModule } = await import('./team/index.js');
  await initTeamModule();
}
```

**Risk level:** None — env flag guard.

---

#### Patch E — `src/plugins/plugin-loader.ts`

**Current purpose:** Loads and executes plugins. Plugins receive an execution context.

**Gap identified (from audit `tool-boundaries.md`):** Plugins currently receive no
file-system boundary. A plugin can call raw `fs.readFile` on any path.

**Proposed change** (+30 lines):
```ts
// When loading a plugin in team mode, inject a scoped fs proxy:
if (process.env.OPENCLAW_TEAM_MODE === '1' && teamCtx?.userId) {
  const { secureRead, secureWrite } = await import('../team/secure-fs.js');
  const userId = teamCtx.userId;

  // Replace the fs object passed into plugin context
  pluginContext.fs = {
    readFile:  (p: string) => secureRead(userId, p),
    writeFile: (p: string, content: string) => secureWrite(userId, p, content),
    appendFile:(p: string, content: string) => secureWrite(userId, p, content, { append: true }),
    // All other fs methods that write: proxied through secureWrite
    // All other fs methods that read: proxied through secureRead
  };
}
```

**Risk level:** Medium — changes what `fs` object plugins see. Plugins that directly
import `node:fs` instead of using the injected context bypass this. That is an accepted
limitation documented in §6.

---

### Summary table

| File | Type | Lines added | Risk | BC impact |
|---|---|---|---|---|
| `src/team/file-resolver.ts` | New | ~120 | None | None |
| `src/team/secure-fs.ts` | New | ~90 | None | None |
| `src/agents/agent-command.ts` | Patch | +25 | Low | Zero (env-gated) |
| `src/gateway/auth.ts` | Patch | +15 | Low | Zero (fallthrough) |
| `src/media/store.ts` | No change | 0 | None | None |
| `src/index.ts` | Patch | +8 | None | Zero (env-gated) |
| `src/plugins/plugin-loader.ts` | Patch | +30 | Medium | Only in team mode |

---

## SECTION 6 — Plugin Security

### The Problem

From audit `tool-boundaries.md`: OpenClaw's plugin system (`src/agents/pi-tools.ts`,
`src/plugins/plugin-loader.ts`) provides no filesystem permission model. Plugins run
in-process and can call `import fs from 'node:fs/promises'` directly, bypassing any
injected context proxy.

### What We Can Do (Without Sandboxing)

**Tier 1 — Context injection (implemented above, Patch E):** Replace the `fs` object
in the plugin execution context. Covers well-behaved plugins that use the provided
context rather than importing `node:fs` themselves.

**Tier 2 — Plugin allowlist:** Restrict which plugins can be installed when
`OPENCLAW_TEAM_MODE=1`. Add a `team_safe: true` field to `openclaw.plugin.json`. The
team module's boot check rejects plugins that are not marked `team_safe`.

```ts
// src/team/plugin-guard.ts
export function assertPluginTeamSafe(manifest: PluginManifest): void {
  if (!manifest.team_safe) {
    throw new Error(
      `Plugin "${manifest.name}" is not marked team_safe=true. ` +
      `Refusing to load in OPENCLAW_TEAM_MODE. ` +
      `Review the plugin source and add team_safe: true to its manifest if safe.`
    );
  }
}
```

**Tier 3 — Audit logging:** Every `secureRead`/`secureWrite` call logs `{ userId, path,
operation, timestamp }` to `team.files.logsDir`. This creates a tamper-evident trail for
forensic analysis if a plugin misbehaves.

### What We Cannot Do Without a Process Sandbox

A plugin that does `import fs from 'node:fs/promises'; fs.readFile('/etc/passwd')` runs
in the same Node.js process and **will succeed**. Full isolation requires:
- Running plugins in a Worker thread with restricted permissions (`node:worker_threads`
  with no `fs` access — Node 22+ `--experimental-permission` flag), or
- Running plugins in a Docker sandbox (what the big enterprise plan uses).

This is out of scope for the simple plan. The operator is trusted to vet installed plugins.
The `team_safe` manifest field and context injection are the pragmatic mitigations here.

### Plugin Security Checklist (Operator Responsibility)

Before enabling `OPENCLAW_TEAM_MODE=1`, the operator must:

- [ ] Review all installed plugins in `extensions/` for direct `fs` imports
- [ ] Mark only audited plugins as `team_safe: true`
- [ ] Confirm no plugin hardcodes paths outside `workspace/`
- [ ] Enable audit logging (`OPENCLAW_TEAM_LOG_FS=1`) for the first 30 days

---

## SECTION 7 — Risks and Edge Cases

| Risk | Severity | Mitigation |
|---|---|---|
| Plugin imports `node:fs` directly | Medium | Tier 2 allowlist + operator audit; full sandboxing deferred |
| Symlink in user dir pointing to another user | Low | `path.resolve()` follows symlinks; resolved path still checked against boundary |
| Race condition: two requests for same new user | Low | `fs.mkdir({ recursive: true })` + `fs.access` try/catch are idempotent; worst case: both copy base — same content |
| `base/SOUL.md` missing (operator forgot to create it) | Medium | `resolveUserFiles` throws with a clear message: `ENOENT: base/SOUL.md not found` |
| MEMORY.md grows unbounded | Low | Soft cap enforced at write time (8 KB default; trim oldest lines from top) |
| tmp/ cleared mid-session if two requests race | Low | `tmp/` cleared at session start, not mid-session; within a session, agent must not depend on tmp/ surviving across the boundary |
| Media store writes shared directory despite team mode | Medium | Channel router always routes to `uploadsDir` when `team.files` is present; legacy `media/` path only used for non-team requests |
| LanceDB vector store not per-user | Low | Session-key prefix (`u:<userId>:`) isolates vector entries per existing design (§06) |
| `OPENCLAW_STATE_DIR` override changes workspace root | Low | `resolveUserFiles` reads `OPENCLAW_STATE_DIR` at module load time, consistent with `src/config/paths.ts` |

---

## SECTION 8 — Backward Compatibility Plan

| Scenario | Behavior |
|---|---|
| `OPENCLAW_TEAM_MODE` unset | All patches are behind `if (teamCtx)` or env-flag checks; existing code paths are 100% unchanged |
| Legacy `OPENCLAW_GATEWAY_TOKEN` only | `resolveTeamAuth` returns `null`; falls through to existing auth; `req.team` is never set; agent runs against global workspace |
| New `src/team/` code exists but team mode is off | Module is never imported (`src/index.ts` patch is env-gated) |
| OpenClaw upstream update | Conflicts limited to 4 files (`auth.ts`, `agent-command.ts`, `plugin-loader.ts`, `index.ts`). Each patch is a small, self-contained block. Rebase cost: minutes |
| Single user with team mode on | `resolveUserFiles` runs normally; user gets their own overlay; behavior identical to before but context files are per-user |

---

## SECTION 9 — Final Architecture Recommendation

The complete overlay + secure FS layer adds:

| Component | File | Lines |
|---|---|---|
| File resolver | `src/team/file-resolver.ts` | ~120 |
| Secure FS | `src/team/secure-fs.ts` | ~90 |
| Plugin guard | `src/team/plugin-guard.ts` | ~30 |
| Patches (4 files) | `agent-command`, `gateway/auth`, `plugin-loader`, `index.ts` | ~78 |
| **Total new** | | **~318 lines** |

Combined with the `src/team/` base from §08 (~770 lines), **total is ~1,088 lines**.

The security guarantee this delivers:

> **A user cannot read or write another user's files through any code path that uses
> `secureRead`/`secureWrite`. The only remaining vector is a plugin that directly imports
> `node:fs` — which is mitigated by the `team_safe` manifest check and operator vetting.**

This is the right security posture for a small-team, operator-trusted deployment. It is
not a full sandboxed multi-tenant SaaS. For that, use the big enterprise plan.
