# Developer Pre-Merge Checklist — OpenClaw Team Mode

> Use this checklist before opening a PR or merging any story in the `src/team/` overlay.
> Check every item that applies to the story being merged. Items marked **(ALL)** must pass
> on every PR regardless of which story is in scope.
>
> Source design: `/kalim/enterprise-simple-plan/`, stories in `/kalim/enterprise-prompt3-simple-output/02-stories/`.

---

## 1. Environment Setup Verification

- [ ] **`OPENCLAW_TEAM_MODE=1`** is set in your local `.env` or shell for all team-mode testing.
- [ ] **`OPENCLAW_GATEWAY_TOKEN`** is set to a non-empty value (required for legacy-fallback tests).
- [ ] **`OPENCLAW_TEAM_ADMIN_EMAIL`** and **`OPENCLAW_TEAM_ADMIN_PASSWORD`** are set for first-run bootstrap tests (password ≥ 12 chars).
- [ ] **`OPENCLAW_COOKIE_SECRET`** is set to a value ≥ 32 characters (required for channel-secret encryption; boot must fail without it in team mode).
- [ ] **`OPENCLAW_PUBLIC_BASE_URL`** is set to a reachable base URL (used in webhook URLs and invite links).
- [ ] **`OPENCLAW_HOME`** override tested: set `OPENCLAW_HOME=/tmp/oc-dev-test` and verify all team-mode files appear under that path.
- [ ] **Node version** is ≥ 22.5 (`node --version`). `crypto.hkdfSync` and `fs.promises` are both required.
- [ ] **`pnpm install`** completed without errors; `better-sqlite3` and `argon2` are present in `node_modules`.
- [ ] **`pnpm rebuild better-sqlite3`** run if the native prebuild fetch failed (Alpine/musl environments require this).
- [ ] TypeScript compilation passes with **zero errors**: `pnpm tsc --noEmit`.
- [ ] ESLint passes with **zero errors**: `pnpm eslint src/team/ src/gateway/auth.ts src/agents/agent-command.ts src/sessions/session-key-utils.ts src/plugins/plugin-loader.ts`.

---

## 2. Database Migrations

- [ ] `team.sqlite` is created at the expected path on first boot (check `getTeamSqlitePath()`).
- [ ] `PRAGMA user_version` returns the current schema version (1 for initial schema, 2 after workspace_channels table).
- [ ] All 6 core tables exist: `users`, `workspaces`, `user_sessions`, `api_tokens`, `channel_identities`, `channel_claims`.
- [ ] If Story 7.6 is merged: `workspace_channels` table also exists (schema v2).
- [ ] All indexes exist:
  - `idx_users_status`
  - `idx_user_sessions_user`, `idx_user_sessions_exp`
  - `idx_api_tokens_user`
  - `idx_channel_identities_user`
- [ ] **WAL mode active**: `.shm` and `.wal` files appear alongside `team.sqlite`.
- [ ] **Foreign key cascades verified**: deleting a user removes all linked rows from `user_sessions`, `api_tokens`, `channel_identities`, `channel_claims`.
- [ ] **Migration is idempotent**: running `migrate(db)` twice (i.e., restarting the process) produces no error and no duplicate tables.
- [ ] **Schema v2 idempotent** (if applicable): restarting after v2 migration produces no error; `PRAGMA user_version = 2`.
- [ ] Bootstrap admin creation is idempotent: second boot with same admin envs does NOT create a duplicate user.
- [ ] `OPENCLAW_TEAM_ADMIN_PASSWORD` is cleared from `process.env` after first-boot seeding (`process.env.OPENCLAW_TEAM_ADMIN_PASSWORD === undefined` after boot).

---

## 3. Auth Middleware Wired

- [ ] **Auth middleware chain order**: team-mode resolution fires **before** the existing `OPENCLAW_GATEWAY_TOKEN` / Tailscale / proxy / device-pairing chain in `src/gateway/auth.ts`.
- [ ] `POST /auth/login` with correct credentials returns 200 + `Set-Cookie: oc_session=…; HttpOnly; SameSite=Lax; Path=/`.
- [ ] `POST /auth/login` with wrong password returns 401; no cookie is set.
- [ ] `GET /auth/me` with a valid cookie returns the correct user JSON including `files` struct.
- [ ] `GET /auth/me` with a valid `ocp_…` bearer token returns the correct user JSON.
- [ ] `GET /auth/me` with the legacy gateway token returns `{ userId: 'admin', source: 'legacy' }` with **no** `files` field.
- [ ] `GET /auth/me` with no credentials returns 401.
- [ ] `POST /auth/logout` deletes the session from the DB; subsequent `GET /auth/me` with the same cookie returns 401.
- [ ] Disabled user (`status='disabled'`) cannot authenticate with any credential type.
- [ ] Expired session returns 401; `extendSession` is NOT called; session remains in DB for cleanup.
- [ ] **CSRF**: `POST /auth/login` and `POST /auth/logout` reject requests without the `X-Csrf` header that matches the `oc_csrf` cookie.
- [ ] `POST /auth/accept` with a valid invite token sets the password, auto-logs the user in (cookie set), and marks the token consumed.
- [ ] `POST /auth/accept` with a reused or expired token returns 400.
- [ ] `POST /auth/reset` with a valid reset token updates the password and invalidates all existing sessions.
- [ ] Team routes are **not** mounted when `OPENCLAW_TEAM_MODE` is unset (`GET /auth/me` returns 404, not 401).

---

## 4. File System Resolver Tested

- [ ] `resolveUserFiles(userId)` creates all required directories on first call:
  - `uploads/`, `conversations/`, `tmp/`, `tool_cache/`, `logs/`
- [ ] `SOUL.md` and `AGENTS.md` are copied from `base/` on the user's first request; they do NOT exist in `base/` → empty files created + warning logged.
- [ ] `MEMORY.md`, `USER.md`, `TASKS.md` created as empty files if absent.
- [ ] `tmp/` is **cleared** on every call (including subsequent calls); other directories and files are NOT overwritten.
- [ ] Function is idempotent: calling it 10 times for the same user produces identical results, no exceptions.
- [ ] Invalid `userId` values are rejected:
  - Contains `/` → throws `Error('invalid userId')`
  - Contains `..` → throws
  - Contains spaces → throws
  - Empty string → throws
- [ ] Concurrent calls for the same brand-new user (race condition) do not throw; directory creation is idempotent via `{ recursive: true }`.
- [ ] `base/` directory is bootstrapped on first boot: `base/SOUL.md`, `base/AGENTS.md`, `base/skills/`, `base/tools/` all exist.
- [ ] `base/` bootstrap is idempotent: no existing operator content is overwritten.
- [ ] `OPENCLAW_HOME` override is respected: all paths are under the override root.
- [ ] `getTeamSqlitePath()` returns path under the same root as `WORKSPACE_ROOT`.
- [ ] `appendMemory` appends a line and trims oldest lines when file exceeds 8192 bytes cap.
- [ ] `appendMemory` writes atomically (`.tmp` + rename); empty or whitespace-only input is a no-op.

---

## 5. Security Enforcement Active

- [ ] **`secureRead` boundary**: calling with a path outside `users/user_<userId>/` or `base/` throws `SecureFsViolationError`.
- [ ] **`secureWrite` boundary**: calling with a path outside `users/user_<userId>/` throws `SecureFsViolationError`.
- [ ] **`secureWrite` base/ write blocked**: any write attempt targeting `base/` throws `SecureFsViolationError` with `operation='write-to-base'`.
- [ ] **Path traversal blocked**: `secureRead('amit', 'users/user_amit/../user_priya/SOUL.md')` throws (resolved path is under priya's root, not amit's).
- [ ] **Prefix collision safe**: `secureRead('user1', 'users/user_10/SOUL.md')` throws; `path.sep` used in boundary check.
- [ ] `SecureFsViolationError` is always logged to OpenClaw's primary logger.
- [ ] `SecureFsViolationError` is also written to `<logsDir>/violations.log` as a JSONL entry with `{ ts, userId, op, attempted, resolved }`.
- [ ] **ESLint rule** for `no-restricted-imports` blocks bare `fs` usage in `src/team/` (except `secure-fs.ts` and `file-resolver.ts`). Run `pnpm eslint src/team/` and confirm zero violations.
- [ ] `validatePathSync` and `validateWritePathSync` are exported and synchronous (no I/O, no Promise).
- [ ] **Channel secrets encrypted at rest**: `config_encrypted` column starts with `v1.` (AES-256-GCM).
- [ ] **GCM tamper detection**: flipping one byte of `config_encrypted` causes `decryptSecret` to throw.
- [ ] **Boot fails without secret key**: `OPENCLAW_TEAM_MODE=1` with no `OPENCLAW_COOKIE_SECRET` (or < 32 chars) → process exits with clear error; does NOT start.
- [ ] **HMAC webhook verification**: WhatsApp POST with wrong signature → 401. Telegram POST with wrong secret-token header → 401. Missing header → 401 (hard fail, not soft fail).
- [ ] **Constant-time comparisons**: all secret comparisons use `crypto.timingSafeEqual` (verify in code review; cannot be tested purely at the integration level).

---

## 6. Plugin Restrictions Verified

- [ ] **`assertPluginTeamSafe` guard** is called in `plugin-loader.ts` before any plugin entry-point is invoked.
- [ ] A plugin **without** `team_safe: true` is skipped (not loaded) with a log message naming the plugin.
- [ ] A plugin **with** `team_safe: true` loads normally.
- [ ] Skipping an unsafe plugin does **not** crash the boot; other plugins load.
- [ ] Boot summary log emitted: `[team] plugins loaded: N, skipped (not team_safe): M, names=[…]`.
- [ ] When `OPENCLAW_TEAM_MODE` is unset, the guard is a no-op and all plugins load as before.
- [ ] `ctx.fs` proxy is available to plugins in team mode: `ctx.fs.readFile`, `ctx.fs.writeFile`, `ctx.fs.appendFile`, `ctx.fs.readdir`, `ctx.fs.stat`, `ctx.fs.mkdir`, `ctx.fs.rm`.
- [ ] `ctx.fs.writeFile` with a cross-user path throws `SecureFsViolationError` (proxy routes through `secureWrite`).
- [ ] `ctx.fs.writeFile` targeting `base/` throws `SecureFsViolationError`.
- [ ] `ctx.fs` is `undefined` when `OPENCLAW_TEAM_MODE` is off (existing plugins unaffected).
- [ ] **Known limitation documented**: a plugin importing `node:fs` directly can bypass the proxy; the `team_safe: true` flag is the operator's acknowledgment they've audited the plugin.

---

## 7. Channel Webhooks Validated

- [ ] **Telegram webhook registered**: `POST /webhooks/telegram/<wsId>` exists and returns non-404 in team mode.
- [ ] **WhatsApp webhook registered**: `GET /webhooks/whatsapp/<wsId>` (verification handshake) and `POST /webhooks/whatsapp/<wsId>` both exist.
- [ ] Telegram webhook verifies `X-Telegram-Bot-Api-Secret-Token` using `crypto.timingSafeEqual`; wrong secret → 401.
- [ ] WhatsApp webhook verifies `X-Hub-Signature-256` HMAC; wrong signature → 401; missing header → 401.
- [ ] WhatsApp GET verification handshake: correct `verify_token` + `hub.mode=subscribe` → 200 with `hub.challenge` echoed.
- [ ] **Raw body captured BEFORE JSON parsing** for both webhook routes (required for HMAC integrity).
- [ ] **Known sender dispatches**: `channel_identities` row found → `dispatch()` called with correct `userId`.
- [ ] **Unknown sender drops** (Mode A/B off, no auto-create): no reply, 200 returned to provider.
- [ ] **Claim flow**: `POST /team/identities/claim { channel }` returns 6-char `OC-` code; inbound `claim OC-…` message links the identity; code is single-use; code expires after 10 minutes.
- [ ] **Mode C auto-create**: workspace config `auto_create_guest_users=true` → unknown sender creates a guest user with email `<channel>:<id>@guest.local`; per-IP burst limit of 10 guests/min enforced.
- [ ] **Guest cannot log in**: `password_hash = '!disabled!'` never verifies against any password.
- [ ] **File streaming**: Telegram document or WhatsApp media message → file downloaded and written to user's `uploadsDir/` via `secureWrite`; `secureWrite` called BEFORE any bytes are fetched from the network.
- [ ] Upload size cap (25 MB default): over-cap files rejected with log entry; no partial write.
- [ ] Unsupported mime types (`application/x-msdownload`, etc.) rejected.
- [ ] **WhatsApp deduplication**: same `msg.id` arriving twice (Meta retry) dispatches only once.
- [ ] **Always 200 to Telegram**: Telegram webhook handler always returns 200 to Telegram to prevent retries, unless HMAC/signature fails.
- [ ] **Outbound reply**: agent response reaches the user's WhatsApp/Telegram (integration test — run at least once per channel).
- [ ] Channel-router errors logged to per-user `logsDir` as JSONL.

---

## 8. Admin APIs Working

- [ ] `GET /team/users` (admin) returns all users with `id, email, name, is_admin, status, created_at, last_seen_at`; passwords and hashes **never** exposed.
- [ ] `POST /team/users` (admin) creates an invite link; user row has `password_hash='!invite!'` sentinel.
- [ ] `POST /auth/accept` with valid invite token sets password, starts session.
- [ ] `DELETE /team/users/:id` (admin) sets `status='disabled'`; disabled user cannot log in; admin cannot disable themselves.
- [ ] `POST /team/users/:id/enable` (admin) sets `status='active'`; user can log in again.
- [ ] Non-admin attempting any of the above user-management endpoints receives 403.
- [ ] `GET /team/tokens` lists tokens without raw token value.
- [ ] `POST /team/tokens` creates token with `ocp_` prefix; raw token returned only once in the 201 response.
- [ ] `DELETE /team/tokens/:id` — cross-user delete returns 404; own token deleted successfully.
- [ ] `GET /team/identities` returns only the current user's channel mappings.
- [ ] `DELETE /team/identities/:id` — cross-user delete returns 404.
- [ ] `POST /team/identities` (admin Mode B) creates mapping; duplicate `(channel, externalId)` returns 409.
- [ ] `POST /team/workspaces` (admin) creates workspace; non-admin → 403.
- [ ] `PUT /team/workspaces/:id/channels/telegram` stores encrypted config; returns `webhookSecret` and `webhookUrl`.
- [ ] `PUT /team/workspaces/:id/channels/whatsapp` stores encrypted config; returns `webhookUrl` and `verifyToken`.
- [ ] Workspace channel config **never returned in plaintext** on subsequent GET.
- [ ] CLI `pnpm openclaw team:reset-password <email>` prints a valid reset link; unknown email → exit 1.
- [ ] `/login` HTML page renders without external resources; CSRF cookie set; `__CSRF__` placeholder replaced.
- [ ] `/team` HTML page: admin sees users and workspaces sections; non-admin does not.

---

## 9. Docker Build Passes

- [ ] `docker build -t openclaw-team .` exits 0.
- [ ] `docker run --rm openclaw-team node -e "require('better-sqlite3')"` exits 0 (native binding loads at runtime).
- [ ] `docker run --rm openclaw-team which gcc` exits non-zero (no compiler in final image).
- [ ] Final image size delta vs. previous build < +50 MB.
- [ ] `docker compose up -d` brings both `openclaw` and `caddy` containers online.
- [ ] `docker compose logs openclaw` shows `[team] team.sqlite migrated to v1` and `[team] bootstrap admin seeded:` on first run.
- [ ] `GET https://<DOMAIN>/login` returns 200 with a Caddy-issued TLS cert (Let's Encrypt).
- [ ] Security headers present in responses: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`.
- [ ] No services exposed beyond ports 80 and 443.
- [ ] Docker healthcheck status = `healthy` after container is up.
- [ ] State persists across `docker compose restart`: all user accounts, sessions, and channel mappings are intact.

---

## 10. Env Vars Documented

- [ ] Every env var used in `src/team/` is listed in `.env.example` with a one-line explanation.
- [ ] Every env var listed in `09-deployment-model/deployment.md` appears in `README.md`'s Team Mode section.

**Required env vars** (verify each is documented):

| Var | Documented in `.env.example` | Documented in `README.md` |
|---|---|---|
| `OPENCLAW_TEAM_MODE` | [ ] | [ ] |
| `OPENCLAW_GATEWAY_TOKEN` | [ ] | [ ] |
| `OPENCLAW_TEAM_ADMIN_EMAIL` | [ ] | [ ] |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` | [ ] | [ ] |
| `OPENCLAW_PUBLIC_BASE_URL` | [ ] | [ ] |
| `OPENCLAW_COOKIE_SECRET` | [ ] | [ ] |
| `OPENCLAW_TEAM_ALLOW_SIGNUP` | [ ] | [ ] |
| `OPENCLAW_TEAM_DATABASE_URL` | [ ] | [ ] |
| `OPENCLAW_HOME` | [ ] | [ ] |
| `OPENCLAW_TEAM_MAX_UPLOAD_BYTES` | [ ] | [ ] |

- [ ] `README.md` includes a "Backward compatibility" subsection confirming that unsetting `OPENCLAW_TEAM_MODE` restores single-user behavior.
- [ ] `README.md` includes a "When you outgrow this" pointer to `/kalim/enterprise-plan/`.
- [ ] `docs/team-backup.md` exists and covers: what to back up, crontab, off-host sync, restore procedure, RTO/RPO assumptions.

---

## 11. Regression: Single-User Mode Unaffected (ALL)

This check is **required on every PR**. It is the most important guard against scope creep.

- [ ] With `OPENCLAW_TEAM_MODE` **unset**: run the full existing OpenClaw test suite. **Zero test failures**.
- [ ] With `OPENCLAW_TEAM_MODE` **unset**: `GET /auth/me` returns 404 (route not mounted).
- [ ] With `OPENCLAW_TEAM_MODE` **unset**: `~/.openclaw/team.sqlite` is **not created**.
- [ ] With `OPENCLAW_TEAM_MODE` **unset**: the existing `OPENCLAW_GATEWAY_TOKEN` authenticates correctly.
- [ ] With `OPENCLAW_TEAM_MODE` **unset**: agent turns execute identically to today (no `team` field, no `secureRead`, no user-prefix on session keys).
- [ ] With `OPENCLAW_TEAM_MODE` **unset**: all channel extensions (`extensions/telegram/`, `extensions/whatsapp/`, etc.) work as before.
- [ ] With `OPENCLAW_TEAM_MODE` **unset**: no extra log lines appear from `src/team/`.

---

## 12. Code Review Checklist (ALL)

- [ ] All new files in `src/team/` are under 200 lines (per the design; larger = flag for review).
- [ ] All patches to existing files (`auth.ts`, `agent-command.ts`, `session-key-utils.ts`, `index.ts`, `server-http.ts`, `plugin-loader.ts`) are wrapped in `if (process.env.OPENCLAW_TEAM_MODE === '1')` or `if (teamCtx?.files)` guards.
- [ ] No SQL strings concatenated — all DB access uses `better-sqlite3` prepared statements.
- [ ] No raw token values logged (check for `console.log(token)`, `logger.info({ token })`, etc.).
- [ ] No secret blob values logged (check `encryptSecret` / `decryptSecret` call sites).
- [ ] `resolveUserFiles` is called exactly once per request (in `auth-middleware.ts`), not per file read or per tool call.
- [ ] `secureRead` / `secureWrite` are the only functions that access per-user file paths (enforced by ESLint; verify lint passes).
- [ ] No user input (cookie value, query param, request body) is ever interpolated into a file path.
- [ ] `crypto.timingSafeEqual` used for all secret comparisons (HMAC values, legacy gateway token, verify tokens).
- [ ] `argon2.hash` used with `{ type: argon2.argon2id }` option (not argon2d or argon2i).
- [ ] Cookie set with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when HTTPS.
- [ ] `base/` is never opened for writing by any code path in `src/team/` (validate via `grep` + `validateWritePath` review).

---

*This checklist must be fully checked before merging into `main`. Items marked (ALL) apply to every PR.*
