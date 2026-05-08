# 06 — Agent Usage

## Rule: Don't Touch Agents

OpenClaw's agent system already does everything we need: model routing, prompt building, tool dispatch, streaming, memory hooks. Per `/kalim/enterprise-plan/09-agent-skill-plugin-model/`, the runtime handles ~1,200 lines of orchestration in `src/agents/agent-command.ts`. We add **zero** logic to it.

What we change is **how we call it**: with a user-scoped session key and a `team` context object. Everything downstream — agent config, skill loading, plugin hooks — stays identical.

## How Agents Are Reused

| Concern | Today (single user) | Team mode |
|---|---|---|
| Agent config (`AGENTS.md`) | One global `workspace/base/AGENTS.md` | **Per-user** `workspace/users/user_<id>/AGENTS.md` — auto-seeded from `base/` on first request |
| Agent personality (`SOUL.md`) | One global `workspace/base/SOUL.md` | **Per-user** `workspace/users/user_<id>/SOUL.md` — auto-seeded from `base/` on first request |
| Persistent memory (`MEMORY.md`) | Not per-user | **Per-user** `workspace/users/user_<id>/MEMORY.md` — starts empty, agent appends over time |
| Skills | `base/skills/` and `extensions/*/skills/` | **Same.** Always from `base/`. Never per-user. |
| Tools | All tools in agent's allowlist | **Same.** Always from `base/`. Never per-user. |
| Plugin runtime | Loaded once per process | **Same.** Loaded once. |
| Session id | Derived from connection / channel thread | Prefixed: `u:<userId>:…` |
| Vector memory | One LanceDB table per agent | **Partitioned by `userId`** via session-key prefix |

The simple plan does **not** support per-user or per-workspace agent configs. All users share the same agent fleet. If a team needs different agents for different sub-teams, they create a workspace and write that into the agent's system prompt or skill logic — not into the runtime.

This is a real cut from the big plan, where `agent_configs` is a per-tenant Postgres table. We trade flexibility for ~500 lines of code we don't write.

## Attaching User Context

The `team` object flows from auth → router → runtime as an opaque field:

```ts
type TeamCtx = {
  userId: string;
  workspaceId: string | null;
  isAdmin: boolean;
  source: 'cookie' | 'api-token' | 'legacy';
};
```

It is plumbed into the runtime call but the runtime itself **only uses two fields**:

1. `userId` — for session keying and memory partitioning
2. `workspaceId` — only if the install has multiple workspaces; usually ignored

Skills and plugins that want user info read it from the runtime's request context (`ctx.team`). Most don't need to. The lead-capture skill (a starter agent in the big plan) does, because it stamps `assigned_to = userId` on new lead records.

## Per-User File Injection (NEW)

Before the agent runtime executes, it receives the full resolved `UserFiles` struct via `ctx.team.files`. The runtime reads `SOUL.md` and `AGENTS.md` from **these paths** instead of the global workspace root. `MEMORY.md`, `USER.md`, and `TASKS.md` are prepended to the prompt context and appended/updated at the end of a successful session. All scratch output, tool results, logs, and transcripts go into the user's scoped directories — never to a shared location.

```ts
// src/agents/agent-command.ts patch — additive, ~25 new lines

const baseSoulPath   = path.join(WORKSPACE_ROOT, 'base', 'SOUL.md');
const baseAgentsPath = path.join(WORKSPACE_ROOT, 'base', 'AGENTS.md');

const soulContent   = team?.files?.soulPath
  ? await fs.readFile(team.files.soulPath,   'utf8')
  : await fs.readFile(baseSoulPath,           'utf8');   // fallback for legacy/admin

const agentsContent = team?.files?.agentsPath
  ? await fs.readFile(team.files.agentsPath, 'utf8')
  : await fs.readFile(baseAgentsPath,         'utf8');

const memoryContent = team?.files?.memoryPath
  ? await fs.readFile(team.files.memoryPath, 'utf8').catch(() => '')
  : '';
```

### MEMORY.md — Read + Write Pattern

```
Read:  loaded at start of every request → prepended to system prompt as prior context
Write: at end of a successful request, if the agent emits a MEMORY_UPDATE event,
       append the new memory line to team.files.memoryPath
```

The write is a simple **append** — plain text lines, no JSON, no database row. A soft cap (default 8 KB, configurable) trims oldest lines from the top when exceeded, preventing unbounded growth.

### Guarantee: Agent Reads/Writes ONLY the Resolved Paths

```
agent runtime reads:
  soul         → team.files.soulPath         (never base/ directly for real users)
  agents       → team.files.agentsPath        (never base/ directly for real users)
  memory       → team.files.memoryPath        (never another user's memoryPath)
  user profile → team.files.userProfilePath   (USER.md — this user only)
  tasks        → team.files.tasksPath          (TASKS.md — this user only)
  tools        → base/tools/                  (always shared — read-only)
  skills       → base/skills/                 (always shared — read-only)

agent runtime writes:
  memory updates    → appended to team.files.memoryPath      (this user only)
  user profile      → written to  team.files.userProfilePath  (this user only)
  task updates      → written to  team.files.tasksPath         (this user only)
  inbound files     → streamed to team.files.uploadsDir        (this user only)
  session transcript→ written to  team.files.conversationsDir  (this user only)
  scratch / tmp     → written to  team.files.tmpDir            (this user only, cleared each session)
  tool cache        → written to  team.files.toolCacheDir      (this user only)
  execution logs    → written to  team.files.logsDir           (this user only)

base/ writes:
  NONE — base/ is permanently read-only at runtime
```

No agent call may construct or traverse a path outside the resolved user directory. Enforcement: `resolveUserFiles` returns absolute paths built from `userId` only; the runtime never interpolates user-supplied strings into file paths. **No shared writable path exists.**

## Per-User Memory Isolation

OpenClaw's vector memory (`src/memory/`) keys entries by a session id. We make sure every entry for a given user is namespaced under that user.

Two equivalent strategies; pick whichever the existing memory layer makes easiest:

**Strategy 1 — Prefix the session id (preferred)**

The session-key util (`src/sessions/session-key-utils.ts`) gets a 5-line edit:

```ts
export function deriveSessionKey(parts) {
  const base = existingDerivation(parts);
  if (parts.team?.userId) return `u:${parts.team.userId}:${base}`;
  return base;
}
```

LanceDB / vector lookups already key on session id, so this gives free isolation. No memory layer changes.

**Strategy 2 — Add a `user_id` filter in memory queries**

Edit memory query call sites in `src/memory/` to include a `user_id` predicate. Bigger change, more files touched, more risk. **We don't do this.** We use Strategy 1.

## Conversation History per User

OpenClaw stores per-session history in `~/.openclaw/sessions/*.json` keyed by session id. Once session ids are user-prefixed (Strategy 1 above), a user's chat history is automatically isolated. Two users on one install cannot see each other's transcripts.

For channel-driven conversations, the session key is `u:<userId>:<channel>:<threadId>`, so a user's WhatsApp thread, Telegram thread, and web-UI thread are all separate but all attributed to them.

## What Agents See in Their Tool Calls

When the agent runtime calls a tool, the tool gets the existing OpenClaw call context **plus** `ctx.team`. A skill that wants to record "lead created by Amit" reads `ctx.team.userId`. A skill that doesn't care ignores it. **No tool is forced to change.** Existing tools and skills work as-is.

## Concurrency

Two users on the same install hitting the same agent at the same time:

- Agent runtime is reentrant — that's already true today (one user can have many concurrent sessions).
- Memory writes are SQLite/LanceDB and serialize per file.
- LLM calls are independent HTTP requests upstream.
- No new locking is needed.

## What We Are NOT Doing

- ❌ **Per-tenant agent configs.** Big plan: `agent_configs` Postgres table. Simple plan: one global config.
- ❌ **Tenant tool boundaries.** Big plan: `tools_enabled` JSONB filtered per tenant. Simple plan: agent allowlists are global.
- ❌ **Per-user model picking.** All users use whatever model the agent is configured with.
- ❌ **Per-user rate limiting on LLM tokens.** No usage meter, no billing. Out of scope.
- ❌ **Subagent isolation.** Subagents inherit parent's `team` context.
- ⚠️ **Plugin sandboxing (partial).** Plugins that use the injected `fs` context receive `secureRead`/`secureWrite`-backed wrappers. Plugins that import `node:fs` directly bypass this. The `team_safe: true` manifest field (enforced by `src/team/plugin-guard.ts`) is the operator's opt-in gate. Full sandboxing (Worker threads / Docker) is deferred to the big plan.

## Migration Path When You Outgrow This

If the team needs per-user agent configs or per-user model overrides, the big plan's `agent_configs` table drops in cleanly: it's keyed by `tenant_id`, which we'd map to `workspace_id`. The runtime patch (~10 lines today) extends to look up agent config by workspace before falling back to global. That's the only change. Everything else carries over.

## Net Code Change to Agent Layer

| File | Change | Lines |
|---|---|---|
| `src/agents/agent-command.ts` | Accept optional `team`; read SOUL/AGENTS/MEMORY/USER/TASKS via `secureRead`; write MEMORY update via `secureWrite` on session end | +25 |
| `src/sessions/session-key-utils.ts` | Prepend `u:<userId>:` when team context present | +5 |
| `src/team/file-resolver.ts` | **NEW** — `resolveUserFiles(userId)`: ensure all dirs, seed SOUL/AGENTS, create MEMORY/USER/TASKS, clear tmp/ | ~120 |
| `src/team/secure-fs.ts` | **NEW** — `secureRead`, `secureWrite`, `validatePath`, `validateWritePath`, `SecureFsViolationError` | ~90 |
| `src/team/plugin-guard.ts` | **NEW** — `assertPluginTeamSafe(manifest)`: reject plugins without `team_safe: true` | ~30 |
| `src/plugins/plugin-loader.ts` | Inject `secureRead`/`secureWrite`-backed fs proxy into plugin context when team mode is on | +30 |
| `src/memory/*` | **No changes** | 0 |
| `src/skills/*` | **No changes** | 0 |

**~300 lines of changes** across the agent/file/plugin layer. `secure-fs.ts` is the enforcement chokepoint; `file-resolver.ts` is the path provisioner; all agent patches are inside `if (teamCtx)` guards.
