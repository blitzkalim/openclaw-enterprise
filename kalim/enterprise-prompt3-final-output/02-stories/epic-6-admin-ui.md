# EPIC 6 — Plugin Safety + Admin APIs & UI

---

## 🧾 PLUGIN-1: Plugin team_safe Guard (assertPluginTeamSafe)

### 🎯 Description

Implement `assertPluginTeamSafe(manifest)` that rejects any plugin loaded in the Agent Worker Pod that does not explicitly declare `team_safe: true` in its manifest. Also patch `src/plugins/plugin-loader.ts` to call this guard at startup and inject a `secureRead`/`secureWrite`-backed `fs` proxy.

Source: `05-agent-runtime/README.md` — "Plugin Execution", `08-code-change-plan/README.md` — plugin-loader.ts patch (+30 lines).

### ⚙️ Implementation Details

**Files to create:**
- `services/agent-worker/src/plugin-guard.ts`

**File to patch:**
- `src/plugins/plugin-loader.ts` (+30 lines)

**Guard logic:**
```ts
function assertPluginTeamSafe(manifest: PluginManifest): void {
  if (!manifest.team_safe) {
    throw new Error(
      `Plugin '${manifest.name}' is not marked team_safe. ` +
      `Set team_safe: true in the plugin manifest to allow it in team mode.`
    );
  }
}
```

**fs proxy injection:**
```ts
// In plugin-loader.ts (patch)
if (OPENCLAW_TEAM_MODE && team) {
  assertPluginTeamSafe(manifest);
  // Replace plugin's fs access with secureRead/secureWrite proxy
  const fsProxy = createFsProxy(team.userId, secureRead, secureWrite);
  plugin.context.fs = fsProxy;
}
```

**fs proxy:** Intercepts `readFile`, `writeFile`, `appendFile` calls and routes them through `secureRead`/`secureWrite` with the current user's ID.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
1. Create services/agent-worker/src/plugin-guard.ts
2. Patch src/plugins/plugin-loader.ts (READ the file first, then add ~30 lines)

For plugin-guard.ts:

Export interface PluginManifest:
  name: string
  version: string
  team_safe?: boolean
  description?: string

Export function assertPluginTeamSafe(manifest: PluginManifest): void:
  if (!manifest.team_safe):
    throw new Error(
      '[TeamMode] Plugin "' + manifest.name + '" blocked: ' +
      'manifest does not declare team_safe: true. ' +
      'Audit the plugin and add team_safe: true to its manifest.json to allow in team mode.'
    )
  // Log allowed:
  logger.info({ plugin: manifest.name, version: manifest.version }, 'plugin passed team_safe check')

Export function createFsProxy(userId: string, secureRead: Function, secureWrite: Function): object:
  return {
    readFile: async (path: string, encoding = 'utf-8') => secureRead(userId, path),
    writeFile: async (path: string, content: string) => secureWrite(userId, path, content),
    appendFile: async (path: string, content: string) => secureWrite(userId, path, content, { append: true }),
    // Expose other fs methods that are safe (stat, etc.) as no-ops or pass-through to local /tmp only
  }

For src/plugins/plugin-loader.ts patch:
  READ the existing file first.
  Find where plugins are loaded/initialized.
  Add after manifest is parsed:
  
  if (process.env.OPENCLAW_TEAM_MODE === '1') {
    // Import dynamically to avoid circular deps
    const { assertPluginTeamSafe, createFsProxy } = require('./plugin-guard')
    assertPluginTeamSafe(manifest)
    if (team) {
      plugin.context = plugin.context || {}
      plugin.context.fs = createFsProxy(team.userId, secureRead, secureWrite)
    }
  }

Constraints:
  - Rejection must be logged at ERROR level with plugin name
  - assertPluginTeamSafe called BEFORE any plugin code is executed
  - Plugin load fails if team_safe check fails (throw propagates up, plugin not loaded)
  - The fs proxy must NOT expose raw filesystem access (no direct fs.readFile to arbitrary paths)
  - TypeScript strict mode

Output: plugin-guard.ts + diff of plugin-loader.ts changes
```

### 🧪 Testing Instructions

```
1. Create a test plugin with manifest.json: { "name": "unsafe-plugin", "version": "1.0" }
   (no team_safe field)
   Start agent worker → plugin load should FAIL with clear error message

2. Create a test plugin with team_safe: true:
   Start agent worker → plugin loaded successfully

3. Test fs proxy:
   In plugin code: context.fs.readFile('users/user_abc/MEMORY.md')
   → Routes through secureRead('abc', 'users/user_abc/MEMORY.md')
   → Returns S3 content

4. Test fs proxy cross-user block:
   In plugin code: context.fs.readFile('users/user_xyz/MEMORY.md')
   But plugin is running as user 'abc'
   → secureRead('abc', 'users/user_xyz/MEMORY.md') throws SecureFsViolationError

5. Test with OPENCLAW_TEAM_MODE unset:
   Plugin loaded without team_safe check (backward compat)
```

### 📥 Example Input

```json
// Plugin manifest.json (UNSAFE — no team_safe)
{ "name": "my-crm-plugin", "version": "2.1.0", "description": "CRM integration" }
```

### 📤 Expected Output

```
// Agent Worker startup:
ERROR [TeamMode] Plugin "my-crm-plugin" blocked: manifest does not declare team_safe: true.
// Agent Worker exits or skips this plugin
```

### ✅ Acceptance Criteria

- [ ] Plugin without `team_safe: true` is rejected at startup with clear error
- [ ] Plugin with `team_safe: true` is loaded normally
- [ ] `fs` proxy injected into plugin context (replaces direct `node:fs` access)
- [ ] `fs.readFile` via proxy routes through `secureRead` (userId-scoped)
- [ ] `fs.writeFile` routes through `secureWrite`
- [ ] With `OPENCLAW_TEAM_MODE` unset: no changes to plugin loading (backward compat)

---

## 🧾 PLUGIN-2: Admin User Management Routes

### 🎯 Description

Implement the team admin HTTP routes for user management: invite a new user (admin only), list users, disable/delete a user, and list active sessions for admin visibility.

Source: `02-service-contracts/README.md` — "Team Admin Routes" table, `08-code-change-plan/README.md` — team-routes.ts.

### ⚙️ Implementation Details

**Files to create/modify:**
- `services/gateway/src/team-routes.ts` (user management section)

**Routes:**
```
GET  /team/users           → [{ id, email, name, isAdmin, status, createdAt, lastSeenAt }]
POST /team/users           → invite new user (admin only)
  body: { email, name }
  → INSERT INTO users (email, random temp password, is_admin=false)
  → Return { userId, inviteUrl }  (inviteUrl for password reset flow)
PATCH /team/users/:id      → update user (admin only: toggle is_admin, update name)
DELETE /team/users/:id     → disable/delete user (admin only)
  → UPDATE users SET status='disabled' WHERE id = ?
  → Revoke all sessions: DELETE FROM user_sessions WHERE user_id = ?
  → DEL session:{jti} for each active session in Redis

GET /team/users/:id/sessions → [{ id, createdAt, lastUsedAt, ip, userAgent }]  (admin only)
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Add user management routes to services/gateway/src/team-routes.ts

Requirements:

GET /team/users (authMiddleware required):
  - SELECT id, email, name, is_admin, status, created_at, last_seen_at FROM users ORDER BY created_at
  - Return 200: array

POST /team/users (authMiddleware + requireAdmin):
  - Validate body: { email: string, name: string }
  - Check email doesn't exist: if exists return 409 { error: 'email already exists' }
  - Generate temp password: randomBytes(16).hex() + '!'  (meets common complexity rules)
  - Hash: hashPassword(tempPassword)
  - INSERT INTO users (email, password_hash, name, is_admin=false, status='active')
  - inviteUrl: OPENCLAW_PUBLIC_BASE_URL + '/auth/reset?token=' + generatePasswordResetToken(newUserId)
  - Return 201: { userId, inviteUrl }
    (Admin emails the inviteUrl manually — no email service in scope)

PATCH /team/users/:id (authMiddleware + requireAdmin):
  - Cannot modify own user (prevent admin lockout)
  - Validate body: { name?, isAdmin? }
  - UPDATE users SET name=?, is_admin=? WHERE id = ?
  - Return 200: updated user

DELETE /team/users/:id (authMiddleware + requireAdmin):
  - Cannot delete own account
  - UPDATE users SET status='disabled' WHERE id = ?
  - SELECT id FROM user_sessions WHERE user_id = ? (get all jtis)
  - DELETE FROM user_sessions WHERE user_id = ?
  - For each jti: redis.del('session:' + jti)
  - Also invalidate API token cache: for each token hash in api_tokens WHERE user_id=?:
    redis.del('api_token:' + hash)
  - Return 204

GET /team/users/:id/sessions (authMiddleware + requireAdmin):
  - SELECT id, created_at, last_used_at, ip_address, user_agent FROM user_sessions WHERE user_id = ? AND expires_at > now()
  - Return 200: array

Constraints:
  - Admin cannot delete/disable their own account (prevent lockout)
  - Session revocation must happen in Redis AND Postgres
  - inviteUrl is returned in response — no email sending (out of scope)
  - TypeScript strict mode, CSRF protection on all write routes

Output: Complete user management section of team-routes.ts
```

### 🧪 Testing Instructions

```
1. GET /team/users → array of users
2. POST /team/users { email: 'new@test.com', name: 'New User' } as admin
   → 201, { userId, inviteUrl }
3. POST /team/users with existing email → 409
4. POST /team/users as non-admin → 403
5. DELETE /team/users/:id as admin
   → User status='disabled'
   → user_sessions rows deleted
   → Redis session keys gone
   → Subsequent /auth/me with that user's cookie → 401
6. DELETE own account → 403 (cannot delete self)
7. GET /team/users/:id/sessions → list active sessions
```

### 📥 Example Input

```json
POST /team/users
{ "email": "newagent@agency.com", "name": "New Agent" }
```

### 📤 Expected Output

```json
HTTP 201
{ "userId": "u_new-uuid", "inviteUrl": "https://oc.example.com/auth/reset?token=..." }
```

### ✅ Acceptance Criteria

- [ ] User list returned with all relevant fields (no password hash)
- [ ] New user creation: admin-only, returns invite URL
- [ ] Duplicate email → 409
- [ ] Delete user: sets status='disabled', revokes all sessions (Redis + Postgres)
- [ ] Admin cannot delete their own account
- [ ] Non-admin cannot call admin-only routes (403)

---

## 🧾 PLUGIN-3 / ADMIN-5: Server-Rendered Admin Panel (team.html + login.html)

### 🎯 Description

Implement the server-rendered HTML pages for the admin panel (no React, no separate frontend build step). The login page handles form submission. The team page shows user management, API tokens, channel identities, and DLQ (dead letter queue) overview.

Source: `08-code-change-plan/README.md` — "Gateway Service" file list (login.html, team.html ~150 lines each).

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/web/login.html`
- `services/gateway/src/web/team.html`
- `services/gateway/src/web-routes.ts` (Express routes that render these pages)

**Rendering approach:** String template with `{{variable}}` substitution (no template engine dependency). Or use simple `ejs`/`handlebars` if available.

**Pages:**

`login.html`:
- Simple form: email + password → POST /auth/login
- Error message section (shown on failed login redirect)

`team.html`:
- Tabs/sections: Users, API Tokens, Channel Identities, DLQ
- Users table: email, name, admin badge, status, actions (Disable, View Sessions)
- Tokens table: name, created, last used, Delete button
- Identities table: channel icon, externalId, displayName, linked user
- DLQ: count of failed jobs + link to retry
- All forms include CSRF token hidden field

### 🤖 AI CODING PROMPT

```text
You are a senior full-stack TypeScript/Node.js engineer.

Task:
Create services/gateway/src/web/login.html and services/gateway/src/web/team.html
and the web-routes.ts that renders them.

For web-routes.ts:

GET /login:
  - If req.cookies.oc_session exists and is valid: redirect to /team
  - Render login.html (with optional ?error=invalid_credentials query param)

GET /team (requires authMiddleware):
  - Fetch: users, tokens (for current user), identities (for current user), DLQ stats
  - Render team.html with all data + csrfToken

For login.html (write complete valid HTML):
<!DOCTYPE html>
<html lang="en">
<head>
  <title>OpenClaw — Login</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Minimal CSS: centered form, clean typography */
    body { font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; border-radius: 8px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 100%; max-width: 360px; }
    h1 { margin-top: 0; font-size: 1.5rem; }
    label { display: block; margin-bottom: 0.25rem; font-weight: 500; }
    input[type=email], input[type=password] { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: 0.75rem; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    .error { color: #cc0000; font-size: 0.9rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>OpenClaw</h1>
    {{#if error}}<p class="error">Invalid email or password.</p>{{/if}}
    <form method="POST" action="/auth/login">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="username">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>

For team.html:
  - Navigation header with logo, user name, logout button
  - Section: Users (admin only) — table with email, name, admin toggle, disable button
  - Section: API Tokens — table with name, created, last used, delete button + create form
  - Section: Channel Identities — table with channel, external ID, display name, claim code generator
  - Section: DLQ — count of failed jobs, description
  - All forms: include <input type="hidden" name="_csrf" value="{{csrfToken}}">
  - Responsive with minimal CSS (no framework dependencies)

Constraints:
  - No external CSS frameworks (no Bootstrap, Tailwind) — minimal inline CSS
  - No JavaScript frameworks — plain HTML forms, server-side rendering
  - All mutation actions use HTML forms (POST/DELETE via form + _method trick if needed)
  - CSRF token in every form
  - TypeScript strict mode in web-routes.ts

Output: Both HTML files (complete) + web-routes.ts
```

### 🧪 Testing Instructions

```
1. GET /login → renders login form (no JS framework, just HTML)
2. POST /auth/login with correct credentials → redirects to /team
3. POST /auth/login with wrong credentials → redirects to /login?error=1
4. GET /team without auth → redirects to /login
5. GET /team as admin → shows Users section
6. GET /team as non-admin → Users section hidden or shows 'No access'
7. Create API token via form → POST /team/tokens → redirect back to /team
8. Delete API token → DELETE (or POST /team/tokens/:id/delete) → redirect back
9. Link channel identity → shows claim code
10. View on mobile (narrow screen) → renders without horizontal scroll
```

### 📥 Example Input

```
GET /team
Cookie: oc_session=<valid JWT>
```

### 📤 Expected Output

```html
<!-- Server-rendered HTML page with:
  - List of team members
  - API tokens table
  - Channel identities section
  - DLQ status
  - All forms with CSRF tokens
-->
```

### ✅ Acceptance Criteria

- [ ] `login.html` renders without JavaScript errors
- [ ] Login form POSTs to `/auth/login`, shows error on failure
- [ ] `team.html` shows user list (admin only), token list, identity list, DLQ stats
- [ ] Every form includes `_csrf` hidden field with correct value
- [ ] No external CSS/JS framework dependencies
- [ ] Renders correctly on mobile viewports (max-width 360px)
- [ ] Logout button calls `POST /auth/logout` and clears session
