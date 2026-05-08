# 11 — Security Basics

## Scope

Only **essential** protections. Not enterprise compliance. Not pen-test-grade. Not SOC 2. The goal: a small team running this on a public EC2 should not be trivially hacked. Anything more advanced lives in `/kalim/enterprise-plan/17-security-model/`.

## Four Things We Actually Do

### 1. User Isolation

Every authenticated request resolves to exactly one `userId`. Every session key, every memory write, every channel-identity lookup is keyed by it. Two users on one install **cannot** read each other's:

- chat history (session-key prefix `u:<userId>:`)
- vector memory (same prefix; LanceDB indexes by session id)
- linked phones (UNIQUE on `channel_identities (channel, external_id)`)
- API tokens (FK to `users.id`, no cross-user listing)

**What we don't isolate**: skills (shared from `base/`), tools (shared from `base/`), plugin runtime (shared, loaded once per process).

**Threat we don't fully cover**: a malicious skill or plugin authored by the operator can read across users by ignoring `ctx.team` and constructing arbitrary paths. We trust the operator's plugin choices. The big plan adds plugin sandboxing; we don't.

### 1b. File Path Isolation (Overlay Files — NEW)

Every file or directory written during execution is stored under a path constructed **entirely server-side** from `userId`. The complete per-user subtree is:

```
~/.openclaw/workspace/users/user_<userId>/
  SOUL.md          ← agent personality (seeded from base/)
  AGENTS.md        ← agent config (seeded from base/)
  MEMORY.md        ← persistent cross-session context
  USER.md          ← user profile / preferences
  TASKS.md         ← pending tasks / reminders
  uploads/         ← inbound files from channels
  conversations/   ← session transcript archival
  tmp/             ← scratch space (cleared each session)
  tool_cache/      ← cached tool results
  logs/            ← execution logs
```

`base/` contains only `SOUL.md` (seed), `AGENTS.md` (seed), `skills/`, and `tools/`. **It is read-only at runtime.** No agent, skill, plugin, or channel router may write to `base/`.

**Why users cannot access other users' files:**

| Control | Detail |
|---|---|
| **Server-side path construction** | `resolveUserFiles(userId)` builds every path; user input never enters the path string |
| **No direct path API** | No HTTP endpoint accepts a file path from the client |
| **No shared symlinks** | Each user directory is an independent filesystem subtree |
| **All write paths scoped per user** | Every writable path (`uploadsDir`, `conversationsDir`, `tmpDir`, `toolCacheDir`, `logsDir`, file paths) is under `users/user_<id>/` only — no shared writable location exists |
| **`userId` source** | Always from the verified auth credential (cookie/API token) — never from request body or query string |

**What a user can do to their own files:**

- `SOUL.md` and `AGENTS.md` diverge from `base/` over time; the agent or operator may edit them without affecting other users.
- `MEMORY.md` grows as the agent appends context; `USER.md` grows as the agent records preferences; `TASKS.md` is updated as tasks are created or completed.
- `conversations/` accumulates transcripts; `tool_cache/` stores cached results; `logs/` accumulates execution records.
- `tmp/` is cleared at the start of each session — it is safe scratch space, not persistent storage.
- None of these files is served back to the client over HTTP — they are internal runtime artifacts only.

**`base/` read-only enforcement:** The resolver never writes to `base/`. No code path in `src/team/` opens `base/` for writing. If a skill or plugin attempts to write outside `users/user_<id>/`, it violates the overlay contract — the operator is responsible for auditing installed plugins (same caveat as before).

**Operational note:** the `base/` directory contains the seeds. If an operator wants to reset a specific user to the baseline, they delete `users/user_<id>/` — the next request re-seeds from `base/` automatically. No admin endpoint required.

### 2. Webhook Verification

Every inbound webhook is verified before any user lookup happens:

| Channel | Verification |
|---|---|
| WhatsApp (Meta Cloud) | `X-Hub-Signature-256: sha256=<hmac(rawBody, app_secret)>` constant-time compared |
| Telegram | `X-Telegram-Bot-Api-Secret-Token` constant-time compared to per-workspace secret stored at bot registration time |

Reject anything that fails — 401, log, drop. **No** "if header missing, fall through" logic; missing header is a hard fail.

The raw request body is read **before** any JSON parsing for the HMAC compute, then parsed. Standard pattern; ~20 lines.

### 3. Basic Auth Validation

| Concern | Control |
|---|---|
| Password storage | Argon2id (or scrypt). No reversible encoding ever |
| Login bruteforce | Reuse OpenClaw's `auth-rate-limit.ts` — same IP + email counter, exponential backoff |
| Session-cookie theft | `HttpOnly`, `SameSite=Lax`, `Secure` when HTTPS, signed with `OPENCLAW_COOKIE_SECRET` |
| CSRF on `/team` writes | Hidden `csrf` token field, double-submit cookie pattern; checked on every POST/DELETE |
| API token storage | Only the SHA-256 hash is stored; raw token shown once at creation |
| API token leak risk | Tokens are prefixed `ocp_`; documentation tells operators not to commit them |
| Constant-time compare | All secret comparisons use `crypto.timingSafeEqual`, including the legacy gateway-token branch (already done by upstream) |

**What we don't do**: MFA, device fingerprinting, JWT-based stateless sessions, refresh-token rotation, SSO, OAuth, password-reset email. Listed in big plan §05; out of scope here.

### 4. Rate Limiting

Three buckets, all in-memory (one Node process — no Redis needed):

| Surface | Limit | Identifier |
|---|---|---|
| `/auth/login` | 5 attempts / 15 min, exponential backoff | IP + email |
| `/webhooks/*` | 50 req/sec burst, 10 req/sec sustained | IP (per webhook path) |
| Inbound message → agent runtime | 1 message every 2 seconds per `external_id` | sender's phone/chat-id |

The third bucket prevents a single misbehaving sender from draining LLM credits. It's a tiny LRU map keyed by `external_id`. Drop excess messages with a polite throttle reply.

We **deliberately don't** rate-limit by `userId` for authenticated team members — they are trusted.

## Defense-in-Depth, in a Single Sentence per Layer

| Layer | What it stops |
|---|---|
| TLS (Caddy) | Eavesdropping, MITM |
| Webhook signature | Spoofed inbound traffic from anyone but Meta / Telegram |
| Cookie + CSRF | Session theft from a hostile site |
| Argon2id password | Offline cracking of a stolen DB |
| Session DB lookup | Instant revocation of a stolen cookie or token |
| `userId` session-key prefix | Cross-user data leakage in sessions and vector memory |
| **`secureRead`/`secureWrite` boundary** | **Path traversal, cross-user file reads/writes, writes to `base/`** |
| **`team_safe` plugin manifest check** | **Untrusted plugins loading in team mode** |
| Rate limits | LLM-cost abuse, login bruteforce |

That is the **floor**. Above this floor we explicitly defer to the big plan.

### Secure FS Enforcement (Verified Code Path)

From reading `src/agents/workspace.ts`, OpenClaw already uses `openBoundaryFile()` to
confine workspace file reads to the `workspaceDir` root. Our Secure FS layer wraps the
team-mode I/O at a higher level with the same pattern:

```
request arrives
  ↓
resolveTeamAuth → resolveUserFiles → req.team.files   (paths set server-side)
  ↓
agent-command.ts: secureRead(userId, team.files.soulPath)
  ↓
secure-fs.ts: path.resolve(target) → check startsWith(userRoot) → allow or throw
  ↓
fs.readFile(resolvedPath)
```

Violations throw `SecureFsViolationError` and are logged to `team.files.logsDir` with
`{ userId, attemptedPath, resolvedPath, operation, timestamp }`. This creates a
tamper-evident trail for any path-boundary violation.

## What We Log (and What We Don't)

**Logged** (via OpenClaw's existing logger, plain text or structured):

- `/auth/login` success and failure (with IP, not password)
- `/auth/logout`
- API token creation and deletion (token hash only)
- Webhook signature failures
- New `channel_identity` claim
- Inbound message dispatched to runtime (with `userId`, channel, message length)
- `SecureFsViolationError` events (with `userId`, `attemptedPath`, `resolvedPath`) — these are always logged regardless of log level

**Not logged**:

- Message contents (privacy)
- Agent prompt or response text (privacy + log size)
- Tool inputs or outputs (privacy)
- Anything containing a secret or password

This is a "good enough" audit trail for a small team. It is **not** an immutable audit log suitable for compliance. The big plan covers that with `audit_logs` table; we don't.

## Secrets Handling

| Secret | Where it lives |
|---|---|
| `OPENCLAW_GATEWAY_TOKEN` | Env var |
| `OPENCLAW_COOKIE_SECRET` | Env var |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` (bootstrap) | Env var; cleared from memory after first-run user creation |
| WhatsApp app secret | In team SQLite; encrypted with `OPENCLAW_COOKIE_SECRET` (AES-256-GCM, 30 lines of code) |
| Telegram bot token | Same |
| LLM provider keys | Existing OpenClaw config; unchanged |
| Per-channel webhook secret token | Generated at bot-registration, stored in team SQLite |

The encryption-at-rest for channel secrets is the smallest cryptographic piece of the plan and the one place we don't compromise — channel tokens leaving the box would be game-over for inbound message authenticity. Encryption uses Node's built-in `crypto` (no `libsodium`, no extra dep).

## Threat Model in One Table

| Threat | Mitigation |
|---|---|
| Random scanner hits `/login` | Rate limit + Argon2 |
| Stolen cookie | Server-side session table, instant revoke from `/team` |
| Stolen API token | Same — DELETE the row, token's hash no longer matches |
| Forged webhook | HMAC / secret-token verification |
| Webhook replay | Best-effort: dedupe by `external_message_id` for last 100 ids; not absolute |
| Malicious teammate | Out of scope — small-team trust model; admin can disable account |
| Cross-user leak via shared agent | Session-key prefix; trust the agent runtime to not reach across keys |
| LLM credit drain via spam | Rate limit per `external_id` |
| Database file copy | File permissions on `~/.openclaw/` (operator's responsibility); secrets-at-rest encryption for channel tokens |
| Container escape | Out of scope — operator runs trusted images |
| Plugin supply-chain attack | Out of scope — operator vets plugins they install |

**Not in this plan, deferred to big plan:** SAML/OIDC SSO, IP allowlists per tenant, automated security scans, dependency CVE scanning beyond what `npm audit` provides, GDPR data-export endpoints, immutable audit logging, key rotation automation, secrets vault (HashiCorp Vault / AWS Secrets Manager) integration.

## Single Most Important Operational Habit

> **Restrict who has the EC2's `~/.openclaw/` directory.**
>
> One file (`team.sqlite`) holds every login, every API token hash, every channel mapping, and every encrypted webhook secret. Anyone with read access on that file is effectively the admin. Lock it down with `chmod 700 ~/.openclaw && chown openclaw:openclaw ~/.openclaw -R`.

Everything else in this section helps; that one habit is what actually keeps small-team OpenClaw safe.
