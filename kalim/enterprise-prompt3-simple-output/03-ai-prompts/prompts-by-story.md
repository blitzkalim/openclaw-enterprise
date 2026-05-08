# AI Coding Prompts — OpenClaw Team Mode (All Epics, All Stories)

> This file consolidates every AI coding prompt from all 8 epics in copy-paste-ready form.
> Each prompt is a complete, self-contained instruction block that an AI coding assistant can
> execute directly. Read the story name and constraints before pasting the prompt.
>
> Source design: `/kalim/enterprise-simple-plan/` (sections 00–13).
> Source stories: `/kalim/enterprise-prompt3-simple-output/02-stories/`.

---

## EPIC 1 — Authentication & Identity Layer

---

### Story 1.1 — Bootstrap `src/team/index.ts` and Activate Team Mode

**Files to create / modify**:
- `src/team/index.ts` (NEW, ~60 lines)
- `src/index.ts` (PATCH, +5 lines)

**Constraints**: Do not change existing OpenClaw boot when `OPENCLAW_TEAM_MODE` is unset. Use TypeScript ESM imports. Keep file size under 80 lines. Respect both `HOME` (Unix) and `USERPROFILE` (Windows).

```
You are a senior Node.js engineer working in the OpenClaw codebase.

CONTEXT
- This is the OpenClaw repo at C:\Users\qures\Downloads\nabi-app-git\openclaw-enterprise.
- The design lives at /kalim/enterprise-simple-plan/.
- Existing entry: src/index.ts boots the OpenClaw gateway. Keep that intact.

TASK
Create src/team/index.ts that exports an async initTeamModule() function and patch src/index.ts
to call it conditionally.

REQUIREMENTS
1. src/team/index.ts:
   - Import better-sqlite3 and open `${OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`}/team.sqlite`.
   - Import migrate from './db-migrate' and call migrate(db) immediately after opening.
   - If `SELECT COUNT(*) FROM users` is 0 AND OPENCLAW_TEAM_ADMIN_EMAIL & OPENCLAW_TEAM_ADMIN_PASSWORD
     are set:
     - Hash password with argon2.hash(pwd, { type: argon2.argon2id }).
     - INSERT a user row with id=randomUUID(), email, password_hash, is_admin=1, status='active',
       created_at=ISO now.
   - Export named: db, initTeamModule, resolveTeamAuth (re-export from auth-middleware),
     mountTeamRoutes (which calls auth-routes/team-routes/channel-router mount fns).
   - Top of file: a no-op when OPENCLAW_TEAM_MODE !== '1'. Make initTeamModule throw if called
     when team mode is off.

2. src/index.ts:
   - Add: `if (process.env.OPENCLAW_TEAM_MODE === '1') {
     await import('./team').then(m => m.initTeamModule()); }`
   - Place it AFTER existing gateway init but BEFORE the server actually starts listening,
     so the routes are mounted.

CONSTRAINTS
- Do not change existing OpenClaw boot when OPENCLAW_TEAM_MODE is unset.
- Use TypeScript ESM imports (matches the codebase style).
- Use process.env.HOME on Linux/Mac; respect process.env.USERPROFILE on Windows for
  OPENCLAW_HOME default.
- Keep file size under 80 lines.

OUTPUT
- src/team/index.ts (full file)
- The exact 5-line patch to src/index.ts (with the surrounding 3 lines of context)
- No prose; code only.
```

---

### Story 1.2 — Implement SQLite Schema & Migrate Function

**Files to create / modify**:
- `src/team/db.ts` (NEW, ~150 lines)
- `src/team/db-migrate.ts` (NEW, ~50 lines)

**Constraints**: TypeScript ESM. No external query builder — raw better-sqlite3 prepared statements only. No nullable columns get `null` strings — pass actual `null`.

```
You are a senior Node.js engineer.

TASK
Create src/team/db.ts and src/team/db-migrate.ts in the OpenClaw repo.

REQUIREMENTS
1. src/team/db-migrate.ts:
   - Export `migrate(db: Database): void`.
   - Read PRAGMA user_version (default 0).
   - If < 1, run the schema below in a transaction, then PRAGMA user_version = 1.
   - Schema includes 6 tables: users, workspaces, user_sessions, api_tokens,
     channel_identities, channel_claims (verbatim from
     /kalim/enterprise-simple-plan/07-minimal-db-changes/db.md).
   - Idempotent: running migrate() twice must not error.

2. src/team/db.ts:
   - Default export: a singleton better-sqlite3 Database handle, opened lazily on first
     import from `${OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`}/team.sqlite`.
   - PRAGMA journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL on first open.
   - Named exports for repo functions:
       findUserByEmail(email): User|null
       findUserById(id): User|null
       createUser(input: { email, passwordHash, name?, isAdmin? }): User
       updateUserLastSeen(id, isoNow): void
       disableUser(id): void
       createSession(userId, userAgent, ip): { id, expiresAt }      // 32-byte hex id
       findSession(id): Session|null
       extendSession(id, isoNow): void                               // bumps +30d
       deleteSession(id): void
       deleteExpiredSessions(isoNow): number
       createApiToken(userId, name, hash): ApiToken
       findApiTokenByHash(hash): ApiToken|null
       updateApiTokenLastUsed(id, isoNow): void
       deleteApiToken(id, userId): void
       createChannelIdentity(input): ChannelIdentity
       findChannelIdentity(channel, externalId): ChannelIdentity|null
       listChannelIdentitiesForUser(userId): ChannelIdentity[]
       deleteChannelIdentity(id, userId): void
       createChannelClaim(userId, channel, ttlSeconds): { code, expiresAt }
       consumeChannelClaim(code): { userId, channel } | null
   - Types defined inline at top of file.
   - Use prepared statements; do not concatenate SQL.

3. Use crypto.randomUUID() for ids; crypto.randomBytes(32).toString('hex') for session ids;
   crypto.createHash('sha256') for api token hashes.

CONSTRAINTS
- TypeScript ESM.
- No external query builder. Raw better-sqlite3 prepared statements only.
- No nullable columns get `null` strings — pass actual `null`.

Schema to implement (all tables):

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  workspace_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT
);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  user_agent   TEXT,
  ip_address   TEXT
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_exp  ON user_sessions(expires_at);

CREATE TABLE api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE channel_identities (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  channel      TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  display_name TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (channel, external_id)
);
CREATE INDEX idx_channel_identities_user ON channel_identities(user_id);

CREATE TABLE channel_claims (
  code         TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  consumed_at  TEXT
);

OUTPUT
- src/team/db.ts (full file)
- src/team/db-migrate.ts (full file)
```

---

### Story 1.3 — Implement `resolveTeamAuth` Middleware

**Files to create / modify**:
- `src/team/auth-middleware.ts` (NEW, ~80 lines)

**Constraints**: Do not import from `src/gateway/*` (no circular dep). All DB calls go through `./db` imports. Don't throw on missing/invalid creds — return `null` and let the caller decide.

```
You are a senior Node.js engineer.

TASK
Create src/team/auth-middleware.ts.

REQUIREMENTS
1. Export `resolveTeamAuth(req): Promise<TeamCtx | null>`.
2. TeamCtx type:
   type TeamCtx = {
     userId: string;
     workspaceId: string | null;
     isAdmin: boolean;
     source: 'cookie' | 'api-token' | 'legacy';
     files?: UserFiles;
   };

3. Order of resolution (return first hit, never combine):
   a) Cookie `oc_session`:
        - parse from req.headers.cookie
        - findSession(value); if row && new Date(row.expires_at) > new Date():
            extendSession(value, new Date().toISOString())
            user = findUserById(row.user_id)
            if (!user || user.status !== 'active') return null
            ctx = { userId: user.id, workspaceId: user.workspace_id,
                    isAdmin: !!user.is_admin, source: 'cookie' }
   b) Authorization Bearer:
      i)  starts with 'ocp_' → hash with sha256 hex; findApiTokenByHash; on hit:
            updateApiTokenLastUsed; user = findUserById(token.user_id)
            return { ..., source: 'api-token' }
      ii) else timingSafeEqual against process.env.OPENCLAW_GATEWAY_TOKEN:
            return { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }

4. After resolution, if ctx && ctx.userId !== 'admin':
      ctx.files = await resolveUserFiles(ctx.userId)   // import from './file-resolver'

5. Helper `extractBearer(req): string | null` parses 'Authorization: Bearer X'.
6. Helper `parseCookie(req, name): string | null`.
7. Use crypto.timingSafeEqual for the legacy comparison; fall back to false on length mismatch.
8. Touch updateUserLastSeen(user.id, isoNow) for cookie/api-token paths only (not legacy).

CONSTRAINTS
- Do not import from src/gateway/* (no circular dep).
- All DB calls go through ./db imports.
- Don't throw on missing/invalid creds — return null and let the caller decide.

OUTPUT
- src/team/auth-middleware.ts (full file)
```

---

### Story 1.4 — Patch `src/gateway/auth.ts` to Call `resolveTeamAuth` First

**Files to create / modify**:
- `src/gateway/auth.ts` (PATCH, +15 lines)

**Constraints**: Existing `OPENCLAW_GATEWAY_TOKEN` flow MUST keep working. Existing tests in `src/gateway/auth.test.ts` MUST continue to pass. Change must be inside an env-flag if-branch so it's a no-op when team mode is off.

```
You are a senior Node.js engineer working on the OpenClaw repo.

TASK
Patch src/gateway/auth.ts: at the top of the existing http authorize function, call
resolveTeamAuth(req) and short-circuit on success.

REQUIREMENTS
1. Import resolveTeamAuth from '../team/auth-middleware'. Use a dynamic import wrapped in
   a try/catch so the module is only loaded when OPENCLAW_TEAM_MODE === '1'. Cache the
   resolved fn in a module-level variable.

2. At the very top of authorizeHttpGatewayConnect (or whatever the existing authorize fn
   is named — find it via grep):
       if (process.env.OPENCLAW_TEAM_MODE === '1') {
         const team = await resolveTeamAuth(req);
         if (team) {
           (req as any).team = team;
           return true;
         }
       }

3. Leave the existing logic UNCHANGED below this insertion. The function already handles
   bearer/Tailscale/proxy/device-token paths — do not touch them.

4. The function might be sync today; if so, change its return type to Promise<boolean> and
   update its 1–2 callers to await. Search the codebase for callers first.

CONSTRAINTS
- Existing OPENCLAW_GATEWAY_TOKEN flow MUST keep working.
- Existing tests in src/gateway/auth.test.ts MUST continue to pass.
- The change must be inside an env-flag if-branch so it's a no-op when team mode is off.

OUTPUT
- The exact edited src/gateway/auth.ts (full file or unified diff).
- If async-conversion is needed, the corresponding caller patches.
```

---

### Story 1.5 — Implement `/auth/login`, `/auth/logout`, `/auth/me`

**Files to create / modify**:
- `src/team/auth-routes.ts` (NEW, ~120 lines)

**Constraints**: Use the existing Express-like app instance (find how other routes are mounted in `src/gateway/server-http.ts`). Argon2 from `'argon2'` npm package. Cookie parsing without an external dep — inline, ~10 lines.

```
You are a senior Node.js engineer.

TASK
Create src/team/auth-routes.ts that exports `mountAuthRoutes(app)` to register four routes.

REQUIREMENTS
1. POST /auth/login:
   - Body: JSON { email: string, password: string }
   - Validate inputs (both required, basic email regex).
   - findUserByEmail(email); if !user || user.status !== 'active': return 401
     with { error: 'invalid_credentials' }.
   - argon2.verify(user.password_hash, password); on false → 401.
   - createSession(user.id, req.headers['user-agent'] ?? null, req.ip ?? null)
     → { id, expiresAt }.
   - Set Set-Cookie: `oc_session=${id}; HttpOnly; SameSite=Lax; Path=/;
     Max-Age=2592000${isHttps ? '; Secure' : ''}`.
   - Return 200 { user: { id, email, name, isAdmin, workspaceId } }.
   - On invalid creds: increment OpenClaw's auth-rate-limit.ts counter (require it lazily;
     if missing, log and continue).

2. POST /auth/logout:
   - Read oc_session cookie. If present: deleteSession(cookieValue).
   - Set-Cookie: `oc_session=; HttpOnly; Path=/; Max-Age=0`.
   - Return 204.

3. GET /auth/me:
   - Call resolveTeamAuth(req).
   - If null → 401 { error: 'unauthenticated' }.
   - Else return 200 { user: { id, email, name, isAdmin, workspaceId, source },
     files? }.

4. POST /auth/reset:
   - Body: { token, newPassword }
   - Look up the reset token in channel_claims table with channel='reset'.
   - On valid: update users.password_hash, delete all user_sessions for that user.
   - On invalid: 400.

5. CSRF: /auth/login and /auth/logout require a `x-csrf` header that matches the value
   in the `oc_csrf` cookie. /auth/me does not. /auth/reset requires the reset token itself.

6. GET /login:
   - Generate or read the oc_csrf cookie (16-byte random hex). Set if missing.
   - Read login.html from disk (cache after first read).
   - Replace __CSRF__ token placeholder with the cookie value.
   - Return text/html.

CONSTRAINTS
- Use the existing Express-like app instance.
- Argon2 from 'argon2' npm package.
- Cookie parsing without an external dep — do it inline, ~10 lines.

OUTPUT
- src/team/auth-routes.ts (full file)
```

---

### Story 1.6 — Implement API Token Routes (`/team/tokens`)

**Files to create / modify**:
- `src/team/team-routes.ts` (NEW or extend, API-token slice)

**Constraints**: Never log the raw token. Reject names that are blank or > 80 chars with 400. Token prefix MUST be `'ocp_'` so `resolveTeamAuth` can fast-path it.

```
You are a senior Node.js engineer.

TASK
Add three routes to src/team/team-routes.ts (or create the file):
GET, POST, DELETE under /team/tokens.

REQUIREMENTS
1. All three routes call resolveTeamAuth(req) first; on null → 401.
   CSRF required for POST/DELETE.

2. GET /team/tokens:
   - SELECT id, name, last_used_at, created_at FROM api_tokens
     WHERE user_id = ? ORDER BY created_at DESC.
   - Return { tokens: [...] }.

3. POST /team/tokens:
   - Body: { name: string } (required, max 80 chars).
   - raw = 'ocp_' + crypto.randomBytes(24).toString('base64url')
   - hash = crypto.createHash('sha256').update(raw).digest('hex')
   - createApiToken(userId, name, hash)
   - Return 201 { id, name, token: raw, created_at }.
     Document that this is the only time the raw token is returned.

4. DELETE /team/tokens/:id:
   - deleteApiToken(req.params.id, ctx.userId).
   - Return 204 on success, 404 if no row matched.

CONSTRAINTS
- Never log the raw token.
- Reject names that are blank or > 80 chars with 400.
- Token prefix MUST be 'ocp_' so resolveTeamAuth can fast-path it.

OUTPUT
- The new fns in src/team/team-routes.ts (full file or diff if file exists).
```

---

### Story 1.7 — Mount Team Routes Conditionally in `server-http.ts`

**Files to create / modify**:
- `src/gateway/server-http.ts` (PATCH, +10 lines)

**Constraints**: Do not interfere with existing route registration. Wrap in try/catch and log if mountTeamRoutes throws — never crash the gateway.

```
You are a senior Node.js engineer.

TASK
Patch src/gateway/server-http.ts to mount team routes when OPENCLAW_TEAM_MODE=1.

REQUIREMENTS
1. Find where existing OpenClaw HTTP routes are registered on the app/router instance.
2. Immediately after that registration block, add:
       if (process.env.OPENCLAW_TEAM_MODE === '1') {
         const team = await import('../team');
         await team.mountTeamRoutes(app);
       }
   The team module's mountTeamRoutes should internally call:
       mountAuthRoutes(app);
       mountAdminRoutes(app);
       mountChannelRouter(app);
3. Order matters: auth routes must be reachable without auth (public endpoints); team
   admin routes require auth; channel routes verify their own signatures.

CONSTRAINTS
- Do not interfere with existing route registration.
- Wrap in try/catch and log if mountTeamRoutes throws — never crash the gateway.

OUTPUT
- The patch (unified diff) for src/gateway/server-http.ts.
```

---

## EPIC 2 — User Overlay File System

---

### Story 2.1 — Implement `resolveUserFiles(userId)` in `file-resolver.ts`

**Files to create / modify**:
- `src/team/file-resolver.ts` (NEW, ~120 lines)
- `src/team/file-resolver.test.ts` (NEW)

**Constraints**: Pure `node:fs/promises`, `node:path`, no other deps. Idempotent: must be safe to call N times concurrently for the same user. Do not throw on already-existing dirs/files.

```
You are a senior Node.js engineer.

TASK
Create src/team/file-resolver.ts with a single exported async function
resolveUserFiles(userId: string): Promise<UserFiles>.

REQUIREMENTS
1. Constants at top:
   const OPENCLAW_HOME  = process.env.OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`;
   const WORKSPACE_ROOT = path.join(OPENCLAW_HOME, 'workspace');
   const BASE_DIR       = path.join(WORKSPACE_ROOT, 'base');

2. UserFiles type with all 10 string fields (5 file paths + 5 dirs):
   - soulPath, agentsPath, memoryPath, userProfilePath, tasksPath
   - uploadsDir, conversationsDir, tmpDir, toolCacheDir, logsDir

3. Helpers (private):
   async function ensureEmpty(p) {
     try { await fs.access(p); } catch { await fs.writeFile(p, '', 'utf8'); }
   }
   async function ensureCopied(src, dest) {
     try { await fs.access(dest); } catch { await fs.copyFile(src, dest); }
   }

4. resolveUserFiles(userId):
   - Validate userId is non-empty, contains no path separators, and matches
     /^[A-Za-z0-9_\-]+$/. Throw Error('invalid userId') if not.
   - userDir = path.join(WORKSPACE_ROOT, 'users', `user_${userId}`)
   - mkdir userDir + 5 subdirs in parallel.
   - ensureCopied for SOUL.md and AGENTS.md from BASE_DIR.
   - ensureEmpty for MEMORY.md, USER.md, TASKS.md.
   - Clear tmp/: fs.rm(tmpDir, {recursive:true, force:true}); fs.mkdir(tmpDir).
   - Return UserFiles object.

5. Special handling:
   - If BASE_DIR/SOUL.md does not exist: log a warning AND create the user's SOUL.md
     as empty so the runtime can still proceed.
   - Same for AGENTS.md.

6. Export: resolveUserFiles, type UserFiles, constants WORKSPACE_ROOT and BASE_DIR
   (so secure-fs.ts can use them).

CONSTRAINTS
- Pure node:fs/promises, node:path, no other deps.
- Idempotent: must be safe to call N times concurrently for the same user.
- Do not throw on already-existing dirs/files.

OUTPUT
- src/team/file-resolver.ts (full file)
- src/team/file-resolver.test.ts with:
  - First call creates all dirs + seeds SOUL/AGENTS, creates empty MEMORY/USER/TASKS
  - Second call returns same paths without overwriting
  - tmp/ is cleared on every call
  - Missing base/SOUL.md logs a warning and creates empty file
  - admin user never passed to resolver
  - userId with path separators throws
```

---

### Story 2.2 — Wire `resolveUserFiles` Into `auth-middleware.ts`

**Files to create / modify**:
- `src/team/auth-middleware.ts` (PATCH, +5 lines within the existing fn)

**Constraints**: Legacy/admin path must NOT call `resolveUserFiles`. Only one call site for `resolveUserFiles` in the entire codebase: this one.

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

---

### Story 2.3 — Implement Memory Append + Trim Helper

**Files to create / modify**:
- `src/team/memory.ts` (NEW, ~40 lines)
- `src/team/memory.test.ts` (NEW)

**Constraints**: Path is taken as-is from caller. No path construction here. Caller is responsible for invoking `secureWrite` if the line came from untrusted input.

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
- Caller is responsible for invoking secureWrite when calling from agent runtime.

OUTPUT
- src/team/memory.ts (full file)
- src/team/memory.test.ts with:
  - append below cap
  - append over cap (verifies trim from top)
  - empty input no-op
  - atomic write behavior
```

---

### Story 2.4 — Add `OPENCLAW_HOME` Env Override + Default (Centralize Paths)

**Files to create / modify**:
- `src/team/paths.ts` (NEW)
- `src/team/file-resolver.ts` (refactor to import from paths.ts)
- `src/team/db.ts` (refactor to use `getTeamSqlitePath()`)
- `src/team/secure-fs.ts` (refactor to use `WORKSPACE_ROOT` and `BASE_DIR`)

**Constraints**: `getUserDir(userId)` must validate userId (same regex as resolver). Cache only paths that depend on env; expose `__resetForTests` for test isolation.

```
You are a senior Node.js engineer.

TASK
Create src/team/paths.ts that centralizes path construction; refactor existing team-mode
files to use it.

REQUIREMENTS
1. src/team/paths.ts:
   - Export getOpenclawHome(): string  (cached after first call).
   - Export WORKSPACE_ROOT (lazy constant).
   - Export BASE_DIR (lazy constant).
   - Export getTeamSqlitePath(): string.
   - Export getUserDir(userId: string): string — validates userId regex, returns absolute path.
   - Export __resetForTests(): void — clears cached values (for test isolation only).

2. Refactor src/team/file-resolver.ts to import from paths.ts (remove its own constants).
3. Refactor src/team/db.ts to use getTeamSqlitePath().
4. Refactor src/team/secure-fs.ts to use WORKSPACE_ROOT and BASE_DIR.

CONSTRAINTS
- getUserDir(userId) must validate userId (same regex as resolver: /^[A-Za-z0-9_\-]+$/).
- Cache only paths that depend on env.
- Cross-platform: HOME on Unix, USERPROFILE on Windows.

OUTPUT
- src/team/paths.ts (full file)
- Diffs for the three files that now import from it.
```

---

### Story 2.5 — Lazy-Initialize the `base/` Directory on First Boot

**Files to create / modify**:
- `src/team/index.ts` (PATCH, add `bootstrapBaseDir()` call)

**Constraints**: Use the `WORKSPACE_ROOT`/`BASE_DIR` from `src/team/paths.ts`. Reuse `ensureEmpty` from `file-resolver.ts` (export it if not already). Detect first-creation vs. existing by checking dir existence BEFORE mkdir.

```
You are a senior Node.js engineer.

TASK
Add bootstrapBaseDir() to src/team/index.ts; call it during initTeamModule().

REQUIREMENTS
1. Call after migrate(db) succeeds.
2. Idempotent: do not overwrite existing files in base/.
3. mkdir -p BASE_DIR, BASE_DIR/skills, BASE_DIR/tools.
4. ensureEmpty for BASE_DIR/SOUL.md and BASE_DIR/AGENTS.md.
5. Log `[team] base/ initialized at <path>` on first creation; do not log on
   subsequent boots.
6. Detect first-creation vs. existing by checking dir existence BEFORE mkdir
   (use fs.stat to test).

CONSTRAINTS
- Use the WORKSPACE_ROOT/BASE_DIR from src/team/paths.ts.
- Reuse ensureEmpty from file-resolver.ts (export it if not already).

OUTPUT
- The patch to src/team/index.ts (the added bootstrapBaseDir fn + call in initTeamModule).
```

---

## EPIC 3 — Agent Runtime Integration

---

### Story 3.1 — Add `team` Field to Runtime Request Shape

**Files to create / modify**:
- `src/agents/agent-command.ts` (PATCH, ~5 of the +25 lines) or the type-defining sibling file

**Constraints**: Additive only. Existing callers must continue to work without supplying `team`. Do not break the existing test suite. Lazy-import the team module type to avoid circular deps — use `import type` only.

```
You are a senior Node.js engineer working on src/agents/agent-command.ts (~1,200 lines,
the agent runtime orchestrator).

TASK
Add optional `team` field to the inbound runtime request and propagate it into the
per-call ctx.

REQUIREMENTS
1. Identify the request type used by the agent runtime entry point. Search for the function
   that takes the inbound message and constructs a per-request ctx (likely `handleInbound`
   or similar).
2. Add a `team?` field to that type:
       team?: {
         userId: string;
         workspaceId: string | null;
         isAdmin: boolean;
         source: 'cookie' | 'api-token' | 'legacy';
         files?: import('../team/file-resolver').UserFiles;
       };
3. In the ctx builder, attach `team: req.team` so downstream skills/tools can access
   ctx.team.
4. No other changes — no LLM call modifications, no tool dispatch changes, no streaming
   changes.
5. If the type is in a separate file (e.g. src/agents/agent-runtime-config.ts), put the
   type extension there.

CONSTRAINTS
- Additive only. Existing callers must continue to work without supplying `team`.
- Do not break the existing test suite.
- Lazy-import the team module type to avoid circular deps. Use `import type` only.

OUTPUT
- The patch to src/agents/agent-command.ts (and the type-defining file if separate).
```

---

### Story 3.2 — Override `workspaceDir` and Read User Files via `secureRead`

**Files to create / modify**:
- `src/agents/agent-command.ts` (PATCH, ~15 of the +25 lines)

**Constraints**: All reads inside the team branch use `secureRead`, never bare `fs.readFile`. Existing single-user code path must remain bit-identical when `team.files` is absent. Maximum 15 net new lines.

```
You are a senior Node.js engineer.

TASK
Patch src/agents/agent-command.ts to read SOUL.md, AGENTS.md, MEMORY.md, USER.md,
TASKS.md from per-user paths when team.files is present.

REQUIREMENTS
1. Find where the runtime currently reads SOUL.md and AGENTS.md (agent personality and
   config files; they may be named differently — look for DEFAULT_SOUL_FILENAME,
   DEFAULT_AGENTS_FILENAME from src/agents/workspace.ts or similar constants).
2. Wrap the existing read in `if (team?.files) { secureRead(team.userId, team.files.soulPath)
   ... } else { /* existing base/ read */ }`.
3. Read MEMORY.md, USER.md, TASKS.md only when `team?.files` is present (these don't have
   a single-user fallback).
4. Pass the contents into the existing prompt builder. If the existing prompt builder
   doesn't take memory/user/tasks, append them as fenced sections at the end of the
   system prompt:
       ----
       # Persistent memory
       ${memoryContent}

       # User profile
       ${userProfileContent}

       # Pending tasks
       ${tasksContent}
5. Override the runtime's workspaceDir variable (find the existing one) to point at the
   user's directory when team.files is present:
       workspaceDir = path.dirname(team.files.soulPath);  // = users/user_<id>/
6. Use try/catch with `.catch(() => '')` only on MEMORY/USER/TASKS reads — those files
   may legitimately be empty / freshly created.
7. Hard-fail (let secureRead throw) on SOUL/AGENTS reads.

CONSTRAINTS
- All reads inside the team branch use secureRead, never bare fs.readFile.
- Existing single-user code path must remain bit-identical when team.files is absent.
- Maximum 15 net new lines.

OUTPUT
- The patched function in src/agents/agent-command.ts (full updated function or unified diff).
```

---

### Story 3.3 — Append to `MEMORY.md` on Successful Session via `secureWrite`

**Files to create / modify**:
- `src/agents/agent-command.ts` (PATCH, ~5 of the +25 lines)

**Constraints**: All reads/writes go through `secureRead`/`secureWrite`. Cap is 8192 bytes. Concurrent writes are serialized per-user via a tiny per-user mutex (`Map<userId, Promise>`) to avoid lost updates.

```
You are a senior Node.js engineer.

TASK
Patch src/agents/agent-command.ts to append to MEMORY.md at session end via secureWrite.

REQUIREMENTS
1. After the agent reply has streamed to completion, scan the reply for
   `<memory>...</memory>` blocks (case-insensitive). Each block's inner text becomes
   one memory line.
2. If team?.files?.memoryPath is present:
   - For each memory block:
       const line = block.replace(/\s+/g, ' ').trim();
       if (!line) continue;
       const current = await secureRead(team.userId, team.files.memoryPath).catch(() => '');
       const next = trimToCap(
         current + (current && !current.endsWith('\n') ? '\n' : '') + line + '\n',
         8192
       );
       await secureWrite(team.userId, team.files.memoryPath, next);
3. trimToCap(text, cap): split by '\n', shift oldest until total bytes <= cap.
4. Strip the `<memory>...</memory>` blocks from the reply BEFORE sending to the channel
   — they are internal control markers, not user-facing.

CONSTRAINTS
- All reads/writes go through secureRead/secureWrite.
- Cap is 8192 bytes (configurable via env later; hardcode for now).
- Concurrent writes are serialized per-user via a tiny per-user mutex
  (Map<userId, Promise>) to avoid lost updates.

OUTPUT
- Patched src/agents/agent-command.ts (the relevant function or full file).
- Updated tests asserting that <memory> blocks are persisted and stripped from the reply.
```

---

### Story 3.4 — Patch `session-key-utils.ts` for User-Prefix

**Files to create / modify**:
- `src/sessions/session-key-utils.ts` (PATCH, +5 lines)

**Constraints**: Existing tests in `src/sessions/` must pass without modification. The new prefix is `u:` + userId + `:` — a single colon separator both sides; no other changes.

```
You are a senior Node.js engineer.

TASK
Patch src/sessions/session-key-utils.ts to prefix session keys with `u:<userId>:` when
team context is present.

REQUIREMENTS
1. Identify the existing fn that derives a session key. Inspect its parameter shape;
   the existing logic stays UNCHANGED.
2. Accept an optional `team` field in the input shape (or a new parameter, whichever
   matches the existing convention).
3. After the existing logic computes `base`, return:
       userId ? `u:${userId}:${base}` : base
4. userId source: parts.team?.userId — never from request-supplied data.
5. If callers exist in src/agents/agent-command.ts, src/channels/*, etc. — find them
   and pass the team through.

CONSTRAINTS
- Existing tests in src/sessions/ must pass without modification.
- The new prefix is `u:` + userId + `:` — a single colon separator both sides.

OUTPUT
- The patch (unified diff) for src/sessions/session-key-utils.ts.
- A list of caller sites updated (if any) with their diffs.
```

---

## EPIC 4 — Channel Routing (WhatsApp + Telegram)

---

### Story 4.1 — Telegram Webhook Endpoint with Secret-Token Verification

**Files to create / modify**:
- `src/team/channel-router.ts` (NEW, ~90 lines for this story)

**Constraints**: No grammy import — hit Telegram's HTTP API directly. Raw body capture is required. All file writes go through `secureWrite`. Always return 200 to Telegram on success.

```
You are a senior Node.js engineer.

TASK
Implement the Telegram webhook handler in src/team/channel-router.ts.

REQUIREMENTS
1. Export `mountChannelRouter(app)` which registers POST /webhooks/telegram/:workspaceId.
2. The handler MUST read the raw request body (Buffer) before any JSON parsing — opt out
   of body-parsing middleware for these webhook routes (raw bytes only).
3. Verify the header `x-telegram-bot-api-secret-token`:
   - Look up the workspace's stored secret via a workspace_channels table row
     (workspace_id, channel='telegram', config_encrypted).
   - Decrypt via decryptSecret(config_encrypted), parse JSON to get { botToken,
     webhookSecret }.
   - timingSafeEqual; on mismatch → 401, log, drop.
4. JSON.parse the raw body inside a try/catch; on bad JSON → 400.
5. Extract:
       const update = JSON.parse(rawBody);
       const message = update.message || update.edited_message;
       if (!message) return res.status(200).end();
       const externalId = String(message.chat.id);
       const text       = message.text ?? message.caption ?? null;
6. Look up identity via findChannelIdentity('telegram', externalId).
7. If found:
       - Build sessionKey via deriveSessionKey({ channel: 'tg', threadId: externalId,
         team: { userId: identity.user_id } }).
       - Call dispatch({ userId: identity.user_id, workspaceId, channel: 'telegram',
         threadId: externalId, text, attachments: [] }).
   If not found:
       - If text matches /^claim\s+OC-/ → invoke claim handler (Story 4.5).
       - Else if workspace has auto_create_guest_users === true → auto-create (Story 4.6).
       - Else: log unknown sender, return 200 (don't reply to strangers).
8. Always return 200 OK to Telegram on success.

CONSTRAINTS
- No grammy import — hit Telegram's HTTP API directly when sending replies.
- Raw body capture required before any JSON parsing.
- All file writes go through secureWrite (Story 5.1).

OUTPUT
- src/team/channel-router.ts (full file, may include WhatsApp handler too)
```

---

### Story 4.2 — WhatsApp Webhook with HMAC-SHA256 Verification (Meta Cloud API)

**Files to create / modify**:
- `src/team/channel-router.ts` (extends with WhatsApp handler)
- `src/team/wa-meta-client.ts` (NEW, outbound + media download)

**Constraints**: Constant-time HMAC compare. Raw body MUST be the exact bytes Meta sent. Dedupe by `msg.id` (LRU of last 100 ids per workspace). Return 200 immediately; send reply asynchronously.

```
You are a senior Node.js engineer.

TASK
Implement WhatsApp Meta Cloud API webhook handler in src/team/channel-router.ts.

REQUIREMENTS
1. GET /webhooks/whatsapp/:workspaceId:
   - Read query params: hub.mode, hub.verify_token, hub.challenge.
   - Lookup the workspace's verify_token from workspace_channels (channel='whatsapp',
     decrypt config JSON, get verifyToken field).
   - If hub.mode === 'subscribe' AND timingSafeEqual(verify_token, stored):
     return 200 with hub.challenge as plain text body.
   - Else: 403.

2. POST /webhooks/whatsapp/:workspaceId:
   - Read raw body as Buffer.
   - Read header x-hub-signature-256 (format: 'sha256=' + 64 hex chars).
   - Compute HMAC-SHA256(rawBody, appSecret from workspace config) → hex.
   - timingSafeEqual against header value (after stripping 'sha256=' prefix).
   - On mismatch → 401 + log; do NOT proceed to parsing.
   - Parse JSON body.
   - Walk entry[0].changes[0].value. If messages array empty → return 200.
   - Extract:
         const msg = value.messages[0];
         const contact = value.contacts?.[0];
         const externalId = '+' + (contact?.wa_id ?? msg.from);
         const displayName = contact?.profile?.name ?? null;
         const text = msg.type === 'text' ? msg.text.body
                    : (msg.image?.caption ?? msg.document?.caption ?? null);
   - If msg.type === 'document' or 'image': download media, secureWrite to uploadsDir.
   - Identity lookup + dispatch, identical to Telegram.
   - Dedupe by msg.id (LRU of last 100 ids per workspace).
   - Return 200 immediately; send outbound reply asynchronously.

3. src/team/wa-meta-client.ts:
   - sendMessage(phoneNumberId, accessToken, to, text): POST to
     https://graph.facebook.com/v17.0/<phoneNumberId>/messages
   - downloadMedia(mediaId, accessToken): GET media URL from graph API, then stream bytes.

CONSTRAINTS
- Constant-time HMAC compare.
- Raw body MUST be the exact bytes Meta sent.
- Dedupe via LRU of last 100 ids per workspace.
- Return 200 immediately; reply asynchronously.

OUTPUT
- The WhatsApp handler section of src/team/channel-router.ts.
- src/team/wa-meta-client.ts (full file).
```

---

### Story 4.3 — Channel-Identity Mapping Endpoints

**Files to create / modify**:
- `src/team/team-routes.ts` (extends, identity slice)

**Constraints**: All require auth. POST is admin-only (Mode B). Cross-user delete blocked by matching `user_id`.

```
You are a senior Node.js engineer.

TASK
Add three routes for channel-identity self-management to src/team/team-routes.ts.

REQUIREMENTS
1. GET /team/identities → return mappings for ctx.userId:
   listChannelIdentitiesForUser(ctx.userId) → { identities: [...] }

2. DELETE /team/identities/:id → only delete if user_id === ctx.userId:
   deleteChannelIdentity(req.params.id, ctx.userId) → 204 or 404.

3. POST /team/identities (admin only):
   - Body: { userId, channel: 'whatsapp'|'telegram', externalId, displayName? }
   - Reject if not isAdmin → 403.
   - createChannelIdentity({ user_id: userId, channel, external_id: externalId,
     display_name: displayName ?? null, workspace_id: null, created_at: isoNow }).
   - On UNIQUE violation → 409.
   - Return 201 with the created row.

CONSTRAINTS
- All require auth (resolveTeamAuth → 401 on null).
- POST is admin-only.
- Cross-user delete blocked (deleteChannelIdentity checks user_id).

OUTPUT
- The added routes in src/team/team-routes.ts (diff or full file).
```

---

### Story 4.4 — Implement `dispatch()` to OpenClaw Runtime

**Files to create / modify**:
- `src/team/channel-router.ts` (the `dispatch` function, ~30 lines)

**Constraints**: Do not duplicate logic from existing channel extensions; reuse their send-out path for the reply. Channel-specific reply emission stays out of `dispatch`.

```
You are a senior Node.js engineer.

TASK
Implement the shared dispatch fn in src/team/channel-router.ts.

REQUIREMENTS
1. Signature:
   async function dispatch(args: {
     userId: string;
     workspaceId: string | null;
     channel: string;
     threadId: string;
     text: string | null;
     attachments: Array<{ path: string; mimeType: string }>;
   }): Promise<void>

2. Body:
   const files = await resolveUserFiles(args.userId);
   const team  = {
     userId: args.userId,
     workspaceId: args.workspaceId ?? null,
     isAdmin: false,
     source: 'webhook' as const,
     files,
   };
   const sessionKey = deriveSessionKey({ channel: args.channel,
     threadId: args.threadId, team });
   await runOpenclawAgent({ sessionKey, channel: args.channel, threadId: args.threadId,
     text: args.text, attachments: args.attachments, team });

3. runOpenclawAgent: import the existing OpenClaw entrypoint. Search the codebase for the
   function that channel extensions already call when an inbound message lands (likely in
   src/agents/agent-command.ts named handleInbound, processInbound, or runAgentTurn).
   If unsure, expose a thin facade in src/agents/index.ts.

4. Wrap the call in try/catch; on error:
   - Log to the user's logsDir via secureWrite (a JSON line with timestamp + error stack).
   - Rethrow.

CONSTRAINTS
- Do not duplicate logic from existing channel extensions.
- Channel-specific reply emission stays out of dispatch.

OUTPUT
- The dispatch fn (and runOpenclawAgent facade if needed).
```

---

### Story 4.5 — Mode A: Claim-Code Flow

**Files to create / modify**:
- `src/team/team-routes.ts` (claim endpoint)
- `src/team/channel-router.ts` (claim handler in webhook)

**Constraints**: `consumeChannelClaim` must be atomic (UPDATE … WHERE consumed_at IS NULL AND expires_at > now). Do not log the raw code. Code TTL: 10 minutes.

```
You are a senior Node.js engineer.

TASK
Implement the claim flow for linking WhatsApp/Telegram accounts.

REQUIREMENTS
1. src/team/team-routes.ts:
   POST /team/identities/claim with auth:
   - Body: { channel: 'whatsapp'|'telegram' }
   - Reject other channel values with 400.
   - Generate code: 'OC-' + 6 chars from base32 alphabet
     (A-H, J-N, P-Z, 2-9 — no I, L, O, 0, 1 to avoid visual confusion).
   - createChannelClaim(userId, channel, ttlSeconds=600).
   - Return { code, expiresAt }.

2. src/team/channel-router.ts — when inbound text matches
   /^claim\s+(OC-[A-HJ-NP-Z2-9]{6})\s*$/i:
   - Extract the code.
   - consumeChannelClaim(code) → returns { user_id, channel } | null.
   - If null OR channel doesn't match the inbound channel:
     reply "Invalid or expired claim code." via channel-specific send path.
   - Else:
       - createChannelIdentity({ user_id, channel, external_id: externalId,
         display_name: displayName ?? null, workspace_id }).
       - On UNIQUE violation: reply "This <channel> account is already linked."
       - Else reply "Linked! You can now message me normally."
   - On the regex non-match path with unknown sender → drop (existing default).

CONSTRAINTS
- consumeChannelClaim must be atomic.
- Do not log the raw code.
- Code TTL: 10 minutes.

OUTPUT
- The new claim route in src/team/team-routes.ts.
- The regex branch in channel-router.ts for both Telegram and WhatsApp handlers.
```

---

### Story 4.6 — Mode C: Auto-Create Guest User from Sender

**Files to create / modify**:
- `src/team/channel-router.ts` (Mode-C branch + workspace config loader)

**Constraints**: No upper bound on total guests. Per-IP burst limit: max 10 new guests/min (in-memory LRU). Guest's hashed password sentinel `'!disabled!'` must NEVER pass `argon2.verify`. Never send any email.

```
You are a senior Node.js engineer.

TASK
Implement Mode-C auto-create-guest in src/team/channel-router.ts.

REQUIREMENTS
1. Add a workspace-config loader:
   getWorkspaceConfig(wsId: string): { auto_create_guest_users: boolean } | null
   — reads from workspace_channels or a workspaces table column.

2. After identity miss + claim-flow miss, check the workspace config.

3. If auto_create_guest_users:
   - Per-IP rate limit: max 10 new guests/min (in-memory LRU). Exceeded → drop,
     do not auto-create.
   - email = `${channel}:${externalId}@guest.local`.
   - createUser({ email, passwordHash: '!disabled!', name: displayName ?? null,
     isAdmin: false, status: 'active' }).
   - createChannelIdentity({ user_id: newUser.id, channel, external_id: externalId,
     display_name: displayName ?? null, workspace_id: wsId }).
   - dispatch(newUser.id, wsId, channel, threadId, text, attachments).

4. The hashed password sentinel '!disabled!' must NEVER pass argon2.verify; the guest
   cannot log in.

5. Log a single line per creation:
   `[team] guest user created: ${userId} ${channel}:${externalId}`

CONSTRAINTS
- No upper bound on total guests (operator's responsibility).
- Per-IP burst limit: max 10 new guests/min (in-memory LRU).
- Guest email is non-routable; never send any email.

OUTPUT
- The Mode-C branch in channel-router.ts.
- The getWorkspaceConfig helper.
```

---

### Story 4.7 — File Streaming for Inbound Documents/Images

**Files to create / modify**:
- `src/team/channel-router.ts` (streaming integration)
- `src/team/wa-meta-client.ts` (media download helper)

**Constraints**: `secureWrite` must fire BEFORE the network request to verify path. Stream — never load whole file in memory. Filenames are server-constructed (timestamp + file_id) — no user input. Cap: 25 MB default. Allowed mimetypes: `image/*`, `application/pdf`.

```
You are a senior Node.js engineer.

TASK
Implement inbound file streaming for both Telegram and WhatsApp channels.

REQUIREMENTS
1. Telegram:
   - Resolve via: GET https://api.telegram.org/bot<TOKEN>/getFile?file_id=<id>
     → { result: { file_path } }
   - Stream: GET https://api.telegram.org/file/bot<TOKEN>/<file_path> → bytes
   - Destination: <uploadsDir>/<timestamp>_<file_id>.<ext>

2. WhatsApp Meta:
   - Resolve: GET https://graph.facebook.com/v17.0/<media-id>
     → { url, mime_type }
   - Stream: GET that URL with Authorization: Bearer <access_token> → bytes
   - Destination: <uploadsDir>/<timestamp>_<media-id>.<ext>

3. Always:
   - Compute destPath BEFORE creating the file.
   - secureWrite(userId, destPath, '') first to validate path; throws SecureFsViolationError
     on traversal.
   - Stream bytes into destPath via fs.createWriteStream + pipeline().
   - On stream error: fs.rm the partial file; rethrow.
   - Size cap: env OPENCLAW_TEAM_MAX_UPLOAD_BYTES default 25 MB; over-cap → reject + drop.
   - Allowed mimeTypes: image/*, application/pdf. Others → log + drop.

4. Attach { path: destPath, mimeType } to the dispatch attachments array.

CONSTRAINTS
- secureWrite must fire BEFORE the network request to verify path.
- Stream bytes — never load whole file in memory.
- Filenames are server-constructed (timestamp + file_id) — no user input in filename.

OUTPUT
- streamTelegramFile and streamMetaMedia helpers (in their respective files).
- The integration into both webhook handlers in channel-router.ts.
```

---

## EPIC 5 — Secure File Access Enforcement

---

### Story 5.1 — Implement `secureRead`, `secureWrite`, `validatePath`

**Files to create / modify**:
- `src/team/secure-fs.ts` (NEW, ~90 lines)
- `src/team/secure-fs.test.ts` (NEW)

**Constraints**: ONLY this module imports `node:fs/promises` for team-mode user I/O (with the exception of `file-resolver.ts`). Path comparison MUST use `path.sep` to avoid prefix collisions. Symlink-following is the OS default.

```
You are a senior Node.js engineer.

TASK
Implement src/team/secure-fs.ts.

REQUIREMENTS
1. Constants imported from './paths.ts': WORKSPACE_ROOT, BASE_DIR.

2. Class SecureFsViolationError extends Error:
   constructor takes { userId, attemptedPath, resolvedPath, operation };
   assigns them as instance fields.
   message = `secure-fs ${operation} violation for ${userId}: ${attemptedPath}`.

3. validatePath(userId: string, target: string): string
   - userId regex check (/^[A-Za-z0-9_\-]+$/).
   - resolved = path.resolve(target).
   - userRoot = path.resolve(WORKSPACE_ROOT, 'users', `user_${userId}`).
   - if (!resolved.startsWith(userRoot + path.sep) && resolved !== userRoot): throw.
   - return resolved.

4. validateWritePath(userId: string, target: string): string
   - resolved = validatePath(userId, target).
   - baseRoot = path.resolve(BASE_DIR).
   - if (resolved === baseRoot || resolved.startsWith(baseRoot + path.sep)):
     throw with operation='write-to-base'.
   - return resolved.

5. secureRead(userId: string, target: string): Promise<string>
   - resolved = validatePath(userId, target).
   - return await fs.readFile(resolved, 'utf8').

6. secureWrite(userId: string, target: string, data: string|Buffer,
   opts: { append?: boolean } = {}): Promise<void>
   - resolved = validateWritePath(userId, target).
   - mkdir parent recursive.
   - if opts.append: fs.appendFile, else fs.writeFile.
   - Return void.

7. On every SecureFsViolationError: log to OpenClaw's existing logger AND, if a per-user
   logsDir is reachable, write a JSONL line to <logsDir>/violations.log:
       { ts, userId, op, attempted, resolved }

8. Also export validatePathSync and validateWritePathSync (pure CPU; no I/O) for use by
   the plugin loader's sync fs proxy.

CONSTRAINTS
- ONLY this module imports node:fs/promises for team-mode user I/O (file-resolver.ts exempt).
- Path comparison MUST use path.sep to avoid prefix collisions ('user_1' vs 'user_10').
- Symlink-following is the OS default.

OUTPUT
- src/team/secure-fs.ts (full file)
- src/team/secure-fs.test.ts with all four boundary classes:
  - cross-user read
  - parent traversal (..)
  - base/ write attempt
  - normal read/write (happy path)
```

---

### Story 5.2 — Replace Bare `fs.*` Calls in Team-Mode Code Paths

**Files to create / modify**:
- `src/team/channel-router.ts` (audit + replace)
- `src/agents/agent-command.ts` (audit team branch only)
- `src/team/memory.ts` (audit + replace)
- `.eslintrc` (add lint rule)

**Constraints**: Do not touch `src/agents/*` outside the team branch. Do not touch `src/channels/*`. ESLint rule must allow `secure-fs.ts` and `file-resolver.ts`.

```
You are a senior Node.js engineer doing a targeted refactor.

TASK
Replace direct fs calls with secureRead/secureWrite in team-mode code paths.

REQUIREMENTS
1. Search for `from 'node:fs'` and `from 'fs'` and
   `fs.readFile|writeFile|appendFile|createWriteStream` inside src/team/ and
   the team-branch sections of src/agents/agent-command.ts.
2. For every match that operates on a per-user path:
   - Replace with secureRead(userId, ...) or secureWrite(userId, ...).
   - For createWriteStream (upload streaming): call validateWritePath(userId, dest)
     first; then create the stream against the resolved path.
3. file-resolver.ts is exempt EXCEPT: every fs.copyFile / fs.writeFile / fs.mkdir / fs.rm
   should be preceded by validateWritePath(userId, target). For mkdir of the user root,
   validate against itself (call validatePath(userId, userDir) — the resolved path equals
   userRoot, which passes).
4. Add a lint rule in .eslintrc banning bare fs usage in src/team/ EXCEPT file-resolver.ts
   and secure-fs.ts:
       "no-restricted-imports": ["error", {
         paths: [{ name: "fs", message: "Use secureRead/secureWrite instead." },
                 { name: "node:fs", message: "Use secureRead/secureWrite instead." }]
       }]
   Use file path overrides to exempt file-resolver.ts and secure-fs.ts.

CONSTRAINTS
- Do not touch src/agents/* outside the team branch.
- Do not touch src/channels/*.
- ESLint rule must allow secure-fs.ts and file-resolver.ts.

OUTPUT
- A patch list (files + diffs) for each changed file.
- The updated .eslintrc.
```

---

### Story 5.3 — `validatePathSync` for Plugin Loader Hot-Path

**Files to create / modify**:
- `src/team/secure-fs.ts` (PATCH, add sync variants)

**Constraints**: Refactor `secureRead`/`secureWrite` to call the sync validators internally to keep one source of truth.

```
You are a senior Node.js engineer.

TASK
Add validatePathSync and validateWritePathSync to src/team/secure-fs.ts.

REQUIREMENTS
1. Pure CPU; no I/O.
2. Same logic as the async versions.
3. Throws SecureFsViolationError on failure.
4. Refactor the existing validatePath/validateWritePath to call these sync helpers
   internally (so logic lives in exactly one place).
5. Export validatePathSync and validateWritePathSync so the plugin loader's sync fs
   proxy can call them.

CONSTRAINTS
- Refactor secureRead/secureWrite to call the sync validators internally.

OUTPUT
- Patch to src/team/secure-fs.ts.
```

---

### Story 5.4 — Encrypt Channel Secrets at Rest

**Files to create / modify**:
- `src/team/secrets-crypto.ts` (NEW, ~60 lines)
- `src/team/team-routes.ts` (apply encrypt on write)
- `src/team/channel-router.ts` (apply decrypt on read)

**Constraints**: Use Node `'crypto'` module — no external deps. Reject startup when team mode is on and `OPENCLAW_COOKIE_SECRET` is missing or < 32 chars. Never log secret blobs.

```
You are a senior Node.js engineer.

TASK
Implement src/team/secrets-crypto.ts and apply encryption to channel-secret storage.

REQUIREMENTS
1. Use Node 'crypto' module — no external deps.

2. KEY derivation:
   const masterSecret = process.env.OPENCLAW_COOKIE_SECRET;
   if (!masterSecret || masterSecret.length < 32) {
     throw new Error('OPENCLAW_COOKIE_SECRET must be set and >= 32 chars in team mode');
   }
   key = crypto.hkdfSync('sha256',
     Buffer.from(masterSecret),
     Buffer.alloc(0),
     Buffer.from('openclaw-team-secret-v1'),
     32
   );

3. encryptSecret(plaintext: string): string
   - iv = crypto.randomBytes(12)
   - cipher = aes-256-gcm
   - return `v1.${ivHex}.${tagHex}.${ctBase64}`

4. decryptSecret(blob: string): string
   - parse 4 parts split by '.'; if version !== 'v1' throw.
   - Verify GCM auth tag; on mismatch throw 'secret integrity failed'.
   - Return plaintext.

5. Wrap channel-secret create/read paths in src/team/team-routes.ts and
   src/team/channel-router.ts:
   - On write: JSON.stringify(credentialsObj) → encryptSecret → store blob.
   - On read: decryptSecret(blob) → JSON.parse → use credentials.

6. Never log secret blobs; never include them in error messages.

CONSTRAINTS
- Reject startup when team mode is on and OPENCLAW_COOKIE_SECRET is missing.
- Old plaintext rows (no 'v1.' prefix) → refuse to read (throw); document migration step.

OUTPUT
- src/team/secrets-crypto.ts (full file)
- Diffs in team-routes.ts / channel-router.ts where secrets are stored/read.
```

---

## EPIC 6 — Plugin Safety

---

### Story 6.1 — Implement `assertPluginTeamSafe(manifest)` in `plugin-guard.ts`

**Files to create / modify**:
- `src/team/plugin-guard.ts` (NEW, ~30 lines)

**Constraints**: This module imports nothing besides Node built-ins — no DB, no fs. Manifest schema is: any object with optional `team_safe: boolean` and `name: string`.

```
You are a senior Node.js engineer.

TASK
Create src/team/plugin-guard.ts.

REQUIREMENTS
1. Export class PluginNotTeamSafeError extends Error.

2. Export function assertPluginTeamSafe(manifestPath: string, manifest: unknown): void
   - If OPENCLAW_TEAM_MODE !== '1' → return (no-op).
   - Cast manifest to any; check `(manifest as any).team_safe === true`.
   - If not strictly true → throw PluginNotTeamSafeError with a message that names the
     plugin (manifest.name) and the manifest file path.

3. Export helper isPluginTeamSafe(manifest: unknown): boolean — returns false on
   missing/false/non-boolean flag, true only on strict === true.

CONSTRAINTS
- This module imports nothing besides Node built-ins; no DB, no fs.
- Manifest schema is: any object with optional `team_safe: boolean` and `name: string`.
- team_safe check MUST be strict === true, not truthy.

OUTPUT
- src/team/plugin-guard.ts (full file)
```

---

### Story 6.2 — Patch `plugin-loader.ts` to Call the Guard

**Files to create / modify**:
- `src/plugins/plugin-loader.ts` (PATCH, +30 lines)

**Constraints**: Do not change plugin entry-point invocation logic. Skip-and-continue on `PluginNotTeamSafeError`; abort-only on other errors. Boot summary log required.

```
You are a senior Node.js engineer.

TASK
Patch src/plugins/plugin-loader.ts (or whichever file loads plugin manifests —
find it via grep for 'openclaw.plugin.json') to call assertPluginTeamSafe.

REQUIREMENTS
1. Find the function that reads a plugin's manifest and registers/imports it.
2. Right after the manifest is parsed (before any plugin entry-point is invoked):
       import { assertPluginTeamSafe } from '../team/plugin-guard';
       assertPluginTeamSafe(manifestPath, manifest);
3. Wrap in try/catch at the loader-orchestration level: a single failed plugin must NOT
   crash the whole boot.
   - Catch PluginNotTeamSafeError → log "[team] plugin skipped (not team_safe):
     <name>" and continue to next plugin.
   - Other errors → log + rethrow (real crash still surfaces).
4. After all plugins are processed, emit a summary log:
   `[team] plugins loaded: ${loaded}, skipped (not team_safe): ${skipped},
    names=[${skippedNames.join(', ')}]`

CONSTRAINTS
- Do not change plugin entry-point invocation logic.
- Skip-and-continue on PluginNotTeamSafeError; abort-only on other errors.

OUTPUT
- The patch (unified diff) to plugin-loader.ts.
```

---

### Story 6.3 — Inject `secureRead`/`secureWrite`-Backed `fs` Proxy into Plugin Context

**Files to create / modify**:
- `src/team/plugin-fs-proxy.ts` (NEW, ~40 lines)
- `src/plugins/plugin-loader.ts` (PATCH, +10 lines on top of Story 6.2)

**Constraints**: The proxy MUST validate every call with `secureRead`/`secureWrite`/`validatePath` — never bypass. Document in comments that plugins importing `'node:fs'` directly are NOT sandboxed.

```
You are a senior Node.js engineer.

TASK
Create src/team/plugin-fs-proxy.ts and inject it into plugin call ctx.

REQUIREMENTS
1. src/team/plugin-fs-proxy.ts:
   export function createFsProxy(team: TeamCtx) returning an object with:
   - readFile(p: string, enc?: string)  → secureRead(team.userId, p)
   - writeFile(p: string, data: string) → secureWrite(team.userId, p, data)
   - appendFile(p: string, data: string)→ secureWrite(team.userId, p, data, {append: true})
   - readdir(p: string)                 → fs.readdir(validatePath(team.userId, p))
   - stat(p: string)                    → fs.stat(validatePath(team.userId, p))
   - mkdir(p: string, opts?: object)    → validateWritePath; fs.mkdir(resolved, opts)
   - rm(p: string, opts?: object)       → validateWritePath; fs.rm(resolved, opts)
   All methods async.

2. Plugin loader patch:
   - When team mode is on, when invoking a plugin entry-point per-call, pass:
       pluginCtx.fs = createFsProxy(team);
   - When team mode is off, pluginCtx.fs remains undefined (existing behavior).

3. Add a code comment stating:
   // NOTE: Plugins that import 'node:fs' directly bypass this proxy.
   // team_safe: true in the manifest declares the plugin author has verified
   // all file I/O goes through ctx.fs, not direct node:fs imports.

CONSTRAINTS
- The proxy MUST validate every call through secureRead/secureWrite/validatePath.
- Never bypass the validation.
- All proxy methods async.

OUTPUT
- src/team/plugin-fs-proxy.ts (full file)
- The plugin-loader.ts patch (diff).
```

---

## EPIC 7 — Admin APIs & UI (`/login`, `/team`)

---

### Story 7.1 — `/login` HTML Page

**Files to create / modify**:
- `src/team/web/login.html` (NEW, ~60 lines)
- `src/team/auth-routes.ts` (PATCH, add GET `/login` handler)

**Constraints**: No external scripts. No CDN. No build step. HTML must be < 4 KB. CSP header required.

```
You are a senior full-stack Node.js engineer.

TASK
Create src/team/web/login.html and a GET /login route in src/team/auth-routes.ts.

REQUIREMENTS
1. login.html:
   - Single <form> with email input, password input, hidden csrf input.
   - Minimal inline CSS (dark/light auto-detect via prefers-color-scheme).
   - Inline JS onsubmit handler:
       fetch('/auth/login', {
         method: 'POST',
         body: JSON.stringify({ email, password }),
         headers: { 'Content-Type': 'application/json', 'X-Csrf': csrf },
         credentials: 'same-origin'
       }).then(r => r.ok ? (window.location='/team') : showError('Invalid credentials'))
   - csrf value injected by server (replaced from __CSRF__ placeholder).
   - File size < 4 KB total.

2. GET /login route in auth-routes.ts:
   - Generate or read the oc_csrf cookie (16-byte random hex). Set if missing.
   - Read login.html from disk (cache after first read).
   - Replace __CSRF__ placeholder with the cookie value.
   - Return text/html with Content-Security-Policy:
     `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'`

CONSTRAINTS
- No external scripts, fonts, or CDN resources.
- No build step.
- HTML < 4 KB.

OUTPUT
- src/team/web/login.html (full file)
- The GET /login handler added to src/team/auth-routes.ts.
```

---

### Story 7.2 — `/team` HTML Dashboard Page

**Files to create / modify**:
- `src/team/web/team.html` (NEW, ~150 lines)
- `src/team/team-routes.ts` (GET `/team` handler)

**Constraints**: No frontend frameworks. No template engine; simple regex replace on placeholders. Forms use POST with JSON. Admin-only sections must be hidden client-side AND blocked server-side.

```
You are a senior full-stack engineer.

TASK
Create src/team/web/team.html (~150 lines) and the GET /team route handler in
src/team/team-routes.ts.

REQUIREMENTS
1. team.html structure:
   <header>: "Hi {{user.name}}" + Logout button (POST /auth/logout).
   <section id="users">: user list (admin only) + invite form (email + isAdmin checkbox).
   <section id="tokens">: list (name, last_used_at) + create form + copy-on-create banner.
   <section id="identities">: list claimed phones/chat-ids + "Link Telegram" button
     (POST /team/identities/claim {"channel":"telegram"} → shows code + TTL countdown) +
     "Link WhatsApp" button.
   <section id="workspaces">: (admin only) list workspaces + "Edit channel" form per
     workspace (Telegram bot token + webhook secret, WhatsApp credentials).

2. Inline JS:
   - All fetch calls use X-Csrf from the oc_csrf cookie value.
   - credentials: 'same-origin' on all fetches.
   - Admin-only sections: `if (!{{user.isAdmin}}) { elem.remove(); }`

3. Server route GET /team in team-routes.ts:
   - resolveTeamAuth → redirect to /login if null.
   - Inject {{user.name}}, {{user.email}}, {{user.isAdmin}} via simple string replace.
   - Return text/html with CSP header.

4. HTML output < 5 KB.

CONSTRAINTS
- No frontend frameworks.
- No template engine — simple string replace.
- Admin sections enforced server-side (endpoint checks isAdmin) AND hidden client-side.

OUTPUT
- src/team/web/team.html (full file)
- The GET /team handler in src/team/team-routes.ts.
```

---

### Story 7.3 — Admin User Management Endpoints

**Files to create / modify**:
- `src/team/team-routes.ts` (extends)
- `src/team/auth-routes.ts` (add `POST /auth/accept`)

**Constraints**: Admin can NEVER disable themselves → 400. Invite tokens expire after 7 days. Only one outstanding invite per email — subsequent invites invalidate prior tokens.

```
You are a senior Node.js engineer.

TASK
Implement four admin user-management routes + one public accept route.

REQUIREMENTS
1. All four admin routes require ctx.isAdmin === true; else 403.

2. GET /team/users:
   SELECT id, email, name, is_admin, status, created_at, last_seen_at
   FROM users ORDER BY created_at.

3. POST /team/users:
   Body: { email: string, isAdmin?: boolean, name?: string }
   - Validate email format. Reject if user with that email already has status='active'.
   - createUser(email, passwordHash='!invite!', name, isAdmin=false, status='active').
   - createChannelClaim(userId, 'invite', ttlSeconds=7*24*3600) → { code, expiresAt }.
   - Return { user: {...}, inviteLink: `${OPENCLAW_PUBLIC_BASE_URL}/auth/accept?token=${code}` }.
   - Do not send email.

4. DELETE /team/users/:id:
   - Refuse if id === ctx.userId → 400 "Admin cannot disable themselves".
   - disableUser(id). Return 204.

5. POST /team/users/:id/enable:
   - Set user status='active'. Return 200.

6. POST /auth/accept (in auth-routes.ts — public, no auth required):
   Body: { token: string, password: string }
   - consumeChannelClaim(token) — channel must be 'invite'.
   - If null → 400 "Invalid or expired invite link".
   - Validate password length >= 12.
   - hash = argon2.hash(password, { type: argon2.argon2id }).
   - UPDATE users SET password_hash=hash, last_seen_at=now.
   - createSession → Set-Cookie.
   - Return 200 with user JSON (auto-logged-in).

CONSTRAINTS
- Admin cannot disable themselves.
- Invite tokens expire after 7 days (604800 seconds).
- Single-use tokens via consumeChannelClaim atomicity.

OUTPUT
- All five routes in their respective files (diff or full).
```

---

### Story 7.4 — Bootstrap Admin From Env on First Boot

**Files to create / modify**:
- `src/team/index.ts` (PATCH, add bootstrap block)

**Constraints**: Never log the password. Idempotent — subsequent boots skip silently. Validate password length >= 12 chars.

```
You are a senior Node.js engineer.

TASK
Add bootstrap admin seeding to src/team/index.ts initTeamModule().

REQUIREMENTS
1. After migrate(db) and bootstrapBaseDir(), check SELECT COUNT(*) FROM users.
2. If 0 AND OPENCLAW_TEAM_ADMIN_EMAIL + OPENCLAW_TEAM_ADMIN_PASSWORD env are set:
   - Validate email format; if invalid → log warning, skip.
   - Validate password length >= 12; if not → log warning, skip.
   - hash = await argon2.hash(process.env.OPENCLAW_TEAM_ADMIN_PASSWORD,
     { type: argon2.argon2id }).
   - createUser({ email, passwordHash: hash, isAdmin: true, status: 'active' }).
   - delete process.env.OPENCLAW_TEAM_ADMIN_PASSWORD;
   - Log: `[team] bootstrap admin seeded: ${email}`.
3. If users table is non-empty: do nothing (no log).
4. If env not set on first boot (empty table): log ONE warning:
   `[team] WARNING: team mode is on but no admin exists.
    Set OPENCLAW_TEAM_ADMIN_EMAIL + OPENCLAW_TEAM_ADMIN_PASSWORD and restart.`

CONSTRAINTS
- Never log the password.
- Idempotent: subsequent boots skip silently.
- Password validated for minimum length.

OUTPUT
- The added bootstrap block in initTeamModule().
```

---

### Story 7.5 — CLI Password-Reset Command

**Files to create / modify**:
- `src/team/cli.ts` (NEW, ~50 lines)
- `package.json` (PATCH, add bin script)

**Constraints**: No new deps. Reuse `better-sqlite3` + the existing CLI plumbing. Token must consume cleanly via `/auth/reset`.

```
You are a senior Node.js engineer.

TASK
Add a CLI subcommand `team:reset-password <email>`.

REQUIREMENTS
1. Find the existing OpenClaw CLI entry (likely src/cli/* or bin/*). Add a subcommand that:
   - Takes one positional arg: email.
   - Imports src/team/db to open the DB.
   - findUserByEmail(email); if missing → exit 1 with "no such user: <email>".
   - createChannelClaim(userId, 'reset', ttlSeconds=3600) → { code, expiresAt }.
   - Prints to stdout:
       Reset link (valid until <expiresAt>):
         <OPENCLAW_PUBLIC_BASE_URL ?? 'http://localhost:8080'>/auth/reset?token=<code>
   - Exit 0.
2. If OPENCLAW_TEAM_MODE !== '1': print "team mode disabled — set OPENCLAW_TEAM_MODE=1"
   and exit 1.
3. Document: "Anyone with shell access on the host can issue a reset. This is by design
   for a small-team deployment."

CONSTRAINTS
- No new deps. Reuse better-sqlite3.
- Token must consume cleanly via /auth/reset.
- All sessions for the user are deleted after /auth/reset succeeds (done in Story 1.5).

OUTPUT
- src/team/cli.ts (full file)
- The bin/scripts entry in package.json.
```

---

### Story 7.6 — Admin Workspace + Channel Configuration UI

**Files to create / modify**:
- `src/team/db-migrate.ts` (PATCH, bump to v2 with `workspace_channels` table)
- `src/team/team-routes.ts` (extends, workspace admin routes)

**Constraints**: Never echo the stored secrets back to the UI on subsequent reads (show "configured" / "not configured" only). All write paths require admin. Encrypt using Story 5.4's AES-GCM scheme.

```
You are a senior Node.js engineer.

TASK
Implement workspace and channel-config admin endpoints.

REQUIREMENTS
1. db-migrate.ts: bump to v2; add workspace_channels table inside `if (v < 2)` block:
   CREATE TABLE workspace_channels (
     workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     channel      TEXT NOT NULL,
     config_encrypted TEXT NOT NULL,
     updated_at   TEXT NOT NULL,
     PRIMARY KEY (workspace_id, channel)
   );
   Also add auto_create_guest_users column to workspaces if not present.

2. Routes (all admin-only):
   GET /team/workspaces
     → list all (id, name, auto_create_guest_users boolean).
   POST /team/workspaces { name, autoCreateGuestUsers? }
     → insert; return { id, name }.
   DELETE /team/workspaces/:id
     → cascade delete workspace_channels.
   PUT /team/workspaces/:id/channels/telegram { botToken, webhookSecret? }:
     - If webhookSecret missing, generate crypto.randomBytes(24).toString('hex').
     - config = JSON.stringify({ botToken, webhookSecret }).
     - blob = encryptSecret(config).
     - upsert workspace_channels (workspace_id, 'telegram', blob, now).
     - Return { webhookSecret, webhookUrl: `${PUBLIC_BASE_URL}/webhooks/telegram/${id}` }.
   PUT /team/workspaces/:id/channels/whatsapp { appSecret, phoneNumberId, accessToken,
     verifyToken }:
     - JSON.stringify + encrypt + upsert.
     - Return { webhookUrl: `${PUBLIC_BASE_URL}/webhooks/whatsapp/${id}`, verifyToken }.

3. Read helpers for channel-router.ts:
   getWorkspaceChannelConfig(workspaceId, channel):
     → SELECT config_encrypted FROM workspace_channels WHERE workspace_id=? AND channel=?
     → decryptSecret → JSON.parse → typed config object.

CONSTRAINTS
- Never echo stored secrets to the UI on reads.
- All write paths require isAdmin.
- Use the AES-GCM encrypt/decrypt from src/team/secrets-crypto.ts.

OUTPUT
- db-migrate.ts patch (v2 block).
- The five workspace routes in src/team/team-routes.ts.
- getWorkspaceChannelConfig helper used by channel-router.ts.
```

---

## EPIC 8 — Deployment & Configuration

---

### Story 8.1 — Update `package.json` with New Dependencies and Scripts

**Files to create / modify**:
- `package.json` (PATCH)

**Constraints**: Don't bump unrelated deps. Keep lockfile delta minimal.

```
You are a senior Node.js engineer.

TASK
Update package.json for team mode dependencies.

REQUIREMENTS
1. Add to "dependencies":
   - "better-sqlite3": "^11.0.0"
   - "argon2": "^0.40.0"

2. If scripts.openclaw exists (the existing CLI), do NOT replace it. Instead, route the
   team subcommand through it:
   - Modify src/cli/* to recognize `team:reset-password <email>` and call into
     src/team/cli.ts.

3. Bump engines.node to >=22.5 if not already (we use Node fs.promises, crypto.hkdfSync —
   both available since Node 22.x).

4. Add a scripts entry for the reset command:
   "team:reset-password": "node ./dist/team/cli.js reset-password"

5. After install, document in a code comment: "Run `pnpm rebuild better-sqlite3` if
   the prebuild download failed."

CONSTRAINTS
- Don't bump unrelated deps.
- Keep lockfile delta minimal.

NOTE FOR README: "Native deps: better-sqlite3 ships prebuilds for linux-x64-glibc,
darwin-x64, darwin-arm64, win32-x64. If your runtime is musl/Alpine: install
build-essential and python3 in the Dockerfile."

OUTPUT
- The updated package.json.
```

---

### Story 8.2 — Dockerfile Updates for Native Deps

**Files to create / modify**:
- `Dockerfile` (PATCH)

**Constraints**: Multi-stage build (already standard in OpenClaw). Final image must not contain compilers. Don't change the base image major version.

```
You are a senior Docker/Node.js engineer.

TASK
Patch the OpenClaw Dockerfile to support better-sqlite3 native builds.

REQUIREMENTS
1. Identify the base image (likely node:22-alpine or similar). Use matching package manager.
2. In the build stage, install build prerequisites BEFORE pnpm install:
   - Alpine: apk add --no-cache python3 make g++
   - Debian: apt-get install -y build-essential python3
3. Run: pnpm install --frozen-lockfile
4. Remove build prerequisites after install:
   - Alpine: apk del python3 make g++
   - Debian: apt-get remove -y build-essential && apt-get autoremove -y
5. The runtime stage copies node_modules from the build stage; runtime image needs NO
   build tools.
6. Add a healthcheck:
   HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
   CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CONSTRAINTS
- Multi-stage build.
- Final image must not contain compilers.
- Don't change the base image major version.
- Image size delta vs. previous build should be < +50 MB.

OUTPUT
- The patched Dockerfile (full file or unified diff).
```

---

### Story 8.3 — `docker-compose.yml` and `Caddyfile`

**Files to create / modify**:
- `docker-compose.yml` (NEW or UPDATE)
- `Caddyfile` (NEW)
- `.env.example` (NEW)

**Constraints**: No exposed Postgres, Redis, or other ports. `caddy-data` volume persists certs. `openclaw-data` is the sole place app state lives.

```
You are a senior DevOps engineer.

TASK
Create deployment files: docker-compose.yml, Caddyfile, .env.example.

REQUIREMENTS
1. docker-compose.yml at repo root:
   version: '3.8'
   services:
     caddy:
       image: caddy:2
       ports: ['80:80', '443:443']
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy-data:/data
       restart: unless-stopped
     openclaw:
       image: ghcr.io/openclaw/openclaw:latest
       environment:
         OPENCLAW_TEAM_MODE: '1'
         OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}
         OPENCLAW_TEAM_ADMIN_EMAIL: ${OPENCLAW_TEAM_ADMIN_EMAIL}
         OPENCLAW_TEAM_ADMIN_PASSWORD: ${OPENCLAW_TEAM_ADMIN_PASSWORD}
         OPENCLAW_PUBLIC_BASE_URL: ${OPENCLAW_PUBLIC_BASE_URL}
         OPENCLAW_COOKIE_SECRET: ${OPENCLAW_COOKIE_SECRET}
       volumes:
         - openclaw-data:/root/.openclaw
       expose: ['8080']
       restart: unless-stopped
   volumes:
     caddy-data:
     openclaw-data:

2. Caddyfile:
   {$DOMAIN} {
     reverse_proxy openclaw:8080
     encode gzip
     header {
       Strict-Transport-Security "max-age=31536000; includeSubDomains"
       X-Content-Type-Options nosniff
       Referrer-Policy strict-origin-when-cross-origin
     }
   }

3. .env.example:
   DOMAIN=oc.example.com
   OPENCLAW_GATEWAY_TOKEN=change-me-32-char-random
   OPENCLAW_TEAM_ADMIN_EMAIL=admin@example.com
   OPENCLAW_TEAM_ADMIN_PASSWORD=ChangeMe-At-Least-12-Chars
   OPENCLAW_PUBLIC_BASE_URL=https://oc.example.com
   OPENCLAW_COOKIE_SECRET=at-least-32-random-bytes-hex-encoded

4. Each env var in .env.example must have a one-line comment explaining it.

CONSTRAINTS
- No exposed Postgres, Redis, or other ports.
- caddy-data volume persists certs across restarts.
- openclaw-data is the SOLE place app state lives.

OUTPUT
- docker-compose.yml (full)
- Caddyfile (full)
- .env.example (full)
```

---

### Story 8.4 — Backup Cron + Restore Documentation

**Files to create / modify**:
- `docs/team-backup.md` (NEW, ~40 lines)

**Constraints**: No new tooling required for the basic flow. Operator-friendly — assume small-team ops, not a full DevOps team.

```
You are a senior DevOps engineer.

TASK
Write docs/team-backup.md covering daily backup + tested restore procedure.

REQUIREMENTS
1. Sections:
   - "What to back up": team.sqlite + workspace/ directory are the two critical paths.
   - "Local copy via cron": exact crontab lines.
   - "Off-host sync": rsync, S3 sync (aws s3 sync), or restic.
   - "Restore procedure": stop → replace volume → start (step-by-step).
   - "Test-restore exercise": monthly test drill.

2. Crontab:
   # /etc/cron.d/openclaw-backup
   0 3 * * * root docker exec openclaw \
     sh -c 'cp -a /root/.openclaw/team.sqlite \
       /root/.openclaw/backups/team-$(date +\%F).sqlite \
       && cp -a /root/.openclaw/workspace \
         /root/.openclaw/backups/workspace-$(date +\%F)'
   0 4 * * * root rsync -a \
     /var/lib/docker/volumes/openclaw-data/_data/ /backups/openclaw/

3. Use cp of the WAL+main file (safe because of SQLite WAL atomicity; process can keep
   running during the copy).

4. State RTO/RPO: < 5 min RTO with manual restore from local copy, RPO = 24h with daily
   cron.

CONSTRAINTS
- No new tooling required.
- Operator-friendly.

OUTPUT
- docs/team-backup.md (full content, ~40 lines).
```

---

### Story 8.5 — Env-Var Documentation in `README.md` Section

**Files to create / modify**:
- `README.md` (PATCH, add Team Mode section near the end)

**Constraints**: Don't restructure the existing README — append the section near the end. Don't extensively repeat content from `/kalim/` — link instead. ~150 lines, plain markdown.

```
You are a senior technical writer / engineer.

TASK
Add a "Team Mode (multi-user with WhatsApp/Telegram)" section to README.md.

REQUIREMENTS
1. One-paragraph intro: what team mode is (bolt-on ~1,105-line overlay; activates with
   OPENCLAW_TEAM_MODE=1; backwards-compatible).

2. "Activation" subsection:
   OPENCLAW_TEAM_MODE=1
   OPENCLAW_TEAM_ADMIN_EMAIL=admin@example.com
   OPENCLAW_TEAM_ADMIN_PASSWORD=ChangeMe-At-Least-12-Chars

3. "Environment Variables" table — every var from the design, with default and purpose:
   OPENCLAW_TEAM_MODE, OPENCLAW_GATEWAY_TOKEN, OPENCLAW_TEAM_ADMIN_EMAIL,
   OPENCLAW_TEAM_ADMIN_PASSWORD, OPENCLAW_PUBLIC_BASE_URL, OPENCLAW_TEAM_ALLOW_SIGNUP,
   OPENCLAW_COOKIE_SECRET, OPENCLAW_TEAM_DATABASE_URL, OPENCLAW_HOME,
   OPENCLAW_TEAM_MAX_UPLOAD_BYTES.

4. "Quick start" subsection:
   1. Copy .env.example → .env; fill values.
   2. docker compose up -d
   3. Visit https://<DOMAIN>/login
   4. Invite teammates from /team
   5. Configure Telegram/WhatsApp bots in /team → Workspaces
   6. Each user clicks "Link Telegram" or "Link WhatsApp" and sends the claim code.

5. "Backward compatibility" subsection: with OPENCLAW_TEAM_MODE unset, behavior is
   byte-identical to pre-team OpenClaw; OPENCLAW_GATEWAY_TOKEN keeps working in both modes.

6. "Backup & Restore" link to docs/team-backup.md.

7. "When you outgrow this" subsection: pointer to /kalim/enterprise-plan/ for the full
   multi-tenant design (>10 users, RBAC, Postgres, JWT, etc.).

CONSTRAINTS
- Don't restructure existing README — append the section.
- ~150 lines, plain markdown.

OUTPUT
- The full section markdown (ready to paste at the end of README.md).
```

---

*End of consolidated AI coding prompts. 41 stories across 8 epics. All prompts are copy-paste ready.*
