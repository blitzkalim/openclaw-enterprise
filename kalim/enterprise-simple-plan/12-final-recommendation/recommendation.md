# 12 — Final Recommendation

## Three Direct Answers

### 1. Can this be built cleanly on OpenClaw?

**Yes, and the design is unusually small for what it delivers.**

- **~1,105 lines of code total.** 11 new files in `src/team/`, 5 patches to existing files (~95 lines).
- **Zero changes** to `src/agents/` internals, `src/channels/` core, `src/skills/`, `src/memory/`, or any of the 100+ extensions.
- **Single env flag** (`OPENCLAW_TEAM_MODE=1`) toggles the whole layer. Off → byte-for-bit identical to today's OpenClaw.
- **Zero new infrastructure.** SQLite file, no Postgres, no Redis, no queue, no object store, no second process. Adds two npm deps: `better-sqlite3`, `argon2`.
- **Backward compatibility is by construction**, not by promise — the patches are guarded `if` branches, the new code is a parallel directory, the config file is untouched.
- **Per-user agent context** via `src/team/file-resolver.ts` (~120 lines): each user gets their own `SOUL.md`, `AGENTS.md`, `MEMORY.md`, `USER.md`, `TASKS.md`, `uploads/`, `conversations/`, `tmp/`, `tool_cache/`, `logs/` — all auto-provisioned from `base/` on first use.
- **Strict file boundary enforcement** via `src/team/secure-fs.ts` (~90 lines): `secureRead`/`secureWrite` wrappers that call `path.resolve()` and check every path against the user's root before any I/O. Path traversal, cross-user access, and writes to `base/` all throw `SecureFsViolationError` and are logged.
- **Plugin safety gate** via `src/team/plugin-guard.ts` (~30 lines): rejects plugins without `team_safe: true` in their manifest when team mode is active.

The reason this is so cheap is the key architectural insight buried in OpenClaw: **session keys flow through the entire runtime as the identity primitive**. By prefixing them with `u:<userId>:`, every downstream system — sessions, vector memory, tool ctx — becomes user-scoped automatically. We don't need to add `tenant_id` to twelve tables; we add it once, at the session-key boundary, and the rest of the codebase picks up the change for free.

### 2. Fastest implementation path?

**4 weeks, 1 engineer, calendar order:**

| Week | Deliverable |
|---|---|
| 1 | `src/team/db.ts` + schema + migrate(); `src/team/auth-middleware.ts` + cookie/API-token/legacy resolver; the 4 upstream patches; `/login` HTML; `/auth/me` working end-to-end |
| 2 | `src/team/team-routes.ts` (`/team` page, invite flow, API tokens UI); user-prefix in session keys; agent runtime accepts `team` ctx; multi-user regression test |
| 3 | `src/team/channel-router.ts`: Telegram webhook + secret-token verify; claim-code flow (Mode A); end-to-end "user → bot → agent → reply" working on Telegram |
| 4 | WhatsApp Meta Cloud webhook + HMAC; Mode-C guest user flow; encryption-at-rest for channel secrets; Caddy + docker-compose ship; docs |

If only **one channel** is needed: cut WhatsApp to Phase 2 and ship Telegram-only in 3 weeks. Telegram is strictly easier (free, simpler verification, no provider account approval).

### 3. What should be done first?

**The boot path and the auth middleware. In that order. Before anything else.**

Specifically, in the first 2–3 days:

1. Create `src/team/index.ts`, `src/team/db.ts`, `src/team/db-migrate.ts`. Get `OPENCLAW_TEAM_MODE=1` to start the process and create `~/.openclaw/team.sqlite` with the schema.
2. Implement `src/team/auth-middleware.ts` with all three credential paths.
3. Patch `src/gateway/auth.ts` and `src/index.ts` (the two minimal edits).
4. Write `src/team/integration.test.ts`: "with team mode on, hitting `/auth/me` with a fresh cookie session returns the user; with team mode off, the existing OpenClaw test suite passes unchanged."

Once that integration test is green, **the riskiest part of the project is done**. Everything else — channel-router, team UI, the WhatsApp webhook — is ordinary feature work that lives entirely in `src/team/` and requires no further upstream patches.

## User Overlay Model — The Key Design Decision

The per-user overlay is **the** design decision that makes independent agent context practical without infrastructure overhead.

### Why Not Shared Files?

If three users share one `SOUL.md`:
- Any operator edit to agent personality affects all users simultaneously.
- If the agent appends learnings to `MEMORY.md`, Priya reads Amit's conversation context.
- Two simultaneous `MEMORY.md` writes create file corruption.

### Why Not Full Workspace Duplication?

If each user gets their own copy of `skills/` and `tools/`:
- Upgrading a skill means updating N copies.
- The operator must manually propagate `base/` changes to every user directory.
- Disk usage multiplies by user count.

### Why the Overlay Model Wins

| Property | Shared files | Full duplication | Overlay (this design) |
|---|---|---|---|
| User memory isolation | ❌ | ✅ | ✅ |
| User personality isolation | ❌ | ✅ | ✅ |
| Skill/tool upgrades touch one place | ✅ | ❌ | ✅ |
| New user gets base behavior instantly | ✅ | ❌ (manual copy) | ✅ (auto-seeded) |
| Disk footprint | 1× | N× | 1× + small per-user subtree (files + 5 dirs) |
| Implementation complexity | ~0 extra | High | **~70 lines** |

The overlay is seeded lazily — `base/` is the source of truth until a user's file diverges. This means:

- Adding a new skill to `base/skills/` is immediately available to all users.
- Editing `base/SOUL.md` affects only **new** users or unseeded users; existing users keep their diverged copy.
- Existing users keep their own copy intact until the operator explicitly deletes and re-seeds their directory.
- `base/` has **zero runtime writes** — it is the operator's configuration surface, not the agent's working surface.

### Three Users, One Machine — Success Criteria Met

After this design is implemented:

| Criterion | How it's satisfied |
|---|---|
| User A has independent memory | `MEMORY.md` in `users/user_A/` — written via `secureWrite`, never shared |
| User B has independent behavior (SOUL) | `SOUL.md` in `users/user_B/` — seeded from `base/`, read via `secureRead` |
| User C has independent profile + tasks | `USER.md` and `TASKS.md` in `users/user_C/` — never shared |
| No shared writable files across users | Every runtime write goes through `secureWrite` — boundary enforced at the call site |
| Path traversal impossible | `secureRead`/`secureWrite` call `path.resolve()` and verify prefix before any I/O |
| Writes to `base/` impossible | `validateWritePath` checks `BASE_DIR` prefix and throws `SecureFsViolationError` |
| Cross-user file read impossible | `validatePath` checks resolved path starts with `users/user_<userId>/` — not another user's root |
| Uploads isolated per user | `uploads/` under `users/user_<id>/`; timestamp prefix prevents filename collision |
| Scratch space isolated + cleaned | `tmp/` under `users/user_<id>/`; cleared at start of every session by resolver |
| Plugin safety | `assertPluginTeamSafe` rejects unlisted plugins; context `fs` is proxied through `secureRead`/`secureWrite` |
| Shared tools and skills | Always resolved from `base/tools/` and `base/skills/` — never duplicated |
| Violations are logged | `SecureFsViolationError` always written to `team.files.logsDir` with full path details |
| Single machine, no new services | Pure filesystem + ~240 lines (`file-resolver.ts` + `secure-fs.ts` + `plugin-guard.ts`) |
| Codebase changes minimal | 5 upstream patches totaling ~95 lines; 100% backward compatible when `OPENCLAW_TEAM_MODE` unset |

## Risk Watch List

| Risk | Mitigation |
|---|---|
| Upstream renames request shape on `agent-command.ts` | Our patch is the smallest possible additive field; rebases are minute-scale, not hour-scale |
| Meta Cloud API approval friction | Ship Telegram first; treat WhatsApp as Week-4 work, slip-able to Week 5/6 without touching plan |
| `better-sqlite3` native build issues on operator machines | Pin a known-good version, document prebuilt binaries, fall back to `node:sqlite` (Node 22.5+) if needed |
| Session-key prefix doesn't cover one obscure code path | Single integration test that asserts user A's history is invisible to user B catches it |
| Team grows to 50+ users | Switch SQLite → Postgres via `OPENCLAW_TEAM_DATABASE_URL`; same schema. If features start needing what big plan covers (RBAC, billing, audit), migrate then. Not before. |

## What Stays Out, Explicitly

The simple plan does **not** ship and does **not** plan to ship in v1:

- Multi-tenant SaaS, hostname-based tenant routing
- RBAC matrix, role tables, permission catalog
- Postgres + Redis + BullMQ
- Kubernetes, Helm
- JWT, JWKS, RS256, refresh tokens, MFA, OAuth, SSO
- Email password reset
- Audit logs, billing meter, license check
- Admin React dashboard (~3,000 lines)
- WhatsApp multi-provider abstraction
- Per-tenant agent configs, per-tenant tool boundaries
- Plugin sandboxing
- CRM connectors, lead schema, real-estate-specific data model
- Stripe billing, usage events, plan limits

Each of these is a real feature with real value at SaaS scale. Each is also a multi-week task with significant code and operational surface. The full enterprise plan (`/kalim/enterprise-plan/`) covers them. **This plan is the bridge that gets a small team using OpenClaw with WhatsApp/Telegram in a month — without committing to any of that scaffolding.**

## When to Graduate to the Full Enterprise Plan

Move only when at least one of these is true:

1. More than ~10 users active concurrently, or contention on the SQLite file is observable.
2. Real money is being made and a single-machine SPOF is a business risk.
3. A second customer/team needs hard isolation that workspace-segmentation alone doesn't provide (e.g. legal, compliance).
4. Per-user billing or usage metering is required.
5. RBAC beyond `is_admin` is genuinely needed (e.g. read-only roles for auditors).
6. SSO / OAuth is contractually mandated by a customer.

Until any of those hits: **resist scope creep**. The big plan is a roadmap, not a checklist. The simple plan is enough.

## One-Line Recommendation

> Ship the **~1,105-line `src/team/`** overlay. Each user gets a fully isolated subtree (`SOUL.md`, `AGENTS.md`, `MEMORY.md`, `USER.md`, `TASKS.md`, `uploads/`, `conversations/`, `tmp/`, `tool_cache/`, `logs/`) enforced by `secureRead`/`secureWrite` path-boundary wrappers. Skills and tools shared read-only from `base/`. No shared writable file exists. Path traversal and cross-user access throw `SecureFsViolationError` and are logged. Telegram first, WhatsApp Meta-Cloud second. Single EC2, Docker Compose, SQLite. The big plan stays on the shelf until the project genuinely outgrows this one.
