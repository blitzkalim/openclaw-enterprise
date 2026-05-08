# EPIC 1 — Authentication & Identity Layer

> Source: `/kalim/enterprise-simple-plan/04-auth-design/auth.md`, `07-minimal-db-changes/db.md`, `02-extension-strategy/strategy.md`.

---

## STORY 1.1 — Bootstrap `src/team/index.ts` and Activate Team Mode

### 🎯 Description
Create the entry module that runs at process start when `OPENCLAW_TEAM_MODE=1`. It opens the SQLite DB, runs migrations, registers all `/auth/*`, `/team/*`, and `/webhooks/*` routes, and seeds the bootstrap admin if the `users` table is empty. This is the single import point patched into `src/index.ts`.

Comes from: `02-extension-strategy/strategy.md` "Activation Switch" + `09-deployment-model/deployment.md` first-run.

### ⚙️ Implementation Details

**Files**:
- `src/team/index.ts` (NEW, ~60 lines)
- `src/index.ts` (PATCH, +5 lines)

**Logic**:
1. Read env: `OPENCLAW_TEAM_MODE`, `OPENCLAW_HOME`, `OPENCLAW_TEAM_ADMIN_EMAIL`, `OPENCLAW_TEAM_ADMIN_PASSWORD`.
2. Open `~/.openclaw/team.sqlite` via `better-sqlite3`.
3. Call `migrate(db)` from `src/team/db-migrate.ts`.
4. If `users` table empty AND admin envs set → create admin user (Argon2id-hashed password).
5. Export: `initTeamModule()`, `db`, `resolveTeamAuth()`, `mountTeamRoutes(app)`.

**Dependencies**: `better-sqlite3`, `argon2`.

**Flow**:
```
process start
  → src/index.ts
     → if OPENCLAW_TEAM_MODE === '1': initTeamModule()
        → openDb()
        → migrate(db)
        → seedBootstrapAdmin()
        → mountTeamRoutes(app)
        → done — fall back to gateway boot
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer working in the OpenClaw codebase.

CONTEXT
- This is the OpenClaw repo at C:\Users\qures\Downloads\nabi-app-git\openclaw-enterprise.
- The design lives at /kalim/enterprise-simple-plan/.
- Existing entry: src/index.ts boots the OpenClaw gateway. Keep that intact.

TASK
Create src/team/index.ts that exports an async initTeamModule() function and patch src/index.ts to call it conditionally.

REQUIREMENTS
1. src/team/index.ts:
   - Import better-sqlite3 and open `${OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`}/team.sqlite`.
   - Import migrate from './db-migrate' and call migrate(db) immediately after opening.
   - If `SELECT COUNT(*) FROM users` is 0 AND OPENCLAW_TEAM_ADMIN_EMAIL & OPENCLAW_TEAM_ADMIN_PASSWORD are set:
     - Hash password with argon2.hash(pwd, { type: argon2.argon2id }).
     - INSERT a user row with id=randomUUID(), email, password_hash, is_admin=1, status='active', created_at=ISO now.
   - Export named: db, initTeamModule, resolveTeamAuth (re-export from auth-middleware), mountTeamRoutes (which calls auth-routes/team-routes/channel-router mount fns).
   - Top of file: a no-op when OPENCLAW_TEAM_MODE !== '1'. Make initTeamModule throw if called when team mode is off.
2. src/index.ts:
   - Add: `if (process.env.OPENCLAW_TEAM_MODE === '1') { await import('./team').then(m => m.initTeamModule()); }`
   - Place it AFTER existing gateway init but BEFORE the server actually starts listening, so the routes are mounted.

CONSTRAINTS
- Do not change existing OpenClaw boot when OPENCLAW_TEAM_MODE is unset.
- Use TypeScript ESM imports (matches the codebase style).
- Use process.env.HOME on Linux/Mac; respect process.env.USERPROFILE on Windows for OPENCLAW_HOME default.
- Keep file size under 80 lines.

OUTPUT
- src/team/index.ts (full file)
- The exact 5-line patch to src/index.ts (with the surrounding 3 lines of context)
- No prose; code only.
```

### 🧪 Testing Instructions

1. Set `OPENCLAW_TEAM_MODE=1`, `OPENCLAW_TEAM_ADMIN_EMAIL=admin@local`, `OPENCLAW_TEAM_ADMIN_PASSWORD=temp-pass-1234`.
2. Delete any existing `~/.openclaw/team.sqlite`.
3. Run `pnpm openclaw start`.
4. Confirm `~/.openclaw/team.sqlite` is created.
5. `sqlite3 ~/.openclaw/team.sqlite "SELECT email, is_admin FROM users;"` → returns one row.
6. Stop, unset `OPENCLAW_TEAM_MODE`, restart → process must boot exactly as today (no DB touched, no routes mounted).

### 📥 Example Input / Environment

```bash
export OPENCLAW_TEAM_MODE=1
export OPENCLAW_TEAM_ADMIN_EMAIL="amit@example.com"
export OPENCLAW_TEAM_ADMIN_PASSWORD="ChangeMe-2026"
export OPENCLAW_GATEWAY_TOKEN="legacy-gateway-token-stays-working"
pnpm openclaw start
```

### 📤 Expected Output

```
[openclaw] gateway listening on :8080
[team] team.sqlite migrated to v1
[team] bootstrap admin seeded: amit@example.com
[team] routes mounted: /auth/*, /team/*, /webhooks/*
```

### ✅ Acceptance Criteria
- [ ] `team.sqlite` is created at expected path.
- [ ] Bootstrap admin exists with `is_admin=1` and a working Argon2id hash.
- [ ] Re-running with the same admin envs does **not** create a duplicate user (migration idempotent on second boot).
- [ ] When `OPENCLAW_TEAM_MODE` is unset, no SQLite file is created and no team routes are registered.
- [ ] Existing OpenClaw startup logs and gateway port are unchanged.

---

## STORY 1.2 — Implement SQLite Schema & Migrate Function

### 🎯 Description
Create `src/team/db.ts` (the singleton `better-sqlite3` handle and prepared-statement repos) and `src/team/db-migrate.ts` (idempotent schema bootstrap using the `user_version` PRAGMA). Implements the schema in `07-minimal-db-changes/db.md`.

### ⚙️ Implementation Details

**Files**:
- `src/team/db.ts` (NEW, ~150 lines)
- `src/team/db-migrate.ts` (NEW, ~50 lines)

**Schema (verbatim from §07)**:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  workspace_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_exp  ON user_sessions(expires_at);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE channel_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (channel, external_id)
);
CREATE INDEX idx_channel_identities_user ON channel_identities(user_id);

CREATE TABLE channel_claims (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
```

**Repo functions** (in `db.ts`): `findUserByEmail`, `findUserById`, `createUser`, `updateUserLastSeen`, `disableUser`, `createSession(userId, ua, ip)`, `findSession`, `extendSession`, `deleteSession`, `createApiToken(userId, name, hash)`, `findApiTokenByHash`, `deleteApiToken`, `createChannelIdentity`, `findChannelIdentity(channel, externalId)`, `createChannelClaim`, `consumeChannelClaim`.

**Pragmas**: `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/db.ts and src/team/db-migrate.ts in the OpenClaw repo.

REQUIREMENTS
1. src/team/db-migrate.ts:
   - Export `migrate(db: Database): void`.
   - Read PRAGMA user_version (default 0).
   - If < 1, run the schema below in a transaction, then PRAGMA user_version = 1.
   - Schema includes 6 tables: users, workspaces, user_sessions, api_tokens, channel_identities, channel_claims (verbatim from /kalim/enterprise-simple-plan/07-minimal-db-changes/db.md).
   - Idempotent: running migrate() twice must not error.
2. src/team/db.ts:
   - Default export: a singleton `better-sqlite3` Database handle, opened lazily on first import from `${OPENCLAW_HOME ?? `${process.env.HOME}/.openclaw`}/team.sqlite`.
   - PRAGMA journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL on first open.
   - Named exports for repo functions:
       findUserByEmail(email): User|null
       findUserById(id): User|null
       createUser(input: { email, passwordHash, name?, isAdmin? }): User
       updateUserLastSeen(id, isoNow): void
       disableUser(id): void
       createSession(userId, userAgent, ip): { id, expiresAt }    // 32-byte hex id
       findSession(id): Session|null
       extendSession(id, isoNow): void                             // bumps last_used_at + expires_at +30d
       deleteSession(id): void
       deleteExpiredSessions(isoNow): number
       createApiToken(userId, name, hash): ApiToken                // hash = sha256 hex of raw token
       findApiTokenByHash(hash): ApiToken|null
       updateApiTokenLastUsed(id, isoNow): void
       deleteApiToken(id, userId): void
       createChannelIdentity(input): ChannelIdentity                // throws on UNIQUE violation
       findChannelIdentity(channel, externalId): ChannelIdentity|null
       listChannelIdentitiesForUser(userId): ChannelIdentity[]
       deleteChannelIdentity(id, userId): void
       createChannelClaim(userId, channel, ttlSeconds): { code, expiresAt }   // code = `OC-` + 6 random base32
       consumeChannelClaim(code): { userId, channel } | null         // returns null if not found / expired / consumed
   - Types defined inline at top of file.
   - Use prepared statements; do not concatenate SQL.
3. Use crypto.randomUUID() for ids; crypto.randomBytes(32).toString('hex') for session ids; crypto.createHash('sha256') for api token hashes.

CONSTRAINTS
- TypeScript ESM.
- No external query builder. Raw better-sqlite3 prepared statements only.
- No nullable columns get `null` strings — pass actual `null`.

OUTPUT
- src/team/db.ts (full file)
- src/team/db-migrate.ts (full file)
```

### 🧪 Testing Instructions
1. Delete `~/.openclaw/team.sqlite`.
2. Boot with `OPENCLAW_TEAM_MODE=1` → file created, all 6 tables exist (`sqlite3 ~/.openclaw/team.sqlite ".tables"`).
3. Confirm `PRAGMA user_version` returns `1`.
4. Restart → migrate runs but does nothing observable (idempotent).
5. `INSERT INTO channel_identities (channel='telegram', external_id='X', user_id=…)` twice → second fails with UNIQUE constraint.
6. `DELETE FROM users WHERE id=?` → cascades to `user_sessions`, `api_tokens`, `channel_identities`, `channel_claims`.

### 📥 Example Input
```ts
import db, { createUser, findUserByEmail } from './team/db';
const u = createUser({ email: 'amit@example.com', passwordHash: '<argon2 hash>', isAdmin: true });
console.log(findUserByEmail('amit@example.com'));
```

### 📤 Expected Output
```js
{
  id: '8b7f...uuid',
  email: 'amit@example.com',
  password_hash: '$argon2id$v=19$...',
  name: null,
  is_admin: 1,
  workspace_id: null,
  status: 'active',
  created_at: '2026-05-01T12:00:00Z',
  last_seen_at: null
}
```

### ✅ Acceptance Criteria
- [ ] All 6 tables created on first boot.
- [ ] All indexes present.
- [ ] `migrate()` is idempotent.
- [ ] FK cascades work (delete user removes related rows).
- [ ] WAL mode active (`.shm` and `.wal` files appear next to `.sqlite`).
- [ ] All 18 repo functions exist and are typed.

---

## STORY 1.3 — Implement `resolveTeamAuth` Middleware

### 🎯 Description
Resolve the request's identity from one of three credentials: `Cookie: oc_session=...`, `Authorization: Bearer ocp_...`, or the legacy `OPENCLAW_GATEWAY_TOKEN`. Returns a `TeamCtx` or `null`. Adds `ctx.files` for non-admin users via `resolveUserFiles` (Story 2.1; for now stub the call).

Source: `04-auth-design/auth.md` "Backward Compatibility" code block, "File Path Resolution (After Auth)".

### ⚙️ Implementation Details

**File**: `src/team/auth-middleware.ts` (NEW, ~80 lines)

**Logic**:
```
resolveTeamAuth(req):
  1. Cookie 'oc_session':
     row = findSession(cookie); if found && expires_at > now:
       extendSession(); user = findUserById(row.user_id); if user.status='active':
         return { userId, workspaceId, isAdmin, source: 'cookie' }
  2. Authorization Bearer ocp_*:
     hash = sha256(token); row = findApiTokenByHash(hash); if found:
       updateApiTokenLastUsed; user = findUserById(row.user_id); if active:
         return { userId, ..., source: 'api-token' }
  3. Authorization Bearer <gateway token>:
     timingSafeEqual(token, OPENCLAW_GATEWAY_TOKEN):
       return { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }
  4. else null
```

After resolution, if `ctx && ctx.userId !== 'admin'`: `ctx.files = await resolveUserFiles(ctx.userId)`.

### 🤖 AI CODING PROMPT

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
     files?: UserFiles;     // populated below for non-admin users
   };
3. Order of resolution (return first hit, never combine):
   a) Cookie `oc_session`:
        - parse from req.headers.cookie
        - findSession(value); if row && new Date(row.expires_at) > new Date():
            extendSession(value, new Date().toISOString())   // sliding window
            user = findUserById(row.user_id)
            if (!user || user.status !== 'active') return null
            ctx = { userId: user.id, workspaceId: user.workspace_id, isAdmin: !!user.is_admin, source: 'cookie' }
   b) Authorization Bearer:
      i)  starts with 'ocp_' → hash with sha256 hex; findApiTokenByHash; on hit:
            updateApiTokenLastUsed; user = findUserById(token.user_id)
            return { ..., source: 'api-token' }
      ii) else timingSafeEqual against process.env.OPENCLAW_GATEWAY_TOKEN:
            return { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' }
4. After resolution, if ctx && ctx.userId !== 'admin':
      ctx.files = await resolveUserFiles(ctx.userId)        // import from './file-resolver'
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

### 🧪 Testing Instructions
1. Create a user, then a session row → set cookie `oc_session=<id>` on a fake req → `resolveTeamAuth(req)` returns ctx with `source='cookie'`.
2. Create an API token → set `Authorization: Bearer ocp_<token>` → ctx with `source='api-token'`.
3. Set legacy GW token in env → set `Authorization: Bearer <gw>` → ctx with `source='legacy'`, `userId='admin'`.
4. Bad cookie → returns `null`.
5. Disabled user (status='disabled') → returns `null` even with valid session.
6. Expired session → returns `null` and extendSession is NOT called.

### 📥 Example Input
```http
GET /auth/me HTTP/1.1
Cookie: oc_session=ab12...abcd
```

### 📤 Expected Output
```json
{
  "userId": "u_a3f...",
  "workspaceId": null,
  "isAdmin": false,
  "source": "cookie",
  "files": {
    "soulPath": "/home/oc/.openclaw/workspace/users/user_u_a3f.../SOUL.md",
    "agentsPath": "...",
    "memoryPath": "...",
    "userProfilePath": "...",
    "tasksPath": "...",
    "uploadsDir": "...",
    "conversationsDir": "...",
    "tmpDir": "...",
    "toolCacheDir": "...",
    "logsDir": "..."
  }
}
```

### ✅ Acceptance Criteria
- [ ] All three credentials resolve to the correct `source`.
- [ ] Disabled user always returns `null`.
- [ ] Expired sessions return `null` and are not extended.
- [ ] Legacy ctx never has `files` populated.
- [ ] Non-admin ctx always has `files` with all 10 absolute paths.

---

## STORY 1.4 — Patch `src/gateway/auth.ts` to Call `resolveTeamAuth` First

### 🎯 Description
Insert team-mode resolution at the top of `authorizeHttpGatewayConnect` so a successful team-auth short-circuits the existing chain. On miss, fall through to the existing logic untouched.

### ⚙️ Implementation Details

**File**: `src/gateway/auth.ts` (PATCH, +15 lines)

The patch is gated by `process.env.OPENCLAW_TEAM_MODE === '1'`. WebSocket auth uses the same fn, so one patch covers both.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer working on the OpenClaw repo.

TASK
Patch src/gateway/auth.ts: at the top of the existing http authorize function, call resolveTeamAuth(req) and short-circuit on success.

REQUIREMENTS
1. Import resolveTeamAuth from '../team/auth-middleware'. Use a dynamic import wrapped in a try/catch so the module is only loaded when OPENCLAW_TEAM_MODE === '1'. Cache the resolved fn in a module-level variable.
2. At the very top of authorizeHttpGatewayConnect (or whatever the existing authorize fn is named — find it via grep):
       if (process.env.OPENCLAW_TEAM_MODE === '1') {
         const team = await resolveTeamAuth(req);
         if (team) {
           (req as any).team = team;
           return true;
         }
       }
3. Leave the existing logic UNCHANGED below this insertion. The function already handles bearer/Tailscale/proxy/device-token paths — do not touch them.
4. The function might be sync today; if so, change its return type to Promise<boolean> and update its 1–2 callers to await. Search the codebase for callers first.

CONSTRAINTS
- Existing OPENCLAW_GATEWAY_TOKEN flow MUST keep working.
- Existing tests in src/gateway/auth.test.ts MUST continue to pass.
- The change must be inside an env-flag if-branch so it's a no-op when team mode is off.

OUTPUT
- The exact edited src/gateway/auth.ts (full file or unified diff).
- If async-conversion is needed, the corresponding caller patches.
```

### 🧪 Testing Instructions
1. With `OPENCLAW_TEAM_MODE=1` and a valid cookie → request to a gateway-protected route succeeds; `req.team` is populated.
2. With `OPENCLAW_TEAM_MODE=1` and a valid legacy gateway token → request succeeds with `req.team = { userId: 'admin', source: 'legacy' }`.
3. With `OPENCLAW_TEAM_MODE` unset → behavior is byte-identical to today; `req.team` is `undefined`.
4. With invalid creds → 401, same as today.
5. WebSocket connection authenticates using the same path.

### 📥 Example Input
```bash
curl -H "Cookie: oc_session=valid-id" https://oc.example.com/v1/agents
```

### 📤 Expected Output
HTTP 200 with `req.team.userId` available to downstream handlers.

### ✅ Acceptance Criteria
- [ ] Team-mode auth fires before legacy auth chain.
- [ ] Legacy GW token still works.
- [ ] No regression in `src/gateway/auth.test.ts`.
- [ ] WebSocket auth still works with both team and legacy creds.

---

## STORY 1.5 — Implement `/auth/login`, `/auth/logout`, `/auth/me`

### 🎯 Description
Three small HTTP routes that issue/destroy/inspect a cookie session. POST `/auth/login` validates email+password against `users`, calls `createSession`, sets `oc_session` cookie. POST `/auth/logout` deletes the session and clears the cookie. GET `/auth/me` returns the current user's JSON or 401.

Source: `04-auth-design/auth.md` "Cookie Session Flow".

### ⚙️ Implementation Details

**File**: `src/team/auth-routes.ts` (NEW, ~120 lines)

**Routes**:
- `POST /auth/login` — body `{ email, password }`. Argon2id verify. On success: `createSession`, set `Set-Cookie: oc_session=<id>; HttpOnly; SameSite=Lax; Secure (if https); Path=/; Max-Age=2592000`.
- `POST /auth/logout` — `deleteSession(cookie)`, clear cookie.
- `GET /auth/me` — call `resolveTeamAuth(req)`, return user or 401.
- `POST /auth/reset` — body `{ token, newPassword }`. Token comes from CLI-printed reset workflow (Story 7.5). Validates token, sets new password hash.

**Rate limiting**: failed `/auth/login` increments OpenClaw's existing `auth-rate-limit.ts` counter keyed by IP+email.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Create src/team/auth-routes.ts that exports `mountAuthRoutes(app)` to register four routes.

REQUIREMENTS
1. POST /auth/login:
   - Body: JSON { email: string, password: string }
   - Validate inputs (both required, basic email regex).
   - findUserByEmail(email); if !user || user.status !== 'active': return 401 with { error: 'invalid_credentials' }.
   - argon2.verify(user.password_hash, password); on false → 401.
   - createSession(user.id, req.headers['user-agent'] ?? null, req.ip ?? null) → { id, expiresAt }.
   - Set Set-Cookie: `oc_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${isHttps ? '; Secure' : ''}`.
   - Return 200 { user: { id, email, name, isAdmin, workspaceId } }.
   - On invalid creds: increment OpenClaw's auth-rate-limit.ts counter (require it lazily; if missing, log and continue).

2. POST /auth/logout:
   - Read oc_session cookie. If present: deleteSession(cookieValue).
   - Set-Cookie: `oc_session=; HttpOnly; Path=/; Max-Age=0`.
   - Return 204.

3. GET /auth/me:
   - Call resolveTeamAuth(req).
   - If null → 401 { error: 'unauthenticated' }.
   - Else return 200 { user: { id, email, name, isAdmin, workspaceId, source }, files? } where files is included only when the auth source produced it.

4. POST /auth/reset:
   - Body: { token, newPassword }
   - Look up the reset token in a small reset_tokens table created on demand (or use channel_claims table with channel='reset' as a quick reuse).
   - On valid: update users.password_hash, delete all user_sessions for that user.
   - On invalid: 400.

5. CSRF: /auth/login and /auth/logout require a `x-csrf` header that matches the value in the `oc_csrf` cookie. /auth/me does not. /auth/reset requires the reset token itself which is sufficient.

CONSTRAINTS
- Use the existing Express-like app instance (find how other routes are mounted in src/gateway/server-http.ts).
- Argon2 from 'argon2' npm package.
- Cookie parsing without an external dep — do it inline, ~10 lines.

OUTPUT
- src/team/auth-routes.ts (full file)
```

### 🧪 Testing Instructions
1. POST `/auth/login` with seeded admin → 200, `Set-Cookie: oc_session=...`.
2. GET `/auth/me` with that cookie → 200 with user JSON.
3. POST `/auth/logout` → 204; subsequent `/auth/me` → 401.
4. POST `/auth/login` with bad password → 401.
5. POST `/auth/login` 6 times rapidly with bad password → rate-limit counter increments; subsequent attempts back off.
6. POST `/auth/reset` with invalid token → 400.

### 📥 Example Input
```http
POST /auth/login HTTP/1.1
Content-Type: application/json
X-Csrf: <csrf-cookie-value>

{"email":"amit@example.com","password":"ChangeMe-2026"}
```

### 📤 Expected Output
```http
HTTP/1.1 200 OK
Set-Cookie: oc_session=8f3b2c...; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000; Secure

{
  "user": {
    "id": "u_a3f...",
    "email": "amit@example.com",
    "name": null,
    "isAdmin": true,
    "workspaceId": null
  }
}
```

### ✅ Acceptance Criteria
- [ ] All four routes mounted under team-mode boot.
- [ ] Cookie set with correct flags (HttpOnly, SameSite=Lax, Path=/, Secure when HTTPS).
- [ ] Logout fully invalidates the session in DB.
- [ ] `/auth/me` returns 401 when no creds.
- [ ] Rate limit on `/auth/login` honors existing OpenClaw mechanism.

---

## STORY 1.6 — Implement API Token Routes (`/team/tokens`)

### 🎯 Description
Self-service API tokens: a logged-in user can create, list, and delete their own tokens. The raw token is shown **once** at creation; only the SHA-256 hash is stored. Used for channel webhooks (Story 4.x), CLI scripts, and bots.

Source: `04-auth-design/auth.md` "API Token Flow".

### ⚙️ Implementation Details

**File**: extends `src/team/team-routes.ts` (covered fully in EPIC 7; this story is the API-token slice).

**Routes**:
- `GET /team/tokens` — list current user's tokens (id, name, last_used_at, created_at; never the hash).
- `POST /team/tokens` — body `{ name }`. Generate `ocp_` + 24-byte base64url. Store SHA-256 hash. Return raw token **once**.
- `DELETE /team/tokens/:id` — only if `user_id` matches the caller.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Add three routes to src/team/team-routes.ts (or create the file): GET, POST, DELETE under /team/tokens.

REQUIREMENTS
1. All three routes call resolveTeamAuth(req) first; on null → 401. CSRF required for POST/DELETE.
2. GET /team/tokens:
   - SELECT id, name, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC.
   - Return { tokens: [...] }.
3. POST /team/tokens:
   - Body: { name: string } (required, max 80 chars).
   - raw = 'ocp_' + crypto.randomBytes(24).toString('base64url')
   - hash = crypto.createHash('sha256').update(raw).digest('hex')
   - createApiToken(userId, name, hash)
   - Return 201 { id, name, token: raw, created_at }. Document that this is the only time the raw token is returned.
4. DELETE /team/tokens/:id:
   - deleteApiToken(req.params.id, ctx.userId).
   - Return 204 on success, 404 if no row matched (caller may have spoofed an id).

CONSTRAINTS
- Never log the raw token.
- Reject names that are blank or > 80 chars with 400.
- Token prefix MUST be 'ocp_' so resolveTeamAuth can fast-path it.

OUTPUT
- The new fns in src/team/team-routes.ts (full file or diff if file exists).
```

### 🧪 Testing Instructions
1. Login → POST `/team/tokens` with `{ name: 'webhook' }` → 201, `token` field starts with `ocp_`.
2. Use the returned token in `Authorization: Bearer ocp_...` against `/auth/me` → 200.
3. GET `/team/tokens` → list shows the new token but `token` field is absent.
4. DELETE `/team/tokens/<id>` → 204; subsequent use of the raw token → 401.
5. Try to DELETE another user's token id → 404.

### 📥 Example Input
```http
POST /team/tokens
Cookie: oc_session=...
X-Csrf: ...
{"name":"my-bot"}
```

### 📤 Expected Output
```json
{
  "id": "tok_b9e2...",
  "name": "my-bot",
  "token": "ocp_4Z8jWk3pRfV2nQs7Tx9cYBhMaLeUgDoP",
  "created_at": "2026-05-01T12:34:56Z"
}
```

### ✅ Acceptance Criteria
- [ ] Token prefix is `ocp_` and is 32 base64url chars after the prefix.
- [ ] Raw token returned only on creation.
- [ ] Cross-user delete returns 404.
- [ ] Hashed tokens authenticate identically to cookie sessions.

---

## STORY 1.7 — Mount Team Routes Conditionally in `server-http.ts`

### 🎯 Description
Wire `mountAuthRoutes`, `mountTeamRoutes`, `mountChannelRouter` into the existing OpenClaw HTTP server only when `OPENCLAW_TEAM_MODE=1`. Two small `if` branches in `src/gateway/server-http.ts`.

### ⚙️ Implementation Details

**File**: `src/gateway/server-http.ts` (PATCH, +10 lines)

### 🤖 AI CODING PROMPT

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
3. Order matters: auth routes must be reachable without auth (public endpoints); team admin routes require auth; channel routes verify their own signatures and don't use cookie auth.

CONSTRAINTS
- Do not interfere with existing route registration.
- Wrap in try/catch and log if mountTeamRoutes throws — never crash the gateway.

OUTPUT
- The patch (unified diff) for src/gateway/server-http.ts.
```

### 🧪 Testing Instructions
1. With `OPENCLAW_TEAM_MODE=1` → GET `/auth/me` returns 401 (route exists). GET `/team` returns HTML.
2. With `OPENCLAW_TEAM_MODE` unset → GET `/auth/me` returns 404 (route not mounted).
3. WebSocket and existing JSON-RPC methods unaffected in both modes.

### ✅ Acceptance Criteria
- [ ] All team routes reachable in team mode.
- [ ] No team routes mounted in legacy mode.
- [ ] No regression in any existing route.
