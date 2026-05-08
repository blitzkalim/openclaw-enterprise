# 04 — Auth Design

## Goal

Add **just enough** identity for a small team without breaking the existing `OPENCLAW_GATEWAY_TOKEN`. Three credential types, all optional, all minimal.

## Three Credentials

| Credential | Used by | Carried as | Resolves to |
|---|---|---|---|
| **Cookie session** | Humans in the browser (`/login`, `/team`) | `Cookie: oc_session=<id>` | `userId`, `workspaceId`, `isAdmin` |
| **API token** | Channel webhooks, scripts, CLI | `Authorization: Bearer ocp_<token>` | Same shape as cookie session |
| **Legacy gateway token** | Existing OpenClaw users, control UI | `Authorization: Bearer <gateway-token>` or device pairing | `userId='admin'`, `isAdmin=true` (synthetic owner) |

The first credential found is used. There is no JWT, no refresh-token rotation, no JWKS. We can graduate to those later if the project ever hosts strangers.

## Why Not JWT?

For a single-process install on one EC2:

- The gateway and the auth resolver are the same process. No service-to-service handshake.
- Stateful sessions in SQLite are simpler than rotating signed tokens, give us instant revocation (`DELETE FROM user_sessions WHERE id = …`), and remove the JWKS-distribution problem entirely.
- A 32-byte random session id is one SQLite row lookup per request. At 10 users, this is free.

The full enterprise plan (`/kalim/enterprise-plan/05-auth-design/`) adopts JWT + Redis because it expects multiple processes and tenants. We don't.

## Cookie Session Flow

```
POST /auth/login
  body: { email, password }
  → SELECT * FROM users WHERE email = ? AND status = 'active'
  → argon2.verify(password, password_hash)
  → INSERT INTO user_sessions (id, user_id, expires_at)
       id = randomBytes(32).hex()
       expires_at = now + 30 days
  → Set-Cookie: oc_session=<id>; HttpOnly; SameSite=Lax; Secure (when HTTPS); Path=/

POST /auth/logout
  → DELETE FROM user_sessions WHERE id = <cookie>
  → Set-Cookie clear

GET /auth/me
  → resolveTeamAuth(req) → user JSON or 401
```

Sessions are sliding: each request bumps `last_used_at` and extends `expires_at` by 30 days. A single cron tick (the existing OpenClaw cron) sweeps expired rows nightly.

## API Token Flow

A user with a cookie session can mint an API token from `/team/tokens`:

```
POST /team/tokens
  body: { name }
  → token = "ocp_" + randomBytes(24).base64url()
  → INSERT INTO api_tokens (id, user_id, name, hash, last_used_at)
       hash = sha256(token)
  → return token ONCE in response (only time it's shown)

DELETE /team/tokens/:id
  → DELETE FROM api_tokens WHERE id = ? AND user_id = ?
```

On every request: hash the bearer, look it up, attach `userId`. Constant-time compare not strictly needed because the lookup is by hash, not by string equality of the secret.

API tokens are **the credential channel webhooks use** (when we configure outbound calls or admin scripts). They are also the credential CLIs use.

## Backward Compatibility With `OPENCLAW_GATEWAY_TOKEN`

The existing token never goes away. It always works. It maps to a synthetic admin identity:

```ts
// src/team/auth-middleware.ts
export function resolveTeamAuth(req): TeamCtx | null {
  // 1. Cookie session
  const cookie = parseCookie(req, 'oc_session');
  if (cookie) {
    const row = db.prepare('SELECT user_id FROM user_sessions WHERE id = ? AND expires_at > ?').get(cookie, now());
    if (row) return loadUser(row.user_id);
  }

  // 2. API token
  const bearer = extractBearer(req);
  if (bearer?.startsWith('ocp_')) {
    const hash = sha256(bearer);
    const row = db.prepare('SELECT user_id FROM api_tokens WHERE hash = ?').get(hash);
    if (row) return loadUser(row.user_id);
  }

  // 3. Legacy gateway token → synthetic admin
  if (bearer && safeEqualSecret(bearer, process.env.OPENCLAW_GATEWAY_TOKEN)) {
    return { userId: 'admin', workspaceId: null, isAdmin: true, source: 'legacy' };
  }

  return null;
}
```

Then `src/gateway/auth.ts` does:

```ts
const teamCtx = resolveTeamAuth(req);
if (teamCtx) {
  req.team = teamCtx;
  return true; // authorized
}
return existingAuthLogic(req); // falls through to current Tailscale / proxy / device-token paths
```

Nothing in the existing token-resolution chain (`startup-auth.ts`, `auth-resolve.ts`, Tailscale, trusted proxy, device pairing) is removed. Team-mode credentials are **inserted ahead of** the existing chain, and the existing chain is the fallback.

## File Path Resolution (After Auth)

Every authenticated request that carries a real `userId` (not the synthetic `'admin'` legacy user) triggers file resolution **immediately after the credential is verified**, before the request proceeds to any handler.

```ts
// src/team/auth-middleware.ts — updated resolveTeamAuth()
export async function resolveTeamAuth(req): Promise<TeamCtx | null> {
  const ctx = resolveCredential(req);   // cookie / API token / legacy (unchanged logic)
  if (!ctx) return null;

  // NEW: resolve per-user overlay files for real users only
  if (ctx.userId !== 'admin') {
    ctx.files = await resolveUserFiles(ctx.userId);
  }

  return ctx;
}
```

This is a **+5 line addition** to the existing `resolveTeamAuth` function. No other changes to auth middleware.

### `UserFiles` Type Contract

```ts
type UserFiles = {
  // Seeded from base/ on first use (never overwritten after that)
  soulPath:         string;
  agentsPath:       string;
  // Created empty on first use
  memoryPath:       string;
  userProfilePath:  string;   // USER.md
  tasksPath:        string;   // TASKS.md
  // Directories — created on first use; tmp/ cleared every call
  uploadsDir:       string;
  conversationsDir: string;
  tmpDir:           string;
  toolCacheDir:     string;
  logsDir:          string;
};
```

The function `resolveUserFiles` is **idempotent** for all fields except `tmpDir` (which is
cleared each call). Files are only seeded on the first call; subsequent calls return the
same paths without overwriting content.

### Secure FS — All File I/O Goes Through the Wrapper

After `resolveUserFiles` attaches paths to `req.team.files`, all agent-layer reads and
writes use the **Secure FS** wrapper from `src/team/secure-fs.ts`:

```ts
// Reading a user file:
const memory = await secureRead(ctx.team.userId, ctx.team.files.memoryPath);

// Writing a user file:
await secureWrite(ctx.team.userId, ctx.team.files.memoryPath, newContent, { append: true });
```

`secureRead` and `secureWrite` call `path.resolve()` on the target, then verify the
resolved path starts with `workspace/users/user_<userId>/` (for reads) or the same root
excluding `base/` (for writes). Any violation throws `SecureFsViolationError` immediately
— the request is aborted with a 500 before any file I/O occurs.

### Why Resolution Happens in Auth, Not the Agent Layer

- **Every code path gets it automatically.** HTTP requests, WebSocket connections, and channel webhooks all go through `resolveTeamAuth`. If resolution were in the agent layer, a future code path could forget to call it.
- **Fail early.** If the disk is full or `base/SOUL.md` is missing, the error surfaces as a 500 before any LLM credit is spent.
- **Single responsibility.** The agent runtime receives `ctx.team.files` as a fully-resolved, ready-to-use struct — it never needs to know how paths are constructed.

### user_id Must Always Be Passed to the File Resolver

The path construction is `workspace/users/user_<userId>/`. The `userId` value comes exclusively from the auth resolution step — it is never taken from request body, query string, or headers. This is the guarantee that prevents path traversal.

## Login UI

Two minimal HTML pages, server-rendered, no React, no build step:

| Path | Page | Lines |
|---|---|---|
| `/login` | Email + password form, posts to `/auth/login` | ~60 |
| `/team` | Lists users, lets admin invite/disable, lets any user manage their own API tokens, lets any user manage their own channel identities | ~200 |

These pages live in `src/team/web/` and are served as plain HTML strings. The existing React control UI under `ui/` is unchanged. If you want a fancier admin UI, that's the big plan, not this one.

## Password Storage

- Argon2id (preferred) via `argon2` npm package, or scrypt via Node built-in `crypto.scrypt` if we want zero new deps.
- Cost factors: defaults are fine; we are not at scale where tuning matters.
- Reset flow: **out of band**. An admin can use a CLI command (`pnpm openclaw team:reset-password <email>`) that prints a one-time token; the user opens `/auth/reset?token=…` and sets a new password.

We do **not** ship email reset flows, OAuth, or MFA in this plan. They are listed in `/kalim/enterprise-plan/05-auth-design/auth-system.md` and remain available when the project grows.

## Rate Limiting

OpenClaw already has `src/gateway/auth-rate-limit.ts` for failed-token attempts. We reuse it: failed `/auth/login` attempts increment the same counter, keyed by IP. No new infra.

## Security Properties (What We Get / Don't Get)

| Property | This plan | Notes |
|---|---|---|
| Password hashing | ✅ Argon2id | |
| Session revocation | ✅ Instant | DELETE row in SQLite |
| Cross-site request forgery | ✅ Cookie is `SameSite=Lax`, write methods require a CSRF token in the form | |
| Replay-resistant sessions | ⚠️ Sliding 30 days, no per-request rotation | OK for small team |
| Stolen-cookie binding (device fingerprint) | ❌ No | The big plan covers this |
| MFA | ❌ No | Out of scope |
| OAuth (Google, GitHub) | ❌ No | Out of scope |
| Password reset by email | ❌ No | Admin CLI only |
| Audit logs | ⚠️ Basic | We log auth events to OpenClaw's existing logger; no immutable audit table |

This is the deliberate cut: **Argon2 + sticky session + revocation + admin CLI reset** is the floor for "shipped" auth. Everything fancier waits.
