# EPIC 2 — User Overlay File System

> Source: `02-extension-strategy/strategy.md` Layer 5, `03-user-model/model.md`, `06-agent-usage/agents.md`, `08-code-change-plan/changes.md` file-resolver section.

---

## STORY 2.1 — Implement `resolveUserFiles(userId)` in `file-resolver.ts`

### 🎯 Description
Lazy-create the per-user file overlay under `~/.openclaw/workspace/users/user_<id>/`. On first call: ensure all 5 directories exist, copy `SOUL.md` and `AGENTS.md` from `base/`, create `MEMORY.md`/`USER.md`/`TASKS.md` empty, clear `tmp/`. On subsequent calls: idempotent — files are never overwritten. Returns a fully-populated `UserFiles` struct of absolute paths.

Source: `08-code-change-plan/changes.md` "File Resolver Layer (NEW)" — full reference implementation included.

### ⚙️ Implementation Details

**File**: `src/team/file-resolver.ts` (NEW, ~120 lines)

**Constants**:
```ts
const OPENCLAW_HOME  = process.env.OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`;
const WORKSPACE_ROOT = path.join(OPENCLAW_HOME, 'workspace');
const BASE_DIR       = path.join(WORKSPACE_ROOT, 'base');
```

**`UserFiles` type**:
```ts
type UserFiles = {
  soulPath: string;
  agentsPath: string;
  memoryPath: string;
  userProfilePath: string;
  tasksPath: string;
  uploadsDir: string;
  conversationsDir: string;
  tmpDir: string;
  toolCacheDir: string;
  logsDir: string;
};
```

**Algorithm** (verbatim from §08):
1. Ensure user root + 5 dirs (`uploads`, `conversations`, `tmp`, `tool_cache`, `logs`) via `Promise.all([fs.mkdir(..., {recursive: true})])`.
2. Seed-once: `SOUL.md` and `AGENTS.md` copied from `base/` only if missing.
3. Empty-create: `MEMORY.md`, `USER.md`, `TASKS.md` only if missing.
4. Clear `tmp/`: `fs.rm(tmpDir, {recursive: true, force: true})` then re-mkdir.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/file-resolver.ts with a single exported async function resolveUserFiles(userId: string): Promise<UserFiles>.

REQUIREMENTS
1. Constants at top:
   const OPENCLAW_HOME  = process.env.OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`;
   const WORKSPACE_ROOT = path.join(OPENCLAW_HOME, 'workspace');
   const BASE_DIR       = path.join(WORKSPACE_ROOT, 'base');

2. UserFiles type with all 10 string fields (5 file paths + 5 dirs):
   - soulPath, agentsPath, memoryPath, userProfilePath, tasksPath
   - uploadsDir, conversationsDir, tmpDir, toolCacheDir, logsDir

3. Helpers (private):
   async function ensureEmpty(p) { try { await fs.access(p); } catch { await fs.writeFile(p, '', 'utf8'); } }
   async function ensureCopied(src, dest) { try { await fs.access(dest); } catch { await fs.copyFile(src, dest); } }

4. resolveUserFiles(userId):
   - Validate userId is non-empty, contains no path separators, and matches /^[A-Za-z0-9_\-]+$/. Throw `Error('invalid userId')` if not.
   - userDir = path.join(WORKSPACE_ROOT, 'users', `user_${userId}`)
   - mkdir userDir + 5 subdirs in parallel.
   - ensureCopied for SOUL.md and AGENTS.md from BASE_DIR.
   - ensureEmpty for MEMORY.md, USER.md, TASKS.md.
   - Clear tmp/: fs.rm(tmpDir, {recursive:true, force:true}); fs.mkdir(tmpDir).
   - Return UserFiles object.

5. Special handling:
   - If BASE_DIR/SOUL.md does not exist: log a warning AND create the user's SOUL.md as empty so the runtime can still proceed (the agent should error gracefully if the prompt is empty).
   - Same for AGENTS.md.

6. Export: resolveUserFiles, type UserFiles, the constants WORKSPACE_ROOT and BASE_DIR (so secure-fs.ts can use them).

CONSTRAINTS
- Pure node:fs/promises, node:path, no other deps.
- Idempotent: must be safe to call N times concurrently for the same user.
- Do not throw on already-existing dirs/files.

OUTPUT
- src/team/file-resolver.ts (full file)
- src/team/file-resolver.test.ts with the cases listed in the testing section below.
```

### 🧪 Testing Instructions
1. Delete `~/.openclaw/workspace/users/user_test/`.
2. `await resolveUserFiles('test')` → directory tree created, all 10 paths exist on disk.
3. Modify `users/user_test/SOUL.md` → call again → file unchanged (no overwrite).
4. Drop a file in `users/user_test/tmp/` → call again → file gone (tmp cleared).
5. Two parallel calls for the same user → no exception, both return identical paths.
6. Pass `userId` containing `..` or `/` → throws `invalid userId`.
7. Delete `base/SOUL.md` → call → user's `SOUL.md` is created empty + warning logged.

### 📥 Example Input
```ts
await resolveUserFiles('a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8');
```

### 📤 Expected Output
```json
{
  "soulPath": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/SOUL.md",
  "agentsPath": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/AGENTS.md",
  "memoryPath": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/MEMORY.md",
  "userProfilePath": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/USER.md",
  "tasksPath": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/TASKS.md",
  "uploadsDir": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/uploads",
  "conversationsDir": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/conversations",
  "tmpDir": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/tmp",
  "toolCacheDir": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/tool_cache",
  "logsDir": "/home/oc/.openclaw/workspace/users/user_a3f9e1c0-b2d4-4a1b-9f3e-c1d2a5b6e7f8/logs"
}
```

### ✅ Acceptance Criteria
- [ ] All 10 paths returned and exist on disk after first call.
- [ ] `SOUL.md` and `AGENTS.md` are byte-identical to `base/` on first call.
- [ ] Existing user files never overwritten.
- [ ] `tmp/` cleared on every call.
- [ ] Invalid userIds rejected.
- [ ] Concurrent calls do not throw.

---

## STORY 2.2 — Wire `resolveUserFiles` Into `auth-middleware.ts`

### 🎯 Description
After credential resolution succeeds and the user is not the synthetic `'admin'`, call `resolveUserFiles(ctx.userId)` and attach the result as `ctx.files`. This is a +5-line addition to Story 1.3's middleware.

### ⚙️ Implementation Details

**File**: `src/team/auth-middleware.ts` (PATCH within the existing fn).

```ts
if (ctx && ctx.userId !== 'admin') {
  ctx.files = await resolveUserFiles(ctx.userId);
}
return ctx;
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Update src/team/auth-middleware.ts to call resolveUserFiles after credential resolution.

REQUIREMENTS
1. Import { resolveUserFiles } from './file-resolver'.
2. Just before `return ctx;` at the end of resolveTeamAuth:
       if (ctx && ctx.userId !== 'admin') {
         ctx.files = await resolveUserFiles(ctx.userId);
       }
3. Wrap the call in a try/catch. On error:
       console.error('[team] file resolution failed for', ctx.userId, e);
       return null;   // hard-fail the auth — caller will 500/401
4. Update the TeamCtx type to include `files?: UserFiles`.

CONSTRAINTS
- Legacy/admin path must NOT call resolveUserFiles.
- Only one call site for resolveUserFiles in the entire codebase: this one.

OUTPUT
- Patched src/team/auth-middleware.ts (full file).
```

### 🧪 Testing Instructions
1. Hit `/auth/me` with cookie of a real user → response includes `files` with all 10 paths.
2. Hit `/auth/me` with the legacy gateway token → response excludes `files` (legacy → synthetic admin).
3. Simulate `resolveUserFiles` throwing (e.g. read-only filesystem) → request fails with 401 and error logged.

### ✅ Acceptance Criteria
- [ ] Real users get `ctx.files` on every request.
- [ ] Synthetic admin never gets `ctx.files`.
- [ ] File resolution failure aborts the request cleanly.

---

## STORY 2.3 — Implement Memory Append + Trim Helper

### 🎯 Description
A small utility `appendMemory(filePath, line, capBytes = 8192)` that appends a single line to `MEMORY.md` and trims oldest lines from the top when the file exceeds the cap. Lives co-located in `file-resolver.ts` or in `src/team/memory.ts`.

Source: `06-agent-usage/agents.md` "MEMORY.md — Read + Write Pattern".

### ⚙️ Implementation Details

**File**: `src/team/memory.ts` (NEW, ~40 lines) or part of `file-resolver.ts`.

**Logic**:
```
appendMemory(filePath, line, cap=8192):
  current = await readFile(filePath, 'utf8')   (or '' if missing)
  next = current + (current && !current.endsWith('\n') ? '\n' : '') + line.trim() + '\n'
  if (next.length > cap):
    lines = next.split('\n')
    while (lines.join('\n').length > cap && lines.length > 1):
      lines.shift()
    next = lines.join('\n')
  await writeFile(filePath, next, 'utf8')
```

The path is always passed in by the caller — never constructed here. Callers obtain it from `team.files.memoryPath` (so the user boundary is already enforced upstream).

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/memory.ts that exports appendMemory(filePath, line, capBytes?).

REQUIREMENTS
1. async function appendMemory(filePath: string, line: string, capBytes = 8192): Promise<void>
2. Read existing file content (default to '' if file missing).
3. Append the new line, ensuring exactly one trailing newline.
4. If total bytes > capBytes:
   - Split on '\n'.
   - Shift oldest lines until size <= capBytes (always keep at least 1 line).
5. Write back atomically: write to filePath + '.tmp', then fs.rename.
6. Trim line whitespace; reject empty/whitespace-only lines (no-op return).
7. Reject lines longer than capBytes (no-op + warn).

CONSTRAINTS
- Path is taken as-is from caller. No path construction here.
- Caller is responsible for invoking secureWrite if the line came from untrusted input. This helper is a low-level write — wrap it via secureWrite when you call it from the agent runtime patch.

OUTPUT
- src/team/memory.ts (full file)
- A small test src/team/memory.test.ts that covers: append below cap, append over cap (verifies trim from top), empty input no-op, atomic write.
```

### 🧪 Testing Instructions
1. Empty file → append "first line" → file contains `first line\n`.
2. File at 8000 bytes → append a new line → no trim, file grows.
3. File at 8200 bytes → append a 100-byte line → file <= 8192, oldest lines removed first.
4. Empty input string → no change to file.
5. 10KB single-line input with cap=8KB → no-op, warning logged.

### ✅ Acceptance Criteria
- [ ] Append always preserves trailing newline.
- [ ] Trim removes oldest lines from the top.
- [ ] Atomic write (no partial-file corruption on crash).
- [ ] Cap is enforced.

---

## STORY 2.4 — Add `OPENCLAW_HOME` Env Override + Default

### 🎯 Description
Honor `OPENCLAW_HOME` everywhere paths are constructed. Default to `${HOME}/.openclaw` on Unix and `${USERPROFILE}\.openclaw` on Windows.

This is a documentation + verification story; the actual code is already in `file-resolver.ts` (Story 2.1). This story exists to ensure all team-mode files (`team.sqlite`, workspace tree, etc.) honor the same root.

### ⚙️ Implementation Details

**Files touched**: `src/team/index.ts`, `src/team/db.ts`, `src/team/file-resolver.ts`, `src/team/secure-fs.ts`.

```ts
function getOpenclawHome(): string {
  if (process.env.OPENCLAW_HOME) return process.env.OPENCLAW_HOME;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error('cannot determine OPENCLAW_HOME (no HOME / USERPROFILE)');
  return path.join(home, '.openclaw');
}
```

Centralize it in `src/team/paths.ts` and import everywhere.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/paths.ts that centralizes path construction; refactor existing team-mode files to use it.

REQUIREMENTS
1. src/team/paths.ts:
   - Export getOpenclawHome(): string  (cached after first call).
   - Export WORKSPACE_ROOT, BASE_DIR, getTeamSqlitePath(), getUserDir(userId).
2. Refactor src/team/file-resolver.ts to import from paths.ts (remove its own constants).
3. Refactor src/team/db.ts to use getTeamSqlitePath().
4. Refactor src/team/secure-fs.ts to use WORKSPACE_ROOT and BASE_DIR.

CONSTRAINTS
- getUserDir(userId) must validate userId (same regex as resolver).
- Cache only paths that depend on env (avoid stale HOME after process.env mutation in tests — clear cache via __resetForTests export).

OUTPUT
- src/team/paths.ts (full file)
- Diffs for the three files that now import from it.
```

### 🧪 Testing Instructions
1. Set `OPENCLAW_HOME=/tmp/oc-test` → boot → `team.sqlite`, workspace, etc. all under `/tmp/oc-test/`.
2. Unset → defaults to `~/.openclaw`.
3. On Windows: `USERPROFILE=C:\Users\X` and no `HOME` → defaults to `C:\Users\X\.openclaw`.
4. Both unset → throws clear error.

### ✅ Acceptance Criteria
- [ ] Single source of truth for the home directory.
- [ ] Works on Linux, macOS, Windows.
- [ ] Tests pass with `OPENCLAW_HOME` overridden to a temp dir.

---

## STORY 2.5 — Lazy-Initialize the `base/` Directory on First Boot

### 🎯 Description
When team mode boots and `~/.openclaw/workspace/base/` does not exist, create it with empty `SOUL.md` and `AGENTS.md` placeholders so that user seeding doesn't fail. Operator is expected to populate them with real content.

Source: `02-extension-strategy/strategy.md` workspace layout.

### ⚙️ Implementation Details

**File**: `src/team/index.ts` initTeamModule + a helper `bootstrapBaseDir()`.

```ts
async function bootstrapBaseDir() {
  await fs.mkdir(BASE_DIR, { recursive: true });
  await fs.mkdir(path.join(BASE_DIR, 'skills'), { recursive: true });
  await fs.mkdir(path.join(BASE_DIR, 'tools'), { recursive: true });
  await ensureEmpty(path.join(BASE_DIR, 'SOUL.md'));
  await ensureEmpty(path.join(BASE_DIR, 'AGENTS.md'));
}
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Add bootstrapBaseDir() to src/team/index.ts; call it during initTeamModule().

REQUIREMENTS
1. Call after migrate(db) succeeds.
2. Idempotent: do not overwrite existing files in base/.
3. mkdir -p BASE_DIR, BASE_DIR/skills, BASE_DIR/tools.
4. ensureEmpty for BASE_DIR/SOUL.md and BASE_DIR/AGENTS.md.
5. Log: `[team] base/ initialized at <path>` on first creation; do not log on subsequent boots.
6. Detect first-creation vs. existing by checking dir existence BEFORE mkdir (use fs.stat).

CONSTRAINTS
- Use the WORKSPACE_ROOT/BASE_DIR from src/team/paths.ts.
- Reuse ensureEmpty from file-resolver.ts (export it if not already).

OUTPUT
- The patch to src/team/index.ts.
```

### 🧪 Testing Instructions
1. Delete `~/.openclaw/workspace/` → boot → `base/`, `base/SOUL.md`, `base/AGENTS.md`, `base/skills/`, `base/tools/` all created.
2. Add content to `base/SOUL.md`; restart → file unchanged.
3. New user logs in → their `SOUL.md` is the seeded base content.

### ✅ Acceptance Criteria
- [ ] `base/` always exists by the time user-seeding runs.
- [ ] No existing operator content is overwritten.
- [ ] Init logs a one-time creation message.
