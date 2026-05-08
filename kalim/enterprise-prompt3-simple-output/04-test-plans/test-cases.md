# Test Cases — OpenClaw Team Mode

> Source design: `/kalim/enterprise-simple-plan/` (sections 00–13).
> Source stories: `/kalim/enterprise-prompt3-simple-output/02-stories/`.
>
> This file is the complete test matrix for all 8 epics. It covers functional tests,
> security tests, and failure/edge-case scenarios. Use it as the QA test plan and
> as the definition of done for each story.
>
> **Format**: Test ID | Category | Epic/Story | Test Description | Input | Expected Output | Pass Criteria

---

## Legend

| Column | Meaning |
|---|---|
| **Test ID** | Unique identifier (format: `T-<epic>.<seq>`) |
| **Category** | `Functional`, `Security`, `Edge Case`, `Regression`, `Integration` |
| **Story** | Epic + story number |
| **Test Description** | What is being tested |
| **Input** | HTTP request, env var, or data state used |
| **Expected Output** | HTTP status, response body, side effects |
| **Pass Criteria** | What must be true for the test to be marked PASS |

---

## EPIC 1 — Authentication & Identity Layer

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-1.01 | Functional | 1.1 | Team SQLite created on first boot | `OPENCLAW_TEAM_MODE=1`; no existing `team.sqlite` | `~/.openclaw/team.sqlite` created | File exists; all 6 tables present; `PRAGMA user_version = 1` |
| T-1.02 | Functional | 1.1 | Bootstrap admin seeded on first boot | Empty `users` table; `OPENCLAW_TEAM_ADMIN_EMAIL=admin@x.com`; `OPENCLAW_TEAM_ADMIN_PASSWORD=Test-Passw0rd-123` | One user row with `is_admin=1`, valid Argon2id hash | `findUserByEmail('admin@x.com')` returns row; `argon2.verify(hash, 'Test-Passw0rd-123')` returns true |
| T-1.03 | Functional | 1.1 | Bootstrap is idempotent | Restart with same admin envs; existing `users` row | No duplicate user created | Still exactly one row with that email |
| T-1.04 | Functional | 1.1 | Team mode off — no DB, no routes | `OPENCLAW_TEAM_MODE` unset | No `team.sqlite` created; `GET /auth/me` returns 404 | Existing OpenClaw test suite passes; no side effects |
| T-1.05 | Functional | 1.2 | All 6 tables exist after migration | Fresh DB + `migrate(db)` called | Tables: users, workspaces, user_sessions, api_tokens, channel_identities, channel_claims | All 6 tables present; all indexes exist; WAL mode active |
| T-1.06 | Functional | 1.2 | Migration is idempotent | Call `migrate(db)` twice | No error; `PRAGMA user_version` still `1` | No duplicate tables, no exception |
| T-1.07 | Functional | 1.2 | FK cascade on user delete | Delete a user with linked sessions, tokens, identities | All linked rows deleted from all 4 tables | Zero orphan rows in any child table |
| T-1.08 | Security | 1.2 | UNIQUE constraint on channel_identities | Insert same `(channel, external_id)` twice | Second insert fails with UNIQUE constraint | SQLite throws; application handles gracefully (409) |
| T-1.09 | Functional | 1.3 | Cookie session resolves correct user | Create user + session; set cookie `oc_session=<id>` | `resolveTeamAuth` returns `{ userId, source: 'cookie' }` | `userId` matches the seeded user; `files` struct has all 10 paths |
| T-1.10 | Functional | 1.3 | API token resolves correct user | Create user + API token `ocp_…`; set `Authorization: Bearer ocp_…` | `resolveTeamAuth` returns `{ source: 'api-token' }` | `userId` matches token owner |
| T-1.11 | Functional | 1.3 | Legacy gateway token resolves synthetic admin | Set `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>` | `resolveTeamAuth` returns `{ userId: 'admin', source: 'legacy', isAdmin: true }` | No `files` field on result (admin is synthetic) |
| T-1.12 | Security | 1.3 | Disabled user cannot authenticate | User has `status='disabled'`; valid cookie exists | `resolveTeamAuth` returns `null` | Request fails with 401; session not extended |
| T-1.13 | Security | 1.3 | Expired session returns null | Session `expires_at` < now | `resolveTeamAuth` returns `null`; `extendSession` NOT called | 401 returned; session remains in DB (admin would clean up) |
| T-1.14 | Security | 1.3 | Bad cookie returns null | Cookie value does not match any session | `resolveTeamAuth` returns `null` | 401 |
| T-1.15 | Regression | 1.4 | Legacy auth unaffected when team mode off | `OPENCLAW_TEAM_MODE` unset; `Authorization: Bearer <gateway-token>` | Existing gateway allows request | Existing `auth.test.ts` tests pass unchanged |
| T-1.16 | Functional | 1.4 | Team auth fires before legacy chain | `OPENCLAW_TEAM_MODE=1`; valid cookie set | Team ctx resolved; `req.team.source = 'cookie'` | Gateway allows request; `req.team` populated |
| T-1.17 | Functional | 1.5 | POST /auth/login succeeds with correct credentials | `POST /auth/login { email, password }` | 200; `Set-Cookie: oc_session=…; HttpOnly; SameSite=Lax` | Cookie set; response body includes `user.id`, `user.email` |
| T-1.18 | Security | 1.5 | POST /auth/login fails with wrong password | `POST /auth/login { email, wrongPassword }` | 401 `{ error: 'invalid_credentials' }` | No cookie set; rate-limit counter incremented |
| T-1.19 | Security | 1.5 | POST /auth/login rate-limits after 5 failures | 6 consecutive bad-password attempts | 6th attempt still returns 401 but with a back-off delay | Rate-limit counter persists across attempts; OpenClaw's `auth-rate-limit.ts` counter incremented |
| T-1.20 | Functional | 1.5 | POST /auth/logout clears session | Valid cookie; `POST /auth/logout` | 204; `Set-Cookie: oc_session=; Max-Age=0` | Session row deleted from DB; subsequent `/auth/me` → 401 |
| T-1.21 | Functional | 1.5 | GET /auth/me returns user for valid session | Valid cookie | 200 `{ user: { id, email, isAdmin, source }, files: { … } }` | `files` has all 10 keys; each value is an absolute path |
| T-1.22 | Functional | 1.5 | GET /auth/me returns 401 for no creds | No cookie, no bearer | 401 `{ error: 'unauthenticated' }` | — |
| T-1.23 | Functional | 1.6 | POST /team/tokens creates token with ocp_ prefix | Logged-in user; `POST /team/tokens { name: 'my-bot' }` | 201 `{ id, name, token: 'ocp_…', created_at }` | Token starts with `ocp_`; 24 base64url bytes after prefix; raw token only returned once |
| T-1.24 | Functional | 1.6 | API token authenticates to /auth/me | Use returned raw token as `Authorization: Bearer ocp_…` | 200 with correct user | `source = 'api-token'` |
| T-1.25 | Security | 1.6 | GET /team/tokens does not return raw token | List tokens after creation | Response array has `id, name, last_used_at, created_at` but NO `token` field | No raw token in list response |
| T-1.26 | Security | 1.6 | DELETE /team/tokens/:id cross-user blocked | User A tries to DELETE User B's token id | 404 | Token B unchanged; no cross-user leakage |
| T-1.27 | Functional | 1.7 | Team routes not mounted when team mode off | `OPENCLAW_TEAM_MODE` unset | `GET /auth/me` returns 404; `GET /team` returns 404 | No team routes registered |
| T-1.28 | Functional | 1.7 | Team routes mounted when team mode on | `OPENCLAW_TEAM_MODE=1` | `GET /auth/me` returns 401 (route exists, not 404) | Routes registered under `/auth/*`, `/team/*`, `/webhooks/*` |

---

## EPIC 2 — User Overlay File System

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-2.01 | Functional | 2.1 | First call creates all dirs and seeds files | `resolveUserFiles('user-test-001')` on fresh system | All 10 paths returned; all exist on disk | `soulPath`, `agentsPath` contain content copied from `base/`; `memoryPath`, `userProfilePath`, `tasksPath` exist and are empty |
| T-2.02 | Functional | 2.1 | SOUL.md and AGENTS.md seeded from base/ | `base/SOUL.md` has content "Test soul" | User's `SOUL.md` has identical content | byte-for-byte match on first seeding |
| T-2.03 | Functional | 2.1 | Existing user files not overwritten on second call | Modify user's `SOUL.md`; call `resolveUserFiles` again | Modified content preserved | No overwrite; idempotent |
| T-2.04 | Functional | 2.1 | tmp/ cleared on every call | Put a file in `tmp/`; call `resolveUserFiles` again | File in `tmp/` is gone; `tmp/` dir still exists | `tmp/` is empty after call |
| T-2.05 | Security | 2.1 | Invalid userId with path separators rejected | `resolveUserFiles('../../../etc')` | Throws `Error('invalid userId')` | No filesystem access attempted |
| T-2.06 | Security | 2.1 | Invalid userId with spaces rejected | `resolveUserFiles('user name')` | Throws `Error('invalid userId')` | — |
| T-2.07 | Edge Case | 2.1 | Missing base/SOUL.md logs warning and creates empty file | Delete `base/SOUL.md`; call `resolveUserFiles` | Warning logged; user's `SOUL.md` created as empty | Process does not throw; runtime can proceed (may error gracefully for empty prompt) |
| T-2.08 | Edge Case | 2.1 | Concurrent calls for same user don't throw | 10 parallel `resolveUserFiles('same-user')` calls | All 10 complete without error; same paths returned | No race condition exceptions |
| T-2.09 | Functional | 2.2 | ctx.files attached for real users | Hit any auth-guarded endpoint with cookie session | `req.team.files` has all 10 keys | All paths are absolute and exist on disk |
| T-2.10 | Functional | 2.2 | ctx.files NOT attached for admin legacy user | Use legacy gateway token | `req.team` has `userId='admin'` but NO `files` key | Admin context is synthetic; no file resolution |
| T-2.11 | Edge Case | 2.2 | File resolution failure aborts the request | Simulate disk-full error in `resolveUserFiles` | 401 returned; error logged | `resolveTeamAuth` returns `null` on resolution error |
| T-2.12 | Functional | 2.3 | appendMemory appends line and preserves trailing newline | Empty `MEMORY.md`; `appendMemory(path, 'first line')` | `MEMORY.md` contains `first line\n` | Exactly one trailing newline |
| T-2.13 | Functional | 2.3 | appendMemory trims oldest lines when over cap | 8000-byte file; append 500-byte line; cap=8192 | File ≤ 8192 bytes; oldest lines removed from top | Newest line is present; file size within cap |
| T-2.14 | Edge Case | 2.3 | appendMemory no-ops on empty line | `appendMemory(path, '   ')` | File unchanged | No write performed |
| T-2.15 | Functional | 2.3 | appendMemory writes atomically | Interrupt after `.tmp` write but before rename | No partial file corruption | Either old or new content; never partial |
| T-2.16 | Functional | 2.4 | OPENCLAW_HOME override controls all paths | `OPENCLAW_HOME=/tmp/oc-test` | `team.sqlite` at `/tmp/oc-test/team.sqlite`; workspace at `/tmp/oc-test/workspace/` | All team-mode paths under the override root |
| T-2.17 | Functional | 2.4 | Default path works without OPENCLAW_HOME | No `OPENCLAW_HOME` env | Paths under `~/.openclaw/` | Platform-correct default |
| T-2.18 | Functional | 2.5 | base/ created on first boot if missing | Delete `~/.openclaw/workspace/`; boot with team mode | `base/`, `base/SOUL.md`, `base/AGENTS.md`, `base/skills/`, `base/tools/` all created | All directories and files present; init log message printed |
| T-2.19 | Functional | 2.5 | base/ bootstrap does not overwrite existing content | Add content to `base/SOUL.md`; restart | Content unchanged | Idempotent; no data loss |

---

## EPIC 3 — Agent Runtime Integration

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-3.01 | Functional | 3.1 | `team` field accepted on runtime request | Pass `team: { userId: 'u1', … }` on runtime call | No TypeScript error; `ctx.team` reachable from tool | TypeScript compiles; tool callback receives `ctx.team.userId` |
| T-3.02 | Regression | 3.1 | Existing runtime tests pass when `team` absent | All existing `agent-command.ts` tests run without `team` field | All tests pass | Zero test failures |
| T-3.03 | Functional | 3.2 | Agent reads SOUL.md from per-user path | Call runtime with `team.files` populated; user SOUL.md has unique content | Prompt built using user's SOUL.md content | System prompt contains user-specific SOUL content, NOT base/ content |
| T-3.04 | Functional | 3.2 | Agent reads AGENTS.md from per-user path | User's AGENTS.md has custom agent instructions | Prompt includes user's AGENTS.md | User-specific agent config is active |
| T-3.05 | Functional | 3.2 | MEMORY.md, USER.md, TASKS.md prepended to prompt | Each file has distinct content | System prompt includes all three content blocks | Content appears under the correct section headers |
| T-3.06 | Functional | 3.2 | Fallback to base/ when team.files absent | No `team` on runtime request | Agent reads from `base/SOUL.md`, `base/AGENTS.md` | Same behavior as pre-team OpenClaw |
| T-3.07 | Security | 3.2 | All user file reads go through secureRead | Instrument `secureRead`; run agent turn | Every file read in the team branch calls `secureRead` | Zero bare `fs.readFile` calls against user paths during a team-mode turn |
| T-3.08 | Functional | 3.3 | `<memory>` block appended to MEMORY.md | Mock LLM returns `Hello! <memory>user speaks Hindi</memory>` | MEMORY.md gains the line; reply sent to channel = `Hello!` | Block stripped from outbound; MEMORY.md updated |
| T-3.09 | Functional | 3.3 | MEMORY.md cap enforced | MEMORY.md at 8100 bytes; agent session adds 200-byte memory | MEMORY.md ≤ 8192 bytes after update | Oldest lines trimmed |
| T-3.10 | Security | 3.3 | Concurrent memory writes serialized | Two concurrent agent turns for same user, both with `<memory>` blocks | Both memory lines appear; no lost update | MEMORY.md contains both lines in order |
| T-3.11 | Functional | 3.4 | Session key prefixed with `u:<userId>:` | Call `deriveSessionKey` with `team: { userId: 'amit' }` | Result starts with `u:amit:` | Prefix present |
| T-3.12 | Functional | 3.4 | No prefix when no team context | Call `deriveSessionKey` without `team` field | Result is whatever existing logic returns (no prefix) | Original key unchanged |
| T-3.13 | Security | 3.4 | Two users get different session keys for same threadId | Same `threadId`, different `userId` | Keys differ (`u:user1:…` vs `u:user2:…`) | No key collision |
| T-3.14 | Integration | 3.4 | Vector memory isolated per user | User A writes a vector memory entry; User B queries | User B gets no results from User A's data | LanceDB keyed on session id; `u:A:…` ≠ `u:B:…` |
| T-3.15 | Integration | 3.4 | Session JSON files isolated per user | User A has a session file; User B has a session file | Files are `~/.openclaw/sessions/u:A:…` and `~/.openclaw/sessions/u:B:…` | No shared session file between users |

---

## EPIC 4 — Channel Routing (WhatsApp + Telegram)

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-4.01 | Functional | 4.1 | Telegram webhook registered in team mode | `OPENCLAW_TEAM_MODE=1` | `POST /webhooks/telegram/<wsId>` returns non-404 | Route exists |
| T-4.02 | Functional | 4.1 | Telegram webhook with correct secret → 200 + dispatch | `X-Telegram-Bot-Api-Secret-Token: <correct>` | 200 OK; dispatch called with correct `userId` | Identity looked up; agent runtime invoked |
| T-4.03 | Security | 4.1 | Telegram webhook with wrong secret → 401 | `X-Telegram-Bot-Api-Secret-Token: <wrong>` | 401; no dispatch invoked | Drop; logged |
| T-4.04 | Security | 4.1 | Telegram webhook with missing secret header → 401 | No `X-Telegram-Bot-Api-Secret-Token` header | 401 | Hard fail on missing header |
| T-4.05 | Edge Case | 4.1 | Telegram update with no message → 200, no dispatch | `{"update_id":1}` (no `message` key) | 200 OK; dispatch NOT called | Callbacks/edits silently ignored |
| T-4.06 | Edge Case | 4.1 | Malformed Telegram JSON → 400 | Raw body is not valid JSON | 400 | No dispatch; no crash |
| T-4.07 | Functional | 4.1 | Unknown Telegram sender drops silently | `external_id` not in `channel_identities`; Mode A/B off; no auto-create | 200 OK; no reply sent; log entry written | Drop without replying to strangers |
| T-4.08 | Functional | 4.2 | WhatsApp GET verification handshake succeeds | `?hub.mode=subscribe&hub.verify_token=<correct>&hub.challenge=42` | 200 with body `42` | Challenge echoed |
| T-4.09 | Security | 4.2 | WhatsApp GET handshake fails with wrong verify_token | Wrong token | 403 | No challenge echoed |
| T-4.10 | Functional | 4.2 | WhatsApp POST with valid HMAC → 200 + dispatch | `X-Hub-Signature-256: sha256=<correct>` | 200 OK; dispatch invoked | Identity resolved; agent runtime called |
| T-4.11 | Security | 4.2 | WhatsApp POST with invalid HMAC → 401 | Tampered body or wrong HMAC | 401; no dispatch | Logged; drop |
| T-4.12 | Security | 4.2 | WhatsApp POST with no signature header → 401 | Missing `X-Hub-Signature-256` | 401 | Hard fail |
| T-4.13 | Functional | 4.2 | WhatsApp document triggers media download | `messages[0].type = 'document'` | File downloaded to user's `uploadsDir/`; `attachments[0].path` is absolute path | File exists on disk; path under `uploadsDir` |
| T-4.14 | Security | 4.2 | WhatsApp duplicate message (Meta retry) deduped | Same `msg.id` POSTed twice | Dispatch called once | LRU dedup prevents double processing |
| T-4.15 | Functional | 4.3 | GET /team/identities returns own mappings only | User A logged in; `GET /team/identities` | Only User A's mappings | No User B identities in response |
| T-4.16 | Security | 4.3 | DELETE /team/identities/:id cross-user blocked | User A tries to delete User B's identity id | 404 | Identity B unchanged |
| T-4.17 | Security | 4.3 | POST /team/identities (admin assign) blocked for non-admin | Non-admin POSTs | 403 | No row created |
| T-4.18 | Edge Case | 4.3 | Duplicate identity → 409 | Admin assigns same `(channel, externalId)` twice | 409 | First mapping preserved; second rejected |
| T-4.19 | Functional | 4.4 | dispatch() always provides team.files to runtime | Call dispatch with any valid userId | `runOpenclawAgent` receives `team.files` with all 10 paths | All 10 fields present and non-null |
| T-4.20 | Edge Case | 4.4 | dispatch() error logs to per-user logsDir | `runOpenclawAgent` throws | Error logged to `team.files.logsDir` as JSONL; error rethrown | Log file contains timestamp + error stack |
| T-4.21 | Functional | 4.5 | Claim code issued via POST /team/identities/claim | `{ channel: 'telegram' }`; logged-in user | 200 `{ code: 'OC-XXXXXX', expiresAt: … }` | Code starts with `OC-`; 6 chars from unambiguous alphabet |
| T-4.22 | Functional | 4.5 | Inbound `claim OC-XXXXXX` links identity | User sends `claim OC-XXXXXX` via Telegram | Bot replies "Linked!"; `channel_identities` row created | Subsequent messages from that sender resolve to the user |
| T-4.23 | Security | 4.5 | Claim code single-use | Same code sent twice | Second attempt → "Invalid or expired claim code." | `consumed_at` set after first use; second fails atomically |
| T-4.24 | Security | 4.5 | Expired claim code rejected | Send claim after 11 minutes | "Invalid or expired claim code." | TTL enforced |
| T-4.25 | Security | 4.5 | Claim code for wrong channel rejected | Issue Telegram claim; try to use on WhatsApp | Rejected | Channel field enforced |
| T-4.26 | Functional | 4.6 | Mode C auto-creates guest user | Unknown sender; workspace `auto_create_guest_users=true` | Guest user row created; identity linked; dispatch called | Email format `<channel>:<id>@guest.local` |
| T-4.27 | Security | 4.6 | Guest user cannot log in | Guest's `password_hash = '!disabled!'` | `argon2.verify('!disabled!', any)` → false; login fails | Guest cannot authenticate via `/auth/login` |
| T-4.28 | Security | 4.6 | Mode C per-IP burst limit honored | 11 unknown senders from same IP in 1 minute | 10 guests created; 11th dropped | No 11th user row |
| T-4.29 | Functional | 4.7 | Telegram document streamed to uploadsDir | 1 MB PDF via Telegram | File at `users/user_<id>/uploads/<ts>_<fileId>.pdf` | File exists; path matches returned `attachments[0].path` |
| T-4.30 | Security | 4.7 | Upload size cap enforced | 30 MB file (over 25 MB cap) | File rejected; "rejected: over size cap" logged | No partial file written; `uploadsDir` unchanged |
| T-4.31 | Security | 4.7 | Unsupported mime type rejected | `.exe` file upload | Drop; "unsupported mime" logged | No file created |
| T-4.32 | Security | 4.7 | Path traversal in file_id blocked before download | `file_id` containing `../../etc/passwd` | `secureWrite` throws `SecureFsViolationError` before any network request | No bytes downloaded; violation logged |

---

## EPIC 5 — Secure File Access Enforcement

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-5.01 | Security | 5.1 | secureRead allows read within user root | `secureRead('amit', '/workspace/users/user_amit/SOUL.md')` | File content returned | No exception |
| T-5.02 | Security | 5.1 | secureRead blocks cross-user read | `secureRead('amit', '/workspace/users/user_priya/SOUL.md')` | Throws `SecureFsViolationError` | Exception thrown; violation logged |
| T-5.03 | Security | 5.1 | secureRead blocks path traversal | `secureRead('amit', '/workspace/users/user_amit/../user_priya/MEMORY.md')` | Throws `SecureFsViolationError` | `path.resolve` collapses traversal; check fails |
| T-5.04 | Security | 5.1 | secureRead allows read from base/ | `secureRead('amit', '/workspace/base/skills/some-skill.md')` | File content returned | Reads from `base/` are allowed (base is shared, read-only) |
| T-5.05 | Security | 5.1 | secureRead blocks absolute path outside workspace | `secureRead('amit', '/etc/passwd')` | Throws `SecureFsViolationError` | Violation logged |
| T-5.06 | Security | 5.1 | secureWrite allows write within user root | `secureWrite('amit', '/workspace/users/user_amit/MEMORY.md', 'data')` | File written | No exception |
| T-5.07 | Security | 5.1 | secureWrite blocks write to base/ | `secureWrite('amit', '/workspace/base/SOUL.md', 'pwned')` | Throws `SecureFsViolationError` with `operation='write-to-base'` | base/ unchanged; violation logged |
| T-5.08 | Security | 5.1 | secureWrite blocks cross-user write | `secureWrite('amit', '/workspace/users/user_priya/MEMORY.md', 'x')` | Throws `SecureFsViolationError` | Priya's file unchanged |
| T-5.09 | Security | 5.1 | validatePath uses path.sep to avoid prefix collision | User id `1` tries to read from `user_10`'s dir by constructing `user_1` + `0/SOUL.md` | Throws `SecureFsViolationError` | Boundary check uses `path.sep`; `user_1` + sep does not prefix-match `user_10` |
| T-5.10 | Security | 5.1 | SecureFsViolationError always logged | Any violation scenario | Log entry written to OpenClaw's logger and to `violations.log` in the user's `logsDir` | Both log destinations receive the entry; entry includes `{ ts, userId, op, attempted, resolved }` |
| T-5.11 | Functional | 5.2 | ESLint blocks bare fs imports in src/team/ | Add `import fs from 'node:fs'` to `src/team/channel-router.ts` | ESLint error `"Use secureRead/secureWrite instead."` | Lint fails; prevents merge |
| T-5.12 | Functional | 5.2 | ESLint allows bare fs in secure-fs.ts and file-resolver.ts | No lint error in those two files | ESLint passes | Exemption correctly scoped to those two files |
| T-5.13 | Functional | 5.3 | validatePathSync works without async | `validatePathSync('amit', '/workspace/users/user_amit/SOUL.md')` | Returns resolved path synchronously | No Promise; no I/O |
| T-5.14 | Functional | 5.3 | validatePathSync throws synchronously on violation | `validatePathSync('amit', '/etc/passwd')` | Throws `SecureFsViolationError` synchronously | No async involved |
| T-5.15 | Functional | 5.4 | Channel secrets encrypted at rest | Configure Telegram bot token via `/team` UI | DB row's `config_encrypted` starts with `v1.` | Plaintext never stored in DB |
| T-5.16 | Security | 5.4 | Tampered secret blob throws on decrypt | Flip a byte in `config_encrypted`; restart; webhook fires | `decryptSecret` throws "secret integrity failed" | Webhook does not process; error logged |
| T-5.17 | Security | 5.4 | Missing OPENCLAW_COOKIE_SECRET aborts boot | `OPENCLAW_TEAM_MODE=1`; no `OPENCLAW_COOKIE_SECRET` | Process refuses to start with clear error message | Boot fails fast |
| T-5.18 | Functional | 5.4 | Decrypted secret restores correctly after restart | Configure bot token; restart process | Channel router decrypts and uses credentials | Webhook continues to work post-restart |

---

## EPIC 6 — Plugin Safety

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-6.01 | Functional | 6.1 | Plugin with `team_safe: true` passes guard | `assertPluginTeamSafe('/path/manifest.json', { name: 'safe-plugin', team_safe: true })` | No exception | Guard is a no-op |
| T-6.02 | Security | 6.1 | Plugin missing `team_safe` field rejected | `assertPluginTeamSafe('/path', { name: 'risky' })` | Throws `PluginNotTeamSafeError` | Error message names the plugin and manifest path |
| T-6.03 | Security | 6.1 | Plugin with `team_safe: false` rejected | `{ team_safe: false }` | Throws `PluginNotTeamSafeError` | Strict `=== true` required |
| T-6.04 | Security | 6.1 | Plugin with `team_safe: 'yes'` (string) rejected | `{ team_safe: 'yes' }` | Throws `PluginNotTeamSafeError` | Must be boolean true, not truthy |
| T-6.05 | Regression | 6.1 | Guard is no-op when team mode off | `OPENCLAW_TEAM_MODE` unset; any manifest | No exception | All plugins load normally |
| T-6.06 | Functional | 6.2 | Unsafe plugin skipped at boot | Plugin without `team_safe: true`; boot with team mode | Plugin not loaded; "[team] plugin skipped (not team_safe): <name>" logged | Other plugins load normally; boot does not crash |
| T-6.07 | Functional | 6.2 | Safe plugin loads at boot | Plugin with `team_safe: true` | Plugin loaded and functional | — |
| T-6.08 | Functional | 6.2 | Boot summary log emitted | Mix of safe and unsafe plugins | "[team] plugins loaded: N, skipped (not team_safe): M, names=[…]" | Summary log appears at end of plugin loading |
| T-6.09 | Edge Case | 6.2 | One bad plugin does not crash boot | Plugin with `team_safe: true` but broken entry-point | Other plugins load; boot continues | Per-plugin failure isolated |
| T-6.10 | Functional | 6.3 | ctx.fs.writeFile routes through secureWrite | Plugin calls `ctx.fs.writeFile(validPath, 'data')` | File written | secureWrite called; no exception |
| T-6.11 | Security | 6.3 | ctx.fs.writeFile blocks cross-user write | Plugin calls `ctx.fs.writeFile('/workspace/users/user_other/MEMORY.md', 'x')` | Throws `SecureFsViolationError` | Other user's file unchanged |
| T-6.12 | Security | 6.3 | ctx.fs.writeFile blocks write to base/ | Plugin calls `ctx.fs.writeFile('/workspace/base/SOUL.md', 'x')` | Throws `SecureFsViolationError` | base/ unchanged |
| T-6.13 | Security | 6.3 | Plugin importing node:fs directly is NOT sandboxed | (Documented limitation) Plugin does `import fs from 'node:fs'; fs.readFile('/etc/passwd', …)` | Succeeds — this is the known limitation | Documented; mitigated by `team_safe` opt-in trust and operator vetting |
| T-6.14 | Regression | 6.3 | ctx.fs absent when team mode off | `OPENCLAW_TEAM_MODE` unset | `pluginCtx.fs === undefined` | Existing plugins keep working |

---

## EPIC 7 — Admin APIs & UI

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-7.01 | Functional | 7.1 | GET /login returns HTML with CSRF token | `GET /login` | 200 text/html; `oc_csrf` cookie set; `__CSRF__` replaced in HTML | HTML contains `name="csrf"` with the cookie's value |
| T-7.02 | Security | 7.1 | Login page has correct CSP header | `GET /login` | `Content-Security-Policy` header present | Policy includes `default-src 'self'` |
| T-7.03 | Functional | 7.1 | Successful login via /login form → redirect to /team | Submit valid credentials | 200 from `/auth/login`; client JS navigates to `/team` | Cookie session active |
| T-7.04 | Functional | 7.1 | Failed login shows inline error | Wrong password | 401 from `/auth/login`; error displayed in-page without full redirect | No navigation; error text visible |
| T-7.05 | Functional | 7.2 | GET /team returns 200 for authenticated user | Valid cookie | 200 text/html | Page renders |
| T-7.06 | Security | 7.2 | GET /team redirects to /login for unauthenticated | No cookie | Redirect to `/login` | 302 or 401 |
| T-7.07 | Security | 7.2 | Admin sections hidden for non-admin | Login as non-admin; `GET /team` | Response HTML does NOT contain `#users` section or `#workspaces` section | Sections removed client-side; server-side endpoints also return 403 |
| T-7.08 | Functional | 7.2 | Admin sections visible for admin | Login as admin; `GET /team` | Response HTML contains `#users` and `#workspaces` sections | — |
| T-7.09 | Functional | 7.3 | Admin GET /team/users returns all users | Admin logged in; multiple users in DB | Full user list with id, email, name, status | No passwords or hashes exposed |
| T-7.10 | Functional | 7.3 | Admin POST /team/users creates invite link | `POST /team/users { email: 'new@x.com' }` | 201 with `inviteLink` containing `OC-` token | User row created with `password_hash='!invite!'` |
| T-7.11 | Functional | 7.3 | POST /auth/accept with valid invite token sets password | `POST /auth/accept { token, password }` | 200; cookie session set; user can log in | `password_hash` updated; session active |
| T-7.12 | Security | 7.3 | Invite token single-use | POST `/auth/accept` with same token twice | Second attempt → 400 "Invalid or expired invite link" | Token `consumed_at` set after first use |
| T-7.13 | Security | 7.3 | Admin cannot disable themselves | Admin tries to `DELETE /team/users/<own-id>` | 400 "Admin cannot disable themselves" | Admin user unchanged |
| T-7.14 | Security | 7.3 | Non-admin cannot access user management | Non-admin calls any of GET/POST/DELETE /team/users | 403 | No data change |
| T-7.15 | Functional | 7.3 | Admin can re-enable a disabled user | `POST /team/users/:id/enable` | 200; user `status='active'` | User can log in again |
| T-7.16 | Functional | 7.4 | Bootstrap admin seeded from env | Fresh DB; envs set | Admin user with `is_admin=1`; password hash verifies | See T-1.02 |
| T-7.17 | Security | 7.4 | OPENCLAW_TEAM_ADMIN_PASSWORD cleared after seeding | After first boot | `process.env.OPENCLAW_TEAM_ADMIN_PASSWORD` is `undefined` | Env cleared from process memory |
| T-7.18 | Edge Case | 7.4 | No admin created if password < 12 chars | `OPENCLAW_TEAM_ADMIN_PASSWORD=short` | Warning logged; no admin created; boot continues | Minimum length enforced |
| T-7.19 | Functional | 7.5 | CLI team:reset-password prints reset link | `pnpm openclaw team:reset-password admin@x.com` | Prints reset link with `OC-` token; exit 0 | Token in `channel_claims` with `channel='reset'` |
| T-7.20 | Functional | 7.5 | Reset link works once | Open reset link; `POST /auth/reset { token, newPassword }` | Password updated; all sessions invalidated | Can log in with new password; old sessions → 401 |
| T-7.21 | Security | 7.5 | Reset token single-use | Reuse reset token | 400 | Second reset rejected |
| T-7.22 | Edge Case | 7.5 | CLI reset for unknown email | `pnpm openclaw team:reset-password unknown@x.com` | "no such user: unknown@x.com"; exit 1 | — |
| T-7.23 | Functional | 7.6 | Admin creates workspace | `POST /team/workspaces { name: 'Bandra Elite' }` | 201 `{ id, name }` | Workspace row in DB |
| T-7.24 | Functional | 7.6 | Admin configures Telegram channel | `PUT /team/workspaces/:id/channels/telegram { botToken, webhookSecret }` | Returns `{ webhookSecret, webhookUrl }` | DB row encrypted with `v1.` prefix |
| T-7.25 | Security | 7.6 | Workspace channel config not re-echoed | `GET /team/workspaces` after configuring Telegram | Response shows "configured" flag, NOT the bot token | Secrets never returned to UI |
| T-7.26 | Functional | 7.6 | Channel-router reads and decrypts workspace config | Telegram webhook fires for a configured workspace | Handler decrypts and uses the correct bot token | Outbound reply sent successfully |
| T-7.27 | Functional | 7.6 | Schema v2 applied idempotently | Restart process after v2 migration | No error; `workspace_channels` table exists | `PRAGMA user_version = 2` |

---

## EPIC 8 — Deployment & Configuration

| Test ID | Category | Story | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-8.01 | Functional | 8.1 | pnpm install succeeds with new deps | `pnpm install` | Zero errors | `better-sqlite3` and `argon2` in `node_modules` |
| T-8.02 | Functional | 8.1 | better-sqlite3 loads at runtime | `node -e "require('better-sqlite3')"` | No error | Native binding loads |
| T-8.03 | Functional | 8.2 | Docker build succeeds | `docker build -t openclaw-team .` | Exit 0 | Image built without error |
| T-8.04 | Functional | 8.2 | better-sqlite3 available inside Docker container | `docker run --rm openclaw-team node -e "require('better-sqlite3')"` | Binding loads | — |
| T-8.05 | Functional | 8.2 | Final Docker image contains no compilers | `docker run --rm openclaw-team which gcc` | Command not found | Build tools removed in final stage |
| T-8.06 | Functional | 8.2 | Docker healthcheck passes | Container running | `docker inspect` shows healthcheck status = `healthy` | — |
| T-8.07 | Functional | 8.3 | docker compose up brings system online | `cp .env.example .env`; fill values; `docker compose up -d` | Both services running; `GET https://<DOMAIN>/login` returns 200 | TLS cert issued by Caddy |
| T-8.08 | Functional | 8.3 | State persists across compose restart | Login and perform actions; `docker compose restart`; log in again | Same user data present | Volume persists |
| T-8.09 | Security | 8.3 | No services exposed beyond 80/443 | `nmap` or `docker compose ps` | Ports 80 and 443 only exposed | No 8080, 5432, or Redis ports publicly reachable |
| T-8.10 | Functional | 8.3 | HSTS and security headers present | `curl -I https://<DOMAIN>/login` | `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` headers present | All three headers in response |
| T-8.11 | Functional | 8.4 | Backup cron creates backup files | Run backup cron command manually | `team-<date>.sqlite` and `workspace-<date>/` in backups dir | Both backup artifacts created |
| T-8.12 | Functional | 8.4 | Restore from backup restores login | Stop container; replace volume from backup; start | Can log in with backed-up user credentials | Channel mappings and identities also restored |
| T-8.13 | Functional | 8.5 | README Team Mode section documents all env vars | Read `README.md` Team Mode section | All 10 env vars from the design table are listed | No env var from `09-deployment-model/deployment.md` is missing |
| T-8.14 | Regression | 8.5 | Rollback procedure works | Set `OPENCLAW_TEAM_MODE=` (empty); restart | OpenClaw behaves identically to single-user mode | No team routes registered; no DB touched |

---

## Cross-Cutting Security Tests

These tests cover threat categories from `11-security-basics/security.md` and cut across multiple epics.

| Test ID | Category | Epic | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-S.01 | Security | All | Unauthorized access — no credentials | Request to any team-mode protected endpoint with no cookie and no bearer | 401 | No data returned |
| T-S.02 | Security | 1,5 | Path traversal via cookie value | Cookie value containing `../` or `%2F..%2F` | Session lookup by raw hex ID — traversal has no effect on lookup | 401 (no such session) |
| T-S.03 | Security | 5 | Path traversal via direct secureRead call | `secureRead('user1', 'users/user_1/../user_2/MEMORY.md')` | `SecureFsViolationError` thrown | `path.resolve` neutralizes the traversal |
| T-S.04 | Security | 5 | Path traversal via absolute path outside workspace | `secureRead('user1', '/etc/passwd')` | `SecureFsViolationError` | Absolute path outside workspace rejected |
| T-S.05 | Security | 4 | Injection via message text (SQL) | WhatsApp message body containing SQL `' OR '1'='1` | Text handled as data, never executed | Prepared statements prevent injection; message passed to agent as-is |
| T-S.06 | Security | 4 | Injection via message text (shell) | Telegram message containing shell metacharacters `` `rm -rf ~` `` | Text passed as string to LLM; no shell execution | No shell invocation in any code path |
| T-S.07 | Security | 1 | Expired session cookie rejected | Session `expires_at` set to past; request sent | `resolveTeamAuth` returns null; 401 | `extendSession` not called |
| T-S.08 | Security | 1,4 | Cross-user access via session key | User A tries to impersonate User B by crafting session key | Not possible — session key is derived server-side from verified `userId` | No user-supplied session keys accepted |
| T-S.09 | Security | 4 | Invalid webhook signature — WhatsApp | Signature computed with wrong secret | 401; request dropped | HMAC verification uses constant-time compare |
| T-S.10 | Security | 4 | Invalid webhook signature — Telegram | Wrong `X-Telegram-Bot-Api-Secret-Token` | 401; request dropped | Constant-time compare |
| T-S.11 | Security | 6 | Plugin fs proxy blocks cross-user access | Plugin calls `ctx.fs.readFile` targeting another user's path | `SecureFsViolationError` | Proxy always calls validatePath |
| T-S.12 | Security | 2,3 | base/ write blocked at runtime | Any runtime code path attempts to write to `base/` | `SecureFsViolationError` with `operation='write-to-base'` | base/ unchanged |
| T-S.13 | Security | 1 | Brute-force login blocked | 20 consecutive failed logins for same email from same IP | Later attempts back off; existing rate limiter active | OpenClaw's `auth-rate-limit.ts` counter incremented |
| T-S.14 | Security | 5 | CSRF protection on /auth/login | `POST /auth/login` without `X-Csrf` header | 403 or 401 | Request rejected without processing credentials |
| T-S.15 | Security | 1 | API token SHA-256 hash not reversible | Inspect `api_tokens.hash` column | Column contains SHA-256 hex; raw token not stored | Raw token irrecoverable from DB |
| T-S.16 | Security | 5 | Channel secret AES-GCM tamper detected | Flip one byte of `config_encrypted` in DB | `decryptSecret` throws on GCM auth tag failure | Tampered secret cannot be used |
| T-S.17 | Regression | All | Team mode off — bit-identical to single-user OpenClaw | Run full existing OpenClaw test suite with `OPENCLAW_TEAM_MODE` unset | All existing tests pass | Zero regressions in any existing test |

---

## Edge Case and Failure Scenario Tests

| Test ID | Category | Epic | Test Description | Input | Expected Output | Pass Criteria |
|---|---|---|---|---|---|---|
| T-E.01 | Edge Case | 1 | Invalid API token format (no ocp_ prefix) | `Authorization: Bearer notavalidtoken` | Falls through to legacy gateway token check | No 500; correct 401 if legacy token also wrong |
| T-E.02 | Edge Case | 2 | Missing env vars (HOME and USERPROFILE both unset) | No HOME, no USERPROFILE, no OPENCLAW_HOME | `getOpenclawHome()` throws with clear error message | Process refuses to start with actionable message |
| T-E.03 | Edge Case | 1 | Empty `users` table with no admin envs set | Boot with `OPENCLAW_TEAM_MODE=1` and no admin env vars | Warning logged: "no admin exists"; boot continues | System operational but no one can log in until admin env is set |
| T-E.04 | Edge Case | 3 | Agent SOUL.md missing for a user | User's SOUL.md deleted; agent turn invoked | `secureRead` throws; runtime returns 500 | Channel router converts to polite "internal error" reply; violation logged |
| T-E.05 | Edge Case | 3 | MEMORY.md missing (fresh user) | First agent turn for a brand-new user | Memory content = `''`; agent runs normally | `.catch(() => '')` in read path ensures graceful handling |
| T-E.06 | Edge Case | 4 | Concurrent sessions for same user | User sends two WhatsApp messages simultaneously | Both dispatched; both completed; no data corruption | Two session keys both prefixed `u:<userId>:`; no lock-up |
| T-E.07 | Edge Case | 4 | WhatsApp status update (non-message) | Meta sends `statuses` update instead of `messages` | 200 OK; no dispatch | Status updates silently ignored |
| T-E.08 | Edge Case | 4 | Plugin fs access during concurrent user sessions | Two different users' plugins write simultaneously | Both writes succeed; no file corruption | secureWrite creates parent dirs; writes are per-user paths with no collision |
| T-E.09 | Edge Case | 2 | Race condition on first-time user resolution | 10 concurrent requests for a brand-new user | All 10 succeed; user's files created exactly once | `fs.mkdir({ recursive: true })` idempotency; no exception |
| T-E.10 | Edge Case | 1 | Session row deleted externally during a request | Session deleted from DB mid-request | Next request with that cookie → 401 | Instant revocation works |
| T-E.11 | Edge Case | 8 | Container restart with data intact | `docker compose restart`; same users | All users can log in; all channel identities preserved | SQLite WAL + volume mount ensures persistence |
| T-E.12 | Edge Case | 2 | tmp/ cleared while agent is writing to it | Agent writes temp file; next request clears tmp/ | Temp file gone; new request gets fresh tmp/ | Agent must not depend on tmp/ surviving across request boundaries |
| T-E.13 | Edge Case | 4 | Telegram sends update type the router doesn't handle | `{"update_id": 1, "inline_query": {…}}` | 200 OK; silently ignored | Only `message` and `edited_message` are processed |
| T-E.14 | Edge Case | 5 | SecureFsViolationError in violation.log path itself | `logsDir` does not exist or is read-only | Violation still logged to OpenClaw's primary logger; no secondary logging exception propagated | Primary logging never fails because of secondary log failure |
| T-E.15 | Edge Case | 1 | invite token with wrong channel type used as reset | Attempt to use `channel='invite'` token at `/auth/reset` | 400 | Channel-type enforcement prevents token reuse across flows |

---

*Total test cases: 130+ covering all 8 epics, all security threat categories from the design, and critical failure/edge scenarios.*
