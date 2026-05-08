# QA Sign-Off Checklist — OpenClaw Team Mode

> This checklist is the QA acceptance gate before any release of the team-mode overlay.
> A QA engineer (or a developer performing QA) must work through every section and mark
> each item PASS, FAIL, or N/A (with a reason). The release is blocked until all
> non-N/A items are PASS.
>
> Source design: `/kalim/enterprise-simple-plan/` (sections 00–13).
> Reference test cases: `/kalim/enterprise-prompt3-simple-output/04-test-plans/test-cases.md`.

---

## How to Use This Checklist

1. Stand up the system in a clean test environment (fresh VM, no prior `team.sqlite`).
2. Use the `.env.example` as the starting point; fill in real test values.
3. Work through each section in order.
4. For each item, mark: ✅ PASS | ❌ FAIL (note the failure) | — N/A (with reason)
5. All failures must be resolved and re-tested before sign-off.
6. The "Regression" section at the end must always be run last, with `OPENCLAW_TEAM_MODE` unset.

---

## Section 1 — Authentication Flows

### 1.1 Login

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-1.01 | Admin login via /login page | Browse to `/login`; submit valid admin credentials | 200 HTML; `oc_session` cookie set; redirect to `/team` | |
| QA-1.02 | Login with wrong password | Submit invalid password | 401; inline error shown; no cookie set | |
| QA-1.03 | Login rate limiting | Submit wrong password 6+ times for same email from same IP | After 5 failures, requests back off; rate-limit counter incremented | |
| QA-1.04 | Login with disabled account | Disable a user; attempt login | 401 "invalid_credentials"; even with correct password | |
| QA-1.05 | Login returns correct user JSON | Login via `POST /auth/login` directly | 200 `{ user: { id, email, name, isAdmin, workspaceId } }` | |
| QA-1.06 | Cookie has correct attributes | Inspect cookie header after login | `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`; `Secure` present if HTTPS | |
| QA-1.07 | CSRF protection on login | POST `/auth/login` without `X-Csrf` header | 403 or 401; credentials not processed | |
| QA-1.08 | Login page has no external resources | Open DevTools Network tab; load `/login` | Zero requests to any external domain; no CDN, no Google Fonts | |

### 1.2 Logout

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-1.09 | Logout clears session in DB | Login; `POST /auth/logout`; query `user_sessions` table | Session row deleted | |
| QA-1.10 | Cookie cleared after logout | Inspect response header after logout | `Set-Cookie: oc_session=; HttpOnly; Path=/; Max-Age=0` | |
| QA-1.11 | /auth/me returns 401 after logout | Login; logout; `GET /auth/me` | 401 | |
| QA-1.12 | Logout button on /team page | Click "Logout" on `/team`; observe browser | Redirects to `/login` | |

### 1.3 Token-Based Auth

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-1.13 | Create API token | Login; `POST /team/tokens { name: 'test' }` | 201 `{ id, name, token: 'ocp_…', created_at }` | |
| QA-1.14 | Token authenticates to /auth/me | Use returned token as `Authorization: Bearer ocp_…`; `GET /auth/me` | 200 with `source: 'api-token'` | |
| QA-1.15 | Token list never shows raw token | `GET /team/tokens` after creation | Response has `id, name, last_used_at, created_at` but NO `token` field | |
| QA-1.16 | Token revocation works | `DELETE /team/tokens/:id`; use old token against `/auth/me` | 204 on delete; subsequent use → 401 | |
| QA-1.17 | Cross-user token delete blocked | User A tries to delete User B's token id | 404; token unchanged | |

### 1.4 Legacy Gateway Token Compatibility

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-1.18 | Legacy token still works in team mode | `OPENCLAW_TEAM_MODE=1`; `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>` | `/auth/me` returns `{ userId: 'admin', source: 'legacy', isAdmin: true }` | |
| QA-1.19 | Legacy token has no `files` field | Same as above | `files` is absent from the response | |
| QA-1.20 | Legacy token can access existing gateway methods | Use legacy token for any existing OpenClaw API call | 200; existing functionality unaffected | |

### 1.5 Password Reset

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-1.21 | CLI generates reset link | `pnpm openclaw team:reset-password <email>` | Prints "Reset link (valid until …): https://…/auth/reset?token=OC-…" | |
| QA-1.22 | Reset link sets new password | Open reset URL; `POST /auth/reset { token, newPassword }` | 200; session cookie set; can log in with new password | |
| QA-1.23 | Reset invalidates old sessions | After reset; try old `oc_session` cookie | 401; old session gone | |
| QA-1.24 | Reset token is single-use | Reuse the reset token after successful reset | 400 "Invalid or expired…" | |
| QA-1.25 | Reset for unknown email | `pnpm openclaw team:reset-password nobody@x.com` | Exit 1; "no such user" message | |

### 1.6 User Invite Flow

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-1.26 | Admin invites new user | Admin: `POST /team/users { email: 'new@x.com' }` | 201 with `inviteLink` containing `OC-` token | |
| QA-1.27 | Invited user sets password | Open invite link; `POST /auth/accept { token, password: 'Str0ngPass-2026' }` | 200; session cookie set; user can log in | |
| QA-1.28 | Invite token is single-use | Reuse invite token | 400 | |
| QA-1.29 | Non-admin cannot invite | Non-admin: `POST /team/users` | 403 | |
| QA-1.30 | Admin cannot disable self | Admin: `DELETE /team/users/<own-id>` | 400 "Admin cannot disable themselves" | |
| QA-1.31 | Disabled user cannot log in | Admin disables a user; user attempts login | 401 | |
| QA-1.32 | Re-enabled user can log in | Admin re-enables a user; user attempts login | 200 + cookie | |

---

## Section 2 — File Isolation (No Cross-User Access)

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-2.01 | New user gets own directory | Login as User A for the first time | `~/.openclaw/workspace/users/user_<A-id>/` created with SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md, and 5 directories | |
| QA-2.02 | SOUL.md seeded from base/ | Inspect new user's SOUL.md | Content identical to `base/SOUL.md` | |
| QA-2.03 | User's SOUL.md not overwritten on second login | Modify user's SOUL.md; log out and back in | Modified content preserved | |
| QA-2.04 | tmp/ cleared on each session | Put a file in user's `tmp/`; log out and back in | `tmp/` is empty; other dirs unchanged | |
| QA-2.05 | User A cannot read User B's MEMORY.md | Simulate or instrument secureRead attempt to User B's path | `SecureFsViolationError` thrown; violation logged | |
| QA-2.06 | User A cannot write to User B's directory | Any write attempt crossing user boundary | `SecureFsViolationError` thrown; User B's files unchanged | |
| QA-2.07 | Agent session history isolated | User A and User B both chat; inspect `~/.openclaw/sessions/` | Files are `u:<A-id>:…` and `u:<B-id>:…`; no shared session file | |
| QA-2.08 | Vector memory isolated | User A writes a vector memory entry; query as User B | User B gets zero results from User A's data | |
| QA-2.09 | base/ never written at runtime | Trigger several agent turns; inspect base/ | base/ contents identical to before the turns | |
| QA-2.10 | Uploads isolated per user | User A and User B each upload a PDF named `doc.pdf` | Files land in separate `users/user_<id>/uploads/` directories; no collision | |
| QA-2.11 | Path traversal via secureRead blocked | (Integration) Configure a test that calls secureRead with `../../` traversal | SecureFsViolationError; violation.log entry written | |
| QA-2.12 | Violation.log entry written | Trigger any SecureFsViolationError | `<logsDir>/violations.log` gains a JSONL line with `{ ts, userId, op, attempted, resolved }` | |

---

## Section 3 — Channel Routing (WhatsApp + Telegram)

### 3.1 Telegram

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-3.01 | Telegram webhook route exists | Team mode on; check `/webhooks/telegram/<wsId>` | Route exists; returns something other than 404 | |
| QA-3.02 | Correct secret → message dispatched | POST with correct `X-Telegram-Bot-Api-Secret-Token` and a known sender identity | 200; dispatch invoked; agent processes the message | |
| QA-3.03 | Wrong secret → 401 | POST with wrong secret | 401 | |
| QA-3.04 | Missing secret header → 401 | POST without `X-Telegram-Bot-Api-Secret-Token` | 401 (hard fail) | |
| QA-3.05 | No-message update → 200, no dispatch | POST `{"update_id":1}` (no message key) | 200 OK; no agent call | |
| QA-3.06 | Unknown sender drops silently | POST from a sender not in channel_identities | 200; no reply; log entry | |
| QA-3.07 | Claim flow — Telegram | User gets claim code via `/team`; sends `claim OC-XXXXXX` via Telegram | Bot replies "Linked!"; `channel_identities` row created | |
| QA-3.08 | Claim code is single-use | Send same claim code twice | Second attempt → "Invalid or expired claim code." | |
| QA-3.09 | Claim code expires in 10 minutes | Wait 11 minutes; send expired code | "Invalid or expired claim code." | |
| QA-3.10 | Telegram document download | Send a PDF via Telegram | File appears at `users/user_<id>/uploads/<ts>_<fileId>.pdf`; agent receives attachment | |

### 3.2 WhatsApp

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-3.11 | GET verification handshake | `GET /webhooks/whatsapp/<wsId>?hub.mode=subscribe&hub.verify_token=…&hub.challenge=42` | 200 with body `42` | |
| QA-3.12 | Handshake fails with wrong verify_token | Same but wrong token | 403 | |
| QA-3.13 | Valid HMAC → message dispatched | POST with correctly-computed `X-Hub-Signature-256` | 200; dispatch invoked | |
| QA-3.14 | Invalid HMAC → 401 | Tamper the request body or HMAC header | 401 | |
| QA-3.15 | Missing HMAC header → 401 | No `X-Hub-Signature-256` header | 401 | |
| QA-3.16 | Status update ignored | POST a `statuses` update (no `messages` array) | 200; no dispatch | |
| QA-3.17 | Duplicate message deduped | POST the same `msg.id` twice | Dispatch called exactly once | |
| QA-3.18 | WhatsApp document download | Send a document via WhatsApp | File appears in user's `uploadsDir`; agent receives attachment | |
| QA-3.19 | Reply reaches WhatsApp sender | Agent generates a reply | Outbound message sent to the user's WhatsApp number | |

### 3.3 Sender Mapping Modes

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-3.20 | Mode B admin-assign | Admin: `POST /team/identities { userId, channel, externalId }` | 201; subsequent messages from that sender resolve to the user | |
| QA-3.21 | Mode C auto-create guest | Workspace: `auto_create_guest_users=true`; unknown sender messages | Guest user created with email `<channel>:<id>@guest.local`; dispatch called | |
| QA-3.22 | Guest cannot log in | Try to log in with guest email | 401; `!disabled!` hash never verifies | |
| QA-3.23 | Mode C per-IP burst limit | 11 unknown senders from one IP in 1 minute | 10 guests created; 11th dropped | |
| QA-3.24 | Mode C off — unknown sender drops | Workspace: `auto_create_guest_users=false`; unknown sender | 200; no user created; no reply | |

---

## Section 4 — Security

### 4.1 Path Traversal Blocked

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-4.01 | Traversal via secureRead blocked | Call `secureRead('user1', 'users/user_1/../user_2/SOUL.md')` in a test | `SecureFsViolationError` | |
| QA-4.02 | Absolute path outside workspace blocked | Call `secureRead('user1', '/etc/passwd')` | `SecureFsViolationError` | |
| QA-4.03 | Traversal via file_id in media download | Send Telegram file with `file_id = '../../../../etc/passwd'` | `secureWrite` rejects path before any bytes fetched | |
| QA-4.04 | Prefix collision safe | userId `1` trying to access `user_10` via path construction | `SecureFsViolationError`; boundary uses `path.sep` | |

### 4.2 Plugin FS Blocked

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-4.05 | Plugin ctx.fs cross-user write blocked | Plugin calls `ctx.fs.writeFile('/workspace/users/user_other/MEMORY.md', 'x')` | `SecureFsViolationError` | |
| QA-4.06 | Plugin ctx.fs write to base/ blocked | Plugin calls `ctx.fs.writeFile('/workspace/base/SOUL.md', 'x')` | `SecureFsViolationError` | |
| QA-4.07 | Unsafe plugin not loaded | Plugin without `team_safe: true` | Plugin skipped; boot continues; log message names the plugin | |
| QA-4.08 | Unsafe plugin does not crash boot | One unsafe plugin among several safe ones | Boot completes; other plugins load | |

### 4.3 Injection

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-4.09 | SQL injection via message body | WhatsApp message: `'; DROP TABLE users; --` | Message treated as plain text; no DB modification | |
| QA-4.10 | Shell injection via message body | Telegram message: `` `rm -rf /` `` | Message treated as string; no shell execution | |
| QA-4.11 | XSS in display name | Channel sender has display_name `<script>alert(1)</script>` | Name stored as text; HTML-escaped in any UI context | |

### 4.4 Expired Session

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-4.12 | Expired session cookie returns 401 | Manually set `expires_at` to past; use the cookie | `resolveTeamAuth` returns null; 401 | |
| QA-4.13 | Active session not expired prematurely | Normal login; use cookie repeatedly within 30 days | Session extended; continues to work | |

### 4.5 Cross-User Access

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-4.14 | User A cannot see User B's tokens | User A: `GET /team/tokens`; User B has tokens | Only User A's tokens in response | |
| QA-4.15 | User A cannot delete User B's token | User A: `DELETE /team/tokens/<user-B-token-id>` | 404 | |
| QA-4.16 | User A cannot see User B's identities | User A: `GET /team/identities` | Only User A's identities | |
| QA-4.17 | User A cannot delete User B's identity | User A: `DELETE /team/identities/<user-B-id>` | 404 | |
| QA-4.18 | Non-admin cannot access user list | Non-admin: `GET /team/users` | 403 | |

### 4.6 Channel Signature Verification

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-4.19 | WhatsApp HMAC mismatch → 401 | Tamper body after HMAC computed | 401 | |
| QA-4.20 | WhatsApp missing signature header → 401 | No `X-Hub-Signature-256` | 401 | |
| QA-4.21 | Telegram missing secret header → 401 | No `X-Telegram-Bot-Api-Secret-Token` | 401 | |
| QA-4.22 | Channel secret tamper detected on decrypt | Flip a byte of stored `config_encrypted` | `decryptSecret` throws; webhook does not process | |
| QA-4.23 | Boot fails without OPENCLAW_COOKIE_SECRET | Unset `OPENCLAW_COOKIE_SECRET`; boot team mode | Process exits with clear error message | |

---

## Section 5 — Admin UI (CRUD for Users, Tokens, Identities)

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-5.01 | /team page loads for admin | Login as admin; navigate to `/team` | 200; users section and workspaces section visible | |
| QA-5.02 | /team page loads for non-admin | Login as non-admin; navigate to `/team` | 200; users and workspaces sections absent from DOM | |
| QA-5.03 | Invite user from /team UI | Click invite; enter email; submit | Invite link displayed in UI | |
| QA-5.04 | Disable user from /team UI | Click disable button for a user | User status changes to "disabled" in the list | |
| QA-5.05 | Re-enable user from /team UI | Click enable button for a disabled user | User status changes to "active" | |
| QA-5.06 | Create API token from /team UI | Click "Create token"; enter name; submit | Token shown once with copy icon; listed in tokens section without the raw value | |
| QA-5.07 | Revoke API token from /team UI | Click delete on a token | Token removed from list; old token value → 401 | |
| QA-5.08 | Link Telegram from /team UI | Click "Link Telegram"; observe claim code | Code displayed with TTL countdown; code format is `OC-XXXXXX` | |
| QA-5.09 | Link WhatsApp from /team UI | Click "Link WhatsApp" | Similar claim flow to Telegram | |
| QA-5.10 | Remove identity from /team UI | Click delete on a channel identity | Identity removed; subsequent messages from that sender → unknown sender drop | |
| QA-5.11 | Create workspace from /team UI | Admin: click "New workspace"; enter name | Workspace appears in list | |
| QA-5.12 | Configure Telegram channel from /team UI | Admin: click "Edit" on workspace; enter bot token + webhook secret | Success message; webhook URL displayed; bot token NOT shown on subsequent view | |
| QA-5.13 | Configure WhatsApp channel from /team UI | Admin: enter WhatsApp credentials | Success; credentials NOT shown on subsequent view | |
| QA-5.14 | Non-admin cannot access workspace config | Non-admin opens /team | Workspaces section absent; direct API calls return 403 | |
| QA-5.15 | Logout button works | Click Logout | Redirected to /login; subsequent /auth/me → 401 | |

---

## Section 6 — Deployment (Docker, Env Vars, Startup)

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-6.01 | docker compose up from scratch | Fresh VM; `cp .env.example .env`; fill values; `docker compose up -d` | Both services start; no error in logs | |
| QA-6.02 | Bootstrap admin seeded on first run | Check `docker compose logs openclaw` | `[team] bootstrap admin seeded: <email>` log line present | |
| QA-6.03 | First-run login works | Browse to `https://<DOMAIN>/login`; submit admin creds | 200; redirect to `/team` | |
| QA-6.04 | TLS cert issued | Check cert in browser | Valid certificate from Let's Encrypt; no browser warning | |
| QA-6.05 | State persists across restart | Perform actions; `docker compose restart`; log in again | All data intact | |
| QA-6.06 | No ports exposed beyond 80/443 | `docker compose ps` or port scan | No 8080, 5432, 6379, or other ports exposed | |
| QA-6.07 | Security headers present | `curl -I https://<DOMAIN>/login` | `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` all present | |
| QA-6.08 | Healthcheck passes | `docker inspect <openclaw-container>` | Health status = `healthy` | |
| QA-6.09 | team:reset-password CLI works inside container | `docker exec openclaw pnpm openclaw team:reset-password admin@x.com` | Reset link printed to stdout | |
| QA-6.10 | Backup procedure produces valid backup | Run the cron backup command manually | `team-<date>.sqlite` and `workspace-<date>/` created in backup directory | |
| QA-6.11 | Restore from backup works | Stop container; restore volume from backup; start | Login works; all channel mappings present | |
| QA-6.12 | All env vars in .env.example documented | Open `.env.example` | Every required env var listed with comment | |
| QA-6.13 | README Team Mode section complete | Open `README.md` | Team Mode section present; all 10 env vars listed; quick-start steps accurate | |

---

## Section 7 — Edge Cases (Expired Session, Invalid Sig, Concurrent Access)

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-7.01 | Expired session mid-usage | Artificially expire session; make a request | 401 immediately; no partial work done | |
| QA-7.02 | Invalid JSON in webhook body | POST webhook with malformed JSON | 400; no dispatch; no crash | |
| QA-7.03 | Empty request body on POST /auth/login | POST with empty body | 400 or 422 with validation error | |
| QA-7.04 | Concurrent sessions for same user | User opens 2 browser tabs; both send requests simultaneously | Both succeed independently; no data corruption | |
| QA-7.05 | Two users chat concurrently | User A and User B send WhatsApp messages at same time | Both get correct, isolated replies; no cross-contamination | |
| QA-7.06 | Memory write race condition | Two agent turns for same user with `<memory>` blocks; concurrent | Both memory lines persisted; no lost update | |
| QA-7.07 | Upload over size cap | Send a 30 MB file | File rejected; "over size cap" log; no partial write; user's uploadsDir unchanged | |
| QA-7.08 | Unsupported mime type upload | Send a `.exe` or `.zip` file | File rejected; "unsupported mime" log; no file created | |
| QA-7.09 | WhatsApp Meta retry (duplicate msg.id) | Same webhook payload POSTed twice | Agent called once; second POST 200 but no dispatch | |
| QA-7.10 | Telegram update with no message field | `{ "update_id": 1, "inline_query": { … } }` | 200; silently ignored; no crash | |
| QA-7.11 | Claim code used on wrong channel | Issue Telegram claim; try to claim via WhatsApp | "Invalid or expired claim code." | |
| QA-7.12 | Guest user receives second message | Guest user already created; messages again | No duplicate user; existing identity resolves; dispatch called | |
| QA-7.13 | Plugin boot failure (one bad plugin) | One plugin with `team_safe: true` but broken entry | Broken plugin skipped; boot continues; other plugins load | |
| QA-7.14 | OPENCLAW_TEAM_ADMIN_PASSWORD too short | Set password to 10 chars; boot | Warning logged; no admin created; boot continues | |
| QA-7.15 | Invite link expired (> 7 days) | Attempt to accept an invite after 7 days | 400 "Invalid or expired invite link" | |
| QA-7.16 | Reset password length too short | POST `/auth/accept { token, password: 'short' }` | 400 with validation error | |
| QA-7.17 | base/SOUL.md missing at boot | Delete `base/SOUL.md`; boot | Warning logged; user SOUL.md created as empty; system operational | |
| QA-7.18 | Tampered channel secret in DB | Flip a byte of `config_encrypted` in SQLite | Webhook fires → "secret integrity failed" error; webhook does not process | |

---

## Section 8 — Regression: Team Mode Off = Identical Single-User Behavior

> This section **must be run last**, with `OPENCLAW_TEAM_MODE` unset.

| # | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QA-8.01 | Full existing test suite passes | Unset `OPENCLAW_TEAM_MODE`; run `pnpm test` | Zero test failures | |
| QA-8.02 | No team.sqlite created | Boot with team mode off | No `team.sqlite` file in `~/.openclaw/` | |
| QA-8.03 | /auth/me returns 404 | Team mode off; `GET /auth/me` | 404 (route not mounted) | |
| QA-8.04 | /team returns 404 | Team mode off; `GET /team` | 404 (route not mounted) | |
| QA-8.05 | Existing gateway token works | Team mode off; `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>` | Normal OpenClaw access granted | |
| QA-8.06 | No team log lines | Team mode off; run OpenClaw and check logs | Zero `[team]` log lines | |
| QA-8.07 | Agent turns work as before | Team mode off; run an agent turn | Agent responds normally; no user-prefix in session key | |
| QA-8.08 | Existing extensions unaffected | Team mode off; use Telegram/WhatsApp extensions normally | Extensions work as before (single-user Baileys / single-user Telegram) | |
| QA-8.09 | workspace directory not created | Boot with team mode off | No `~/.openclaw/workspace/` directory created | |
| QA-8.10 | Rollback by unsetting env var | Enable team mode; create users; unset `OPENCLAW_TEAM_MODE`; restart | OpenClaw starts in single-user mode; team DB untouched but ignored; all existing OpenClaw data intact | |

---

## Sign-Off Record

| Field | Value |
|---|---|
| QA Engineer | |
| Date | |
| Build / Tag | |
| Environment | |
| All items PASS? | [ ] Yes — release approved [ ] No — blocked (list failures below) |

**Failures (if any)**:

| # | Test ID | Description | Notes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

**Release Decision**: [ ] Approved [ ] Blocked pending fixes

Signed: _____________________________ Date: _____________

---

*All 130+ test cases in this checklist map directly to the design in `/kalim/enterprise-simple-plan/`
and to the detailed test cases in `04-test-plans/test-cases.md`. Any new feature added to
`src/team/` must have a corresponding QA checklist item added here before the feature is
considered complete.*
