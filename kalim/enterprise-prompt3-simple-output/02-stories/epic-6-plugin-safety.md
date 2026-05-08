# EPIC 6 — Plugin Safety

> Source: `06-agent-usage/agents.md` "What We Are NOT Doing" plugin-sandboxing note, `08-code-change-plan/changes.md` plugin-guard line, `11-security-basics/security.md`. Goal: in team mode, only load plugins that opted in via `team_safe: true`, and inject a `secureRead`/`secureWrite`-backed `fs` proxy into their context.

---

## STORY 6.1 — Implement `assertPluginTeamSafe(manifest)` in `plugin-guard.ts`

### 🎯 Description
A small guard module that checks every plugin's manifest for `team_safe: true` when team mode is on. Plugins without the flag are refused with a clear error.

Source: `08-code-change-plan/changes.md` plugin-guard, `06-agent-usage/agents.md` plugin sandboxing note.

### ⚙️ Implementation Details

**File**: `src/team/plugin-guard.ts` (NEW, ~30 lines)

```ts
export class PluginNotTeamSafeError extends Error { /* manifest path, name */ }

export function assertPluginTeamSafe(manifestPath: string, manifest: any): void {
  if (process.env.OPENCLAW_TEAM_MODE !== '1') return;       // no-op when team mode is off
  const flag = manifest?.team_safe;
  if (flag !== true) {
    throw new PluginNotTeamSafeError(`plugin "${manifest?.name ?? '<unknown>'}" at ${manifestPath} is missing "team_safe: true" — refusing to load in team mode.`);
  }
}
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/plugin-guard.ts.

REQUIREMENTS
1. Export class PluginNotTeamSafeError extends Error.
2. Export function assertPluginTeamSafe(manifestPath: string, manifest: unknown): void
   - If OPENCLAW_TEAM_MODE !== '1' → return (no-op).
   - Cast manifest to any; check `(manifest as any).team_safe === true`.
   - If not strictly true → throw PluginNotTeamSafeError with a message that names the plugin and the manifest file path.
3. Export a helper isPluginTeamSafe(manifest): boolean — returns false on missing/false flag, true on strict true.

CONSTRAINTS
- This module imports nothing besides Node built-ins; no DB, no fs.
- Manifest schema is: any object with optional `team_safe: boolean` and `name: string`. Don't enforce a schema beyond the flag.

OUTPUT
- src/team/plugin-guard.ts (full file)
```

### 🧪 Testing Instructions
1. Manifest with `team_safe: true` → no throw.
2. Manifest without the field → throws PluginNotTeamSafeError.
3. Manifest with `team_safe: false` → throws.
4. Manifest with `team_safe: 'yes'` (string truthy) → throws (must be strict true).
5. With `OPENCLAW_TEAM_MODE` unset → no throw regardless of manifest.

### ✅ Acceptance Criteria
- [ ] Strict `=== true` check.
- [ ] No-op when team mode off.
- [ ] Clear error including plugin name + manifest path.

---

## STORY 6.2 — Patch `plugin-loader.ts` to Call the Guard

### 🎯 Description
Find the existing OpenClaw plugin loader (search for `src/plugins/plugin-loader.ts` or similar) and call `assertPluginTeamSafe(manifestPath, manifest)` before any plugin code executes.

### ⚙️ Implementation Details

**File**: `src/plugins/plugin-loader.ts` (PATCH, +30 lines including fs proxy injection from Story 6.3).

```ts
import { assertPluginTeamSafe } from '../team/plugin-guard';

// Wherever the loader currently has the manifest in hand:
assertPluginTeamSafe(manifestPath, manifest);
// existing load logic continues unchanged
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Patch src/plugins/plugin-loader.ts (or whichever file loads plugin manifests in OpenClaw — find it via grep for 'openclaw.plugin.json') to call assertPluginTeamSafe.

REQUIREMENTS
1. Find the function that reads a plugin's manifest and registers/imports it.
2. Right after the manifest is parsed (before any plugin entry-point is invoked), call:
       import { assertPluginTeamSafe } from '../team/plugin-guard';
       assertPluginTeamSafe(manifestPath, manifest);
3. Wrap in try/catch only at the loader-orchestration level: a single failed plugin must not crash the whole boot. Log the error and skip that plugin.
4. Add a startup summary log: `[team] plugins loaded: N, skipped (not team_safe): M, names=[...]`.

CONSTRAINTS
- Do not change plugin entry-point invocation logic.
- Skip-and-continue on PluginNotTeamSafeError; abort-only on other errors (so a true crash still surfaces).

OUTPUT
- The patch (unified diff) to plugin-loader.ts.
- Optionally a minimal type annotation for the manifest if it's currently `unknown`.
```

### 🧪 Testing Instructions
1. Plugin without `team_safe` → boot logs "skipped (not team_safe)" for that plugin; other plugins load normally.
2. Plugin with `team_safe: true` → loads.
3. With `OPENCLAW_TEAM_MODE` unset → all plugins load (guard is no-op).
4. Boot logs include the summary line.

### ✅ Acceptance Criteria
- [ ] Unsafe plugins refused, named in logs.
- [ ] Safe plugins load.
- [ ] Per-plugin failure isolated (one bad plugin doesn't crash boot).

---

## STORY 6.3 — Inject `secureRead`/`secureWrite`-Backed `fs` Proxy into Plugin Context

### 🎯 Description
For plugins that legitimately need filesystem access during a turn, expose an `fs`-shaped object on `ctx` (alongside `ctx.team`) whose methods route through `secureRead` / `secureWrite` keyed by the current `userId`. Plugins that import `node:fs` directly bypass this — that's a known limitation flagged in `06-agent-usage/agents.md`.

### ⚙️ Implementation Details

**Files**:
- `src/team/plugin-fs-proxy.ts` (NEW, ~40 lines).
- `src/plugins/plugin-loader.ts` (PATCH, +10 lines on top of Story 6.2).

```ts
export function createFsProxy(team: TeamCtx) {
  const userId = team.userId;
  return {
    readFile: async (p: string, enc = 'utf8') => secureRead(userId, p),
    writeFile: async (p: string, data: any) => secureWrite(userId, p, data),
    appendFile: async (p: string, data: any) => secureWrite(userId, p, data, { append: true }),
    // Listing — only allow ls under the user root:
    readdir: async (p: string) => fs.readdir(validatePath(userId, p)),
  };
}
```

The plugin runtime supplies `ctx.fs = createFsProxy(team)` per-call.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/plugin-fs-proxy.ts and inject it into plugin call ctx.

REQUIREMENTS
1. src/team/plugin-fs-proxy.ts:
   - export function createFsProxy(team: TeamCtx) returning an object with:
       readFile(p, enc?)         → secureRead
       writeFile(p, data)        → secureWrite
       appendFile(p, data)       → secureWrite with { append: true }
       readdir(p)                → fs.readdir(validatePath(userId, p))
       stat(p)                   → fs.stat(validatePath(userId, p))
       mkdir(p, opts?)           → validateWritePath then fs.mkdir
       rm(p, opts?)              → validateWritePath then fs.rm
   - All methods async. None expose path resolution to the caller.
2. Plugin loader patch:
   - When team mode is on, when invoking a plugin entry-point per-call, pass ctx.fs = createFsProxy(team).
   - When team mode is off, ctx.fs remains undefined (existing behavior).

CONSTRAINTS
- The proxy MUST validate every call with secureRead/secureWrite/validatePath — never bypass.
- Document in comments that plugins importing 'node:fs' directly are NOT sandboxed; team_safe declares the plugin author has verified all I/O goes through ctx.fs.

OUTPUT
- src/team/plugin-fs-proxy.ts (full file)
- The plugin-loader.ts patch.
```

### 🧪 Testing Instructions
1. A test plugin uses `ctx.fs.writeFile` to write to its user's `MEMORY.md` → succeeds.
2. Same plugin tries `ctx.fs.writeFile('/etc/passwd', 'X')` → throws SecureFsViolationError.
3. Same plugin tries `ctx.fs.readFile('/users/user_other/MEMORY.md')` → throws.
4. Plugin imports `node:fs` directly and writes anywhere → succeeds (documented limitation, requires `team_safe: true` opt-in trust).
5. Without team mode → `ctx.fs` is undefined; existing plugins keep working with their direct fs imports.

### ✅ Acceptance Criteria
- [ ] All proxy methods route through secure-fs.
- [ ] Plugins receive `ctx.fs` only in team mode.
- [ ] Direct `node:fs` imports remain a known, documented limitation.
