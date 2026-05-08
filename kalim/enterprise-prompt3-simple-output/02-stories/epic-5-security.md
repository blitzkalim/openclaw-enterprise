# EPIC 5 — Secure File Access Enforcement

> Source: `11-security-basics/security.md` §1b "File Path Isolation", `08-code-change-plan/changes.md` secure-fs section. Goal: every team-mode file read/write goes through a wrapper that validates the path against the user's root before any I/O.

---

## STORY 5.1 — Implement `secureRead`, `secureWrite`, `validatePath`

### 🎯 Description
A small module that exports the only file-I/O functions team-mode code is allowed to call. Each function takes `userId` and `targetPath`, calls `path.resolve()`, and verifies the resolved path is under `users/user_<userId>/`. Any violation throws `SecureFsViolationError` and is logged. Writes additionally reject any path under `base/`.

Source: `11-security-basics/security.md` "Secure FS Enforcement".

### ⚙️ Implementation Details

**File**: `src/team/secure-fs.ts` (NEW, ~90 lines)

**Public API**:
```ts
export class SecureFsViolationError extends Error { /* userId, attemptedPath, resolvedPath, operation */ }

export async function secureRead(userId: string, targetPath: string): Promise<string>;
export async function secureWrite(userId: string, targetPath: string, data: string | Buffer, opts?: { append?: boolean }): Promise<void>;
export function validatePath(userId: string, targetPath: string): string;        // returns resolved absolute path; throws on violation
export function validateWritePath(userId: string, targetPath: string): string;   // also rejects writes under base/
```

**Algorithm**:
```
validatePath(userId, target):
  resolved = path.resolve(target);
  userRoot = path.resolve(WORKSPACE_ROOT, 'users', `user_${userId}`);
  if !resolved.startsWith(userRoot + path.sep) && resolved !== userRoot:
    throw SecureFsViolationError(...)
  return resolved;

validateWritePath(userId, target):
  resolved = validatePath(userId, target);
  baseRoot = path.resolve(BASE_DIR);
  if resolved.startsWith(baseRoot + path.sep) || resolved === baseRoot:
    throw SecureFsViolationError(operation='write-to-base')
  return resolved;
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement src/team/secure-fs.ts.

REQUIREMENTS
1. Constants imported from './paths.ts': WORKSPACE_ROOT, BASE_DIR.
2. Class SecureFsViolationError extends Error:
   constructor takes { userId, attemptedPath, resolvedPath, operation }; assigns them as instance fields.
   message = `secure-fs ${operation} violation for ${userId}: ${attemptedPath}`.
3. validatePath(userId, target):
   - userId regex check (same as resolver).
   - resolved = path.resolve(target).
   - userRoot = path.resolve(WORKSPACE_ROOT, 'users', `user_${userId}`).
   - if (!resolved.startsWith(userRoot + path.sep) && resolved !== userRoot): throw.
   - return resolved.
4. validateWritePath(userId, target):
   - resolved = validatePath(userId, target).
   - baseRoot = path.resolve(BASE_DIR).
   - if (resolved === baseRoot || resolved.startsWith(baseRoot + path.sep)): throw with operation='write-to-base'.
   - return resolved.
5. secureRead(userId, target):
   - resolved = validatePath(userId, target).
   - return await fs.readFile(resolved, 'utf8').
6. secureWrite(userId, target, data, opts={}):
   - resolved = validateWritePath(userId, target).
   - mkdir parent recursive.
   - if opts.append: fs.appendFile, else fs.writeFile.
   - Return void.
7. On every SecureFsViolationError: log to OpenClaw's existing logger AND, if a per-user logsDir is reachable, write a JSONL line to <logsDir>/violations.log:
       { ts, userId, op, attempted, resolved }
8. Also export a sync `validatePathSync` for places where async is awkward (e.g. inside synchronous channel-binding code).

CONSTRAINTS
- ONLY this module imports `node:fs/promises` for team-mode user I/O. (The resolver is exempt because it constructs paths server-side; even so, prefer using validateWritePath there too.)
- Path comparison MUST use path.sep to avoid prefix collisions ('user_1' vs 'user_10').
- Symlink-following is the OS default; we do not chase symlinks ourselves. Operators who want stricter behavior can mount the user dirs from a fixed location.

OUTPUT
- src/team/secure-fs.ts (full file)
- src/team/secure-fs.test.ts with the cases below.
```

### 🧪 Testing Instructions
1. `secureRead('amit', '/users/user_amit/SOUL.md')` (after path-resolve) → returns content.
2. `secureRead('amit', '/users/user_priya/SOUL.md')` → throws `SecureFsViolationError` with `operation='read'`.
3. `secureWrite('amit', '/users/user_amit/MEMORY.md', '...')` → ok.
4. `secureWrite('amit', '/base/SOUL.md', '...')` → throws with `operation='write-to-base'`.
5. `secureWrite('amit', '/users/user_amit/../user_priya/MEMORY.md', '...')` → resolved → priya path → throws `read`-like violation (caught by validatePath before validateWritePath).
6. Symlink trick: create `/users/user_amit/escape -> /etc/passwd`, then `secureRead('amit', '/users/user_amit/escape')` → resolves to a path **under** user_amit/, so passes validatePath; the actual fs.readFile follows the symlink. Document this in code comments. Operators can mitigate by setting the storage volume `nosymfollow` if desired.
7. Concurrency: 100 parallel `secureWrite` calls to the same path → no corruption; final content is one of the 100 inputs.

### 📥 Example Input
```ts
await secureWrite('amit', '/home/oc/.openclaw/workspace/users/user_amit/MEMORY.md', 'user prefers Hindi\n', { append: true });
```

### 📤 Expected Output
File content gains the new line. No exceptions. Returns `void`.

### ✅ Acceptance Criteria
- [ ] All four boundary classes (cross-user, parent traversal, base-write, normal-write) tested.
- [ ] Violations always throw the typed error.
- [ ] Violations always logged.
- [ ] Path comparison uses `path.sep` correctly to avoid prefix bugs.

---

## STORY 5.2 — Replace Bare `fs.*` Calls in Team-Mode Code Paths

### 🎯 Description
Audit `src/team/`, the agent-command patch, and the channel-router for any direct `fs.readFile` / `fs.writeFile` / `fs.appendFile` against per-user paths. Replace them with `secureRead` / `secureWrite`.

### ⚙️ Implementation Details

Files to audit:
- `src/team/channel-router.ts` (uploads streaming)
- `src/agents/agent-command.ts` (the team branch from Story 3.2/3.3)
- `src/team/memory.ts` (Story 2.3 — the appendMemory helper should ultimately call secureWrite, not bare fs)

`file-resolver.ts` is the only file in `src/team/` allowed to use bare `fs`, because it is the path provisioner — but it should still use `validateWritePath` before each write to catch construction bugs.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer doing a targeted refactor.

TASK
Replace direct fs calls with secureRead/secureWrite in team-mode code paths.

REQUIREMENTS
1. grep for `from 'node:fs'` and `from 'fs'` and `fs.readFile|writeFile|appendFile|createWriteStream` inside src/team/ and the team-branch sections of src/agents/agent-command.ts.
2. For every match that operates on a per-user path:
   - Replace with secureRead(userId, ...) or secureWrite(userId, ...).
   - For createWriteStream (used by upload streaming): call validateWritePath(userId, dest) first; then create the stream against the resolved path.
3. file-resolver.ts is exempt EXCEPT: every fs.copyFile / fs.writeFile / fs.mkdir / fs.rm should be preceded by validateWritePath(userId, target). For mkdir of the user root, validate against itself (call validatePath(userId, userDir) — the resolved path equals userRoot, which passes).
4. Add a lint rule (.eslintrc) banning bare fs usage in src/team/ EXCEPT file-resolver.ts (use no-restricted-imports with a path filter).

CONSTRAINTS
- Do not touch src/agents/* outside the team branch.
- Do not touch src/channels/* (they're not in team mode).
- ESLint rule must allow secure-fs.ts and file-resolver.ts.

OUTPUT
- A patch list (files + diffs) and the updated .eslintrc.
```

### 🧪 Testing Instructions
1. Run ESLint → no violations in `src/team/`.
2. Run integration test (Story 1.1 + 4.x) → still works.
3. Add a deliberate bad write (`fs.writeFile('/etc/passwd', ...)`) inside a team-mode handler → ESLint flags AND runtime would have thrown if it slipped through.

### ✅ Acceptance Criteria
- [ ] Zero bare-fs calls in team-mode paths (lint-enforced).
- [ ] All per-user file I/O routed through secure-fs.
- [ ] file-resolver still uses bare fs but validates before write.

---

## STORY 5.3 — `validatePathSync` for Plugin Loader Hot-Path

### 🎯 Description
The plugin loader (Story 6.2) injects an `fs` proxy into plugin contexts; some plugin entry points are sync. Provide a sync version of `validatePath` so the proxy can short-circuit without hitting the event loop.

### ⚙️ Implementation Details

`secure-fs.ts` exports `validatePathSync(userId, target)` — pure-CPU, no I/O.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Add validatePathSync and validateWritePathSync to src/team/secure-fs.ts.

REQUIREMENTS
1. Pure CPU; no I/O.
2. Same logic as the async versions (which can now call the sync helpers internally).
3. Throws SecureFsViolationError on failure.
4. Available for use by the plugin loader's sync fs proxy (see EPIC 6).

CONSTRAINTS
- Refactor secureRead/secureWrite to call the sync validators internally to keep one source of truth.

OUTPUT
- Patch to src/team/secure-fs.ts.
```

### 🧪 Testing Instructions
1. Sync validation throws for cross-user / base-write paths.
2. Async wrappers still pass their existing tests.
3. Performance: 100k validations of a valid path complete in < 100 ms (sanity check; no real perf concern).

### ✅ Acceptance Criteria
- [ ] Sync versions work and share logic with async.
- [ ] Plugin loader can import and use synchronously.

---

## STORY 5.4 — Encrypt Channel Secrets at Rest

### 🎯 Description
WhatsApp app secret, Telegram bot token, and per-channel webhook secrets are stored in SQLite. Encrypt them with AES-256-GCM keyed off `OPENCLAW_COOKIE_SECRET` (or a dedicated `OPENCLAW_SECRET_KEY` env). Decrypt on read, encrypt on write. Source: `11-security-basics/security.md` "Secrets Handling".

### ⚙️ Implementation Details

**File**: `src/team/secrets-crypto.ts` (NEW, ~60 lines).

```ts
const KEY = deriveKey(process.env.OPENCLAW_COOKIE_SECRET ?? '');
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('hex')}.${tag.toString('hex')}.${ct.toString('base64')}`;
}
export function decryptSecret(blob: string): string { /* parse, verify, decrypt */ }
```

`deriveKey` uses HKDF-SHA256 over the env secret to produce a 32-byte key.

Apply to:
- workspace_channels.secret_encrypted
- workspace_channels.app_secret_encrypted (WhatsApp)
- workspace_channels.access_token_encrypted (WhatsApp outbound)
- workspace_channels.bot_token_encrypted (Telegram)

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement src/team/secrets-crypto.ts and apply encryption to channel-secret storage.

REQUIREMENTS
1. Use Node 'crypto' module — no external deps.
2. KEY derivation:
   const masterSecret = process.env.OPENCLAW_COOKIE_SECRET;
   if (!masterSecret || masterSecret.length < 32) throw new Error('OPENCLAW_COOKIE_SECRET must be set and >= 32 chars when team mode is on').
   key = crypto.hkdfSync('sha256', Buffer.from(masterSecret), Buffer.alloc(0), Buffer.from('openclaw-team-secret-v1'), 32).
3. encryptSecret(plaintext: string): string
   - iv = crypto.randomBytes(12)
   - cipher = aes-256-gcm
   - return `v1.${ivHex}.${tagHex}.${ctBase64}`
4. decryptSecret(blob: string): string
   - parse 4 parts; if version !== 'v1' throw; verify tag; return plaintext.
   - On any tag mismatch: throw 'secret integrity failed'.
5. Wrap channel-secret create/read paths in src/team/team-routes.ts and src/team/channel-router.ts so callers always go through encryptSecret/decryptSecret.
6. Never log secret blobs; never include them in error messages.

CONSTRAINTS
- Reject startup when team mode is on and OPENCLAW_COOKIE_SECRET is missing.
- Old plaintext rows (e.g. from a dev environment where this story landed late) are detected by the absence of 'v1.' prefix; you can choose to (a) refuse to read, or (b) re-encrypt on next read. Pick (a) and document the migration step ("dump → re-add via /team UI").

OUTPUT
- src/team/secrets-crypto.ts (full file)
- The diffs in team-routes.ts / channel-router.ts where secrets are stored/read.
```

### 🧪 Testing Instructions
1. Set `OPENCLAW_COOKIE_SECRET` to a 32+ char string. Boot.
2. Create a workspace channel via `/team` UI with a known secret → DB row's secret column starts with `v1.`.
3. Restart and inspect the secret via the UI → original value restored.
4. Tamper one byte of the stored ciphertext → decrypt throws "integrity failed".
5. Boot without `OPENCLAW_COOKIE_SECRET` and `OPENCLAW_TEAM_MODE=1` → process refuses to start.

### ✅ Acceptance Criteria
- [ ] All channel secrets encrypted at rest.
- [ ] Tamper detection via GCM tag.
- [ ] Boot fails fast on missing secret.
- [ ] No secret blob ever logged.
