# EPIC 7 — Admin APIs & UI (`/login`, `/team`)

> Source: `04-auth-design/auth.md` Login UI, `03-user-model/model.md` invite flow, `09-deployment-model/deployment.md` first-run bootstrap. Two server-rendered HTML pages plus REST endpoints.

---

## STORY 7.1 — `/login` HTML Page

### 🎯 Description
A minimal server-rendered HTML page at `GET /login` with an email + password form that posts to `/auth/login`. CSRF token in a cookie + hidden form field. No React, no build step.

### ⚙️ Implementation Details

**Files**:
- `src/team/web/login.html` (NEW, ~60 lines)
- `src/team/auth-routes.ts` — add GET `/login` handler that reads the file, injects a CSRF cookie + token, returns it.

The HTML is plain `<form method="post" action="/auth/login">` with a JS-only fetch shim to set the `Content-Type: application/json` header (since the auth route accepts JSON, not form-encoded). Or simpler: route both JSON and form-encoded on `/auth/login`.

### 🤖 AI CODING PROMPT

```
You are a senior front-end-capable Node.js engineer.

TASK
Create src/team/web/login.html and a GET /login route.

REQUIREMENTS
1. login.html:
   - Single <form method="post" action="/auth/login">.
   - <input name="email" type="email" required>
   - <input name="password" type="password" required>
   - <input name="csrf" type="hidden" value="__CSRF__"> (server replaces __CSRF__ with the cookie value).
   - <button>Sign in</button>
   - Minimal inline CSS, dark/light auto, ~60 lines total including style.
   - On successful login (redirect to /team), the form's onsubmit handler does fetch('/auth/login', { method:'POST', body: JSON.stringify({email,password}), headers:{'Content-Type':'application/json','X-Csrf':csrf}, credentials:'same-origin' }) and on 200 navigates to /team. On 401 shows an error inline.
2. GET /login route in auth-routes.ts:
   - Generate or read the oc_csrf cookie (16-byte random hex). Set if missing.
   - Read login.html from disk (cache after first read).
   - Replace __CSRF__ token placeholder with the cookie value.
   - Return text/html.
3. CSP header: `default-src 'self'; style-src 'self' 'unsafe-inline'`.

CONSTRAINTS
- No external scripts. No CDN.
- No build step.
- HTML must be < 4 KB.

OUTPUT
- src/team/web/login.html (full file)
- The GET /login handler in src/team/auth-routes.ts.
```

### 🧪 Testing Instructions
1. GET `/login` → 200 text/html; response sets `oc_csrf` cookie.
2. Inspect HTML → contains `name="csrf"` with the cookie's value.
3. Submit valid creds → cookie session set; navigate to `/team` → 200.
4. Submit bad creds → inline error visible; no navigation.
5. CSP header present.

### ✅ Acceptance Criteria
- [ ] Page renders without external resources.
- [ ] CSRF token + cookie pattern works.
- [ ] Successful login redirects to `/team`.
- [ ] No JS framework dependencies.

---

## STORY 7.2 — `/team` HTML Dashboard Page

### 🎯 Description
The single admin/self-service page. Server-rendered HTML at `GET /team`. Shows:
- Logged-in user's name and email + logout link
- (Admin only) Users list — invite, disable, re-enable
- (Self) API tokens — create, revoke, copy
- (Self) Channel identities — claim Telegram/WhatsApp; list current; remove
- (Admin only) Workspaces panel — create, edit channel webhooks (with encryption)

### ⚙️ Implementation Details

**Files**:
- `src/team/web/team.html` (NEW, ~150 lines incl. inline JS)
- `src/team/team-routes.ts` — `GET /team` handler

The page progressively enhances using `fetch()` to hit `/team/users`, `/team/tokens`, `/team/identities`, `/team/workspaces`. Returns 200 with raw HTML; client JS populates lists.

### 🤖 AI CODING PROMPT

```
You are a senior full-stack engineer.

TASK
Create src/team/web/team.html (~150 lines) and the GET /team route handler.

REQUIREMENTS
1. team.html structure:
   <header>: greeting "Hi <name>" + Logout button.
   <section id="users" admin-only>: list, invite form (email + isAdmin checkbox), disable/enable buttons per row.
   <section id="tokens">: list (name, last_used_at, created_at), create form (name field), copy-on-create token banner.
   <section id="identities">: list of claimed phones/chat-ids; "Link Telegram" button → POST /team/identities/claim {channel:'telegram'} → shows claim code with TTL countdown; same for WhatsApp.
   <section id="workspaces" admin-only>: list workspaces; "Edit channel" form per workspace to set Telegram bot token + secret, WhatsApp app secret + phone-number id + access token.
2. Inline JS uses fetch() with credentials: 'same-origin' and the X-Csrf header from the oc_csrf cookie.
3. Server route GET /team:
   - resolveTeamAuth → 401 redirect to /login if not authed.
   - Inject {{user.name}}, {{user.email}}, {{user.isAdmin}} via simple string replace.
   - Set CSP header same as /login.
4. No build step. Inline CSS. ~4 KB output total.
5. ⚠️ Admin-only sections must be hidden via inline `if (!isAdmin) document.getElementById('users').remove();` — and the corresponding API routes must enforce admin server-side too (defense in depth).

CONSTRAINTS
- No frontend frameworks.
- No template engine; simple regex replace on placeholders.
- Forms use POST with JSON.

OUTPUT
- src/team/web/team.html (full file)
- The GET /team handler in src/team/team-routes.ts.
```

### 🧪 Testing Instructions
1. Login as admin → `/team` shows users + workspaces sections.
2. Login as non-admin → those sections absent in DOM.
3. Click "Link Telegram" → claim code appears with countdown.
4. Create API token → token shown once in a banner; refresh → not visible.
5. Logout button → `/auth/logout` then redirect to `/login`.

### ✅ Acceptance Criteria
- [ ] Single HTML response under 5 KB.
- [ ] Admin sections hidden client-side AND blocked server-side.
- [ ] All flows work without page reload (fetch-based).

---

## STORY 7.3 — Admin User Management Endpoints

### 🎯 Description
REST endpoints for admins to invite, disable, re-enable, and list users.

### ⚙️ Implementation Details

**Routes** (in `src/team/team-routes.ts`):
- `GET /team/users` (admin) — list `id, email, name, is_admin, status, created_at, last_seen_at`.
- `POST /team/users` (admin) — body `{ email, isAdmin?, name? }` → create user with random invite token; returns the invite link.
- `DELETE /team/users/:id` (admin) — sets `status='disabled'` (soft delete).
- `POST /team/users/:id/enable` (admin) — sets `status='active'`.

Invite flow uses the `channel_claims` table (channel='invite') for the one-time token, exactly like the password-reset flow (Story 7.5).

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement four admin user-management routes.

REQUIREMENTS
1. All four require resolveTeamAuth and ctx.isAdmin === true; else 403.
2. GET /team/users:
   - SELECT id, email, name, is_admin, status, created_at, last_seen_at FROM users ORDER BY created_at.
3. POST /team/users:
   - Body: { email: string, isAdmin?: boolean, name?: string }
   - Validate email format. Reject if user exists with status='active'.
   - Create user row with password_hash='!invite!' (sentinel — login disabled until accepted), status='active'.
   - Generate invite token via createChannelClaim(userId, 'invite', ttlSeconds=7*24*3600). Return { user, inviteLink: `${PUBLIC_BASE_URL}/auth/accept?token=${code}` }.
   - Do not send email.
4. DELETE /team/users/:id → disableUser(id); refuse if id === ctx.userId (admin can't disable self).
5. POST /team/users/:id/enable → set status='active'.
6. POST /auth/accept (in auth-routes):
   - Body: { token, password }
   - consumeChannelClaim(token) — must be channel='invite'.
   - On valid: hash password (argon2id), update users.password_hash, set last_seen_at.
   - Return 200 + auto-login (Set-Cookie via createSession).

CONSTRAINTS
- Admin can NEVER disable themselves → 400 with clear message.
- Invite tokens expire after 7 days.
- Only one outstanding invite per email; subsequent invites invalidate prior tokens (DELETE prior unconsumed).

OUTPUT
- All five routes (4 admin + 1 public accept).
```

### 🧪 Testing Instructions
1. Admin POST `/team/users {"email":"new@x.com"}` → returns inviteLink.
2. New user opens link, POSTs `/auth/accept` with token + password → cookie session set, can log in.
3. Admin DELETE → user can't log in even with old session.
4. Admin tries to delete self → 400.
5. Non-admin tries any of these → 403.

### 📥 Example Input
```http
POST /team/users
Cookie: oc_session=<admin>
X-Csrf: ...
{"email":"priya@example.com","isAdmin":false,"name":"Priya"}
```

### 📤 Expected Output
```json
{
  "user": { "id": "u_p9e2...", "email": "priya@example.com", "isAdmin": false, "status": "active" },
  "inviteLink": "https://oc.example.com/auth/accept?token=OC-Y8Z3K2"
}
```

### ✅ Acceptance Criteria
- [ ] Admin-only enforcement.
- [ ] Cannot self-disable.
- [ ] Invite tokens are single-use, time-limited, and atomically consumed.

---

## STORY 7.4 — Bootstrap Admin From Env on First Boot

### 🎯 Description
At first boot (when `users` is empty), if `OPENCLAW_TEAM_ADMIN_EMAIL` and `OPENCLAW_TEAM_ADMIN_PASSWORD` are set, create the admin user. Already part of Story 1.1's `initTeamModule`. This story confirms behavior and adds the post-creation log message + safety: clear `process.env.OPENCLAW_TEAM_ADMIN_PASSWORD` from memory after seeding.

### ⚙️ Implementation Details

In `src/team/index.ts` `initTeamModule()`:
```ts
const count = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
if (count.n === 0 && process.env.OPENCLAW_TEAM_ADMIN_EMAIL && process.env.OPENCLAW_TEAM_ADMIN_PASSWORD) {
  const hash = await argon2.hash(process.env.OPENCLAW_TEAM_ADMIN_PASSWORD, { type: argon2.argon2id });
  createUser({ email: process.env.OPENCLAW_TEAM_ADMIN_EMAIL, passwordHash: hash, isAdmin: true });
  delete process.env.OPENCLAW_TEAM_ADMIN_PASSWORD;
  console.log(`[team] bootstrap admin seeded: ${process.env.OPENCLAW_TEAM_ADMIN_EMAIL}`);
}
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Add bootstrap admin seeding to src/team/index.ts initTeamModule.

REQUIREMENTS
1. After migrate(db) and bootstrapBaseDir(), check `SELECT COUNT(*) FROM users`.
2. If 0 AND OPENCLAW_TEAM_ADMIN_EMAIL + OPENCLAW_TEAM_ADMIN_PASSWORD env are set:
   - Validate email format; if invalid → log warning, skip.
   - Validate password length >= 12; if not → log warning, skip.
   - argon2.hash(pwd, { type: argon2.argon2id }).
   - createUser(email, hash, isAdmin=true).
   - delete process.env.OPENCLAW_TEAM_ADMIN_PASSWORD.
   - Log "bootstrap admin seeded: <email>".
3. If users table is non-empty: do nothing.
4. If env not set on first boot: log a one-line WARNING that team mode is on but no admin exists, with hint to set the envs and restart.

CONSTRAINTS
- Never log the password.
- Idempotent: subsequent boots skip silently.

OUTPUT
- The added block in initTeamModule().
```

### 🧪 Testing Instructions
1. Empty DB + envs set → admin created, log line printed.
2. Restart with same envs → no log line, no duplicate user.
3. Empty DB + envs not set → warning logged, boot continues.
4. After boot, `process.env.OPENCLAW_TEAM_ADMIN_PASSWORD` is undefined.

### ✅ Acceptance Criteria
- [ ] Idempotent.
- [ ] Password length validated (>= 12 chars).
- [ ] Env cleared after seeding.

---

## STORY 7.5 — CLI Password-Reset Command

### 🎯 Description
A CLI command `pnpm openclaw team:reset-password <email>` that issues a one-time reset token (in `channel_claims` with channel='reset'), prints the URL, and exits. The user opens that URL and POSTs to `/auth/reset` with `{ token, password }`.

Source: `04-auth-design/auth.md` "Password Storage" out-of-band reset.

### ⚙️ Implementation Details

**File**: `src/team/cli.ts` (NEW, ~50 lines) plus a `bin` entry in `package.json`.

```bash
pnpm openclaw team:reset-password amit@example.com
# prints:
# Reset link (valid 1h):
#   https://oc.example.com/auth/reset?token=OC-T8Y2N4
```

The `/auth/reset` POST handler is in Story 1.5 already.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Add a CLI subcommand `team:reset-password <email>`.

REQUIREMENTS
1. Find the existing OpenClaw CLI entry (likely src/cli/* or bin/*). Add a subcommand that:
   - Takes one positional arg: email.
   - Imports src/team to open the DB.
   - findUserByEmail; if missing → exit 1 with message "no such user".
   - createChannelClaim(userId, 'reset', ttlSeconds=3600) → returns { code, expiresAt }.
   - Prints to stdout:
       Reset link (valid until <expiresAt>):
         <PUBLIC_BASE_URL or http://localhost:8080>/auth/reset?token=<code>
   - Exit 0.
2. If team mode is not configured (no DB), print "team mode disabled — set OPENCLAW_TEAM_MODE=1" and exit 1.
3. The command is admin-tier — anyone with shell on the box can run it. Document this caveat.

CONSTRAINTS
- No new deps. Reuse better-sqlite3 + the existing CLI plumbing.
- Token must consume cleanly via /auth/reset (existing endpoint).

OUTPUT
- The CLI subcommand + a small README snippet documenting the command.
```

### 🧪 Testing Instructions
1. `team:reset-password unknown@x.com` → exit 1, "no such user".
2. `team:reset-password amit@example.com` → exit 0, prints valid URL.
3. Open URL, POST to `/auth/reset` with `{ token, newPassword }` → password updated; old sessions invalidated.
4. Reuse the same token → 400 (single-use).

### ✅ Acceptance Criteria
- [ ] CLI command works on Linux/Mac/Windows.
- [ ] Token TTL = 1 hour.
- [ ] Single-use enforced.
- [ ] All sessions revoked on successful reset.

---

## STORY 7.6 — Admin Workspace + Channel Configuration UI

### 🎯 Description
Admin can create a workspace and configure its WhatsApp / Telegram credentials. The credentials are encrypted at rest (Story 5.4). The `/team` UI's workspaces panel posts to these endpoints.

### ⚙️ Implementation Details

**Routes** (`src/team/team-routes.ts`):
- `GET /team/workspaces` (admin) — list.
- `POST /team/workspaces` (admin) — `{ name, autoCreateGuestUsers? }`.
- `DELETE /team/workspaces/:id` (admin).
- `PUT /team/workspaces/:id/channels/telegram` (admin) — `{ botToken, webhookSecret }` → encrypts + stores.
- `PUT /team/workspaces/:id/channels/whatsapp` (admin) — `{ appSecret, phoneNumberId, accessToken, verifyToken }` → encrypts + stores.

Storage table (added to `db-migrate.ts` v2):
```sql
CREATE TABLE workspace_channels (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  config_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, channel)
);
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Implement workspace and channel-config admin endpoints.

REQUIREMENTS
1. db-migrate.ts: bump to v2; add workspace_channels table (schema above) inside an `if (v < 2)` block.
2. Routes (all admin-only):
   - GET /team/workspaces → list all (id, name, settings JSON column or autoCreateGuestUsers boolean).
   - POST /team/workspaces { name, autoCreateGuestUsers? } → insert; return row.
   - DELETE /team/workspaces/:id → cascade.
   - PUT /team/workspaces/:id/channels/telegram { botToken, webhookSecret? }:
       - If webhookSecret missing, generate crypto.randomBytes(24).toString('hex').
       - JSON.stringify({ botToken, webhookSecret })
       - encryptSecret(...) → blob
       - upsert workspace_channels (workspace_id, channel='telegram', config_encrypted)
       - Return { webhookSecret, webhookUrl: `${PUBLIC_BASE_URL}/webhooks/telegram/${id}` } so the admin can copy it into BotFather setWebhook.
   - PUT /team/workspaces/:id/channels/whatsapp { appSecret, phoneNumberId, accessToken, verifyToken }:
       - JSON.stringify, encrypt, upsert.
       - Return { webhookUrl: `${PUBLIC_BASE_URL}/webhooks/whatsapp/${id}`, verifyToken }.
3. The channel-router (Stories 4.1, 4.2) reads workspace_channels by workspaceId and channel, decrypts via decryptSecret, parses JSON to recover the credentials.
4. autoCreateGuestUsers is a column on workspaces (add via migration v2 if it's not there) or stored in the JSON config.

CONSTRAINTS
- Never echo the stored secrets back to the UI on subsequent reads. UI shows "configured" / "not configured" only.
- All write paths require admin.
- Encrypt blob format from Story 5.4.

OUTPUT
- db-migrate.ts patch (v2 block + workspace_channels table).
- The five routes in src/team/team-routes.ts.
- Read helpers used by channel-router.ts.
```

### 🧪 Testing Instructions
1. Admin POST `/team/workspaces {"name":"BE"}` → 201 with id.
2. Admin PUT telegram channel → row created with `v1.…` ciphertext; response includes webhookUrl + secret.
3. Restart process → channel-router decrypts and uses the credentials.
4. Tamper a byte in the DB → router throws "secret integrity failed" on next webhook.
5. Non-admin attempts → 403.

### ✅ Acceptance Criteria
- [ ] Schema v2 applied idempotently.
- [ ] Secrets encrypted at rest with the AES-GCM scheme from Story 5.4.
- [ ] UI never re-displays the raw secret.
- [ ] WebhookUrl returned for operator to register externally.
- [ ] Channel-router can read & decrypt.
