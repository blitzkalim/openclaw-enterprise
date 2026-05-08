# EPIC 3 — Agent Runtime Integration

> Source: `06-agent-usage/agents.md`, `02-extension-strategy/strategy.md`, `08-code-change-plan/changes.md`. Goal: thread `team.userId` and `team.files` through the existing agent runtime without rewriting it.

---

## STORY 3.1 — Add `team` Field to Runtime Request Shape

### 🎯 Description
Extend the existing inbound runtime request type in `src/agents/agent-command.ts` to accept an optional `team` field. The runtime passes it into the per-call `ctx`. Pure typing + plumbing change. No logic change.

### ⚙️ Implementation Details

**File**: `src/agents/agent-command.ts` (PATCH, ~5 of the +25 lines).

```ts
type RuntimeRequest = {
  /* existing fields */
  team?: {
    userId: string;
    workspaceId: string | null;
    isAdmin: boolean;
    source: 'cookie' | 'api-token' | 'legacy';
    files?: UserFiles;
  };
};

// In the per-call ctx builder:
const ctx = { ...existingCtx, team: req.team };
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer working on src/agents/agent-command.ts (~1,200 lines, the agent runtime orchestrator).

TASK
Add optional `team` field to the inbound runtime request and propagate it into the per-call ctx.

REQUIREMENTS
1. Identify the request type used by the agent runtime entry point. Search for the function that takes the inbound message and constructs a per-request ctx (likely `handleInbound` or similar).
2. Add a `team?` field to that type:
       team?: {
         userId: string;
         workspaceId: string | null;
         isAdmin: boolean;
         source: 'cookie' | 'api-token' | 'legacy';
         files?: import('../team/file-resolver').UserFiles;
       };
3. In the ctx builder, attach `team: req.team` so downstream skills/tools can access ctx.team.
4. No other changes — no LLM call modifications, no tool dispatch changes, no streaming changes.
5. If the type is in a separate file (e.g. `src/agents/agent-runtime-config.ts`), put the type extension there.

CONSTRAINTS
- Additive only. Existing callers must continue to work without supplying `team`.
- Do not break the existing test suite.
- Lazy-import the team module type to avoid circular deps. Use `import type` only.

OUTPUT
- The patch to src/agents/agent-command.ts (and the type-defining file if separate).
```

### 🧪 Testing Instructions
1. Compile the project — no TS errors.
2. Run the existing OpenClaw test suite with `OPENCLAW_TEAM_MODE` unset → all tests pass.
3. Call the runtime entry point in a unit test with `team` populated → ctx.team is reachable from inside a tool callback.

### ✅ Acceptance Criteria
- [ ] Type compiles.
- [ ] Existing tests unchanged in behavior.
- [ ] `ctx.team` reachable to tools/skills.

---

## STORY 3.2 — Override `workspaceDir` and Read User Files via `secureRead`

### 🎯 Description
When `team.files` is present, the agent runtime must read `SOUL.md`, `AGENTS.md`, `MEMORY.md`, `USER.md`, and `TASKS.md` from the user's overlay paths instead of the global `base/`. Reads go through `secureRead(userId, path)` (Story 5.1) for boundary enforcement.

Source: `06-agent-usage/agents.md` "Per-User File Injection".

### ⚙️ Implementation Details

**File**: `src/agents/agent-command.ts` (PATCH, ~15 of the +25 lines).

The patch lives inside an `if (team?.files)` guard. When absent (legacy admin or `OPENCLAW_TEAM_MODE` off), the runtime reads from `base/` exactly as today.

```ts
import { secureRead } from '../team/secure-fs';

let soulContent: string;
let agentsContent: string;
let memoryContent = '';
let userProfileContent = '';
let tasksContent = '';

if (team?.files) {
  workspaceDir = path.join(WORKSPACE_ROOT, 'users', `user_${team.userId}`);
  soulContent       = await secureRead(team.userId, team.files.soulPath);
  agentsContent     = await secureRead(team.userId, team.files.agentsPath);
  memoryContent     = await secureRead(team.userId, team.files.memoryPath).catch(() => '');
  userProfileContent= await secureRead(team.userId, team.files.userProfilePath).catch(() => '');
  tasksContent      = await secureRead(team.userId, team.files.tasksPath).catch(() => '');
} else {
  soulContent   = await fs.readFile(path.join(BASE_DIR, 'SOUL.md'),   'utf8');
  agentsContent = await fs.readFile(path.join(BASE_DIR, 'AGENTS.md'), 'utf8');
}

const systemPrompt = buildPrompt({ soul: soulContent, agents: agentsContent, memory: memoryContent, userProfile: userProfileContent, tasks: tasksContent });
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Patch src/agents/agent-command.ts to read SOUL.md, AGENTS.md, MEMORY.md, USER.md, TASKS.md from per-user paths when team.files is present.

REQUIREMENTS
1. Find where the runtime currently reads SOUL.md and AGENTS.md (or whatever the prompt-source files are called in the existing OpenClaw codebase — they may be named differently, but the role is the same: agent personality and config).
2. Wrap the existing read in `if (team?.files) { secureRead(team.userId, team.files.soulPath) ... } else { /* existing base/ read */ }`.
3. Read MEMORY.md, USER.md, TASKS.md only when `team?.files` is present (these don't have a single-user fallback).
4. Pass the contents into the existing prompt builder. If the existing prompt builder doesn't take memory/user/tasks, append them as fenced sections at the end of the system prompt:
       ----
       # Persistent memory
       ${memoryContent}

       # User profile
       ${userProfileContent}

       # Pending tasks
       ${tasksContent}
5. Override the runtime's workspaceDir variable (find the existing one) to point at the user's directory when team.files is present.
6. Use try/catch with `.catch(() => '')` only on MEMORY/USER/TASKS reads — those files may legitimately be empty / freshly created.
7. Hard-fail (let secureRead throw) on SOUL/AGENTS reads.

CONSTRAINTS
- All reads inside the team branch use secureRead, never bare fs.readFile.
- Existing single-user code path must remain bit-identical when team.files is absent.
- Maximum 15 net new lines.

OUTPUT
- The patched function in src/agents/agent-command.ts (full updated function or unified diff).
```

### 🧪 Testing Instructions
1. With `team.files` populated → agent prompt logs include the user's MEMORY.md and USER.md content (instrument the prompt builder for this test).
2. Without `team.files` → prompt logs identical to today's single-user run.
3. Two users with different MEMORY.md content → each gets their own context, no cross-contamination.
4. SOUL.md missing for a user → secureRead throws; the runtime returns 500 (channel router converts to a polite "internal error" reply).
5. MEMORY.md missing → caught, treated as empty, agent still runs.

### ✅ Acceptance Criteria
- [ ] Per-user prompt includes per-user files.
- [ ] No file outside `users/user_<id>/` is ever read for a real user.
- [ ] Single-user fallback unchanged.
- [ ] All reads go through `secureRead`.

---

## STORY 3.3 — Append to `MEMORY.md` on Successful Session via `secureWrite`

### 🎯 Description
After a successful agent turn, if the agent emits a `MEMORY_UPDATE` event with a string line, append it to `team.files.memoryPath` via `secureWrite` + the `appendMemory` helper from Story 2.3.

### ⚙️ Implementation Details

**File**: `src/agents/agent-command.ts` (PATCH, ~5 of the +25 lines).

```ts
import { secureWrite } from '../team/secure-fs';
import { appendMemory } from '../team/memory';

// At session end, after streaming completes:
if (team?.files && memoryUpdate) {
  await appendMemoryViaSecureWrite(team.userId, team.files.memoryPath, memoryUpdate);
}

async function appendMemoryViaSecureWrite(userId, filePath, line) {
  const current = await secureRead(userId, filePath).catch(() => '');
  const next = trimToCap(current + ensureNewline(current) + line.trim() + '\n', 8192);
  await secureWrite(userId, filePath, next);
}
```

The `MEMORY_UPDATE` emission is a convention the agent's system prompt instructs the LLM to follow (e.g. "if you learn something durable, end your reply with `<memory>...</memory>`"). The runtime parses for that and calls the helper.

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Patch src/agents/agent-command.ts to append to MEMORY.md at session end via secureWrite.

REQUIREMENTS
1. After the agent reply has streamed to completion, scan the reply for `<memory>...</memory>` blocks (case-insensitive). Each block's inner text becomes one memory line.
2. If team?.files?.memoryPath is present:
   - For each memory block:
       const line = block.replace(/\s+/g, ' ').trim();
       if (!line) continue;
       const current = await secureRead(team.userId, team.files.memoryPath).catch(() => '');
       const next = trimToCap(current + (current && !current.endsWith('\n') ? '\n' : '') + line + '\n', 8192);
       await secureWrite(team.userId, team.files.memoryPath, next);
3. trimToCap: split by '\n', shift oldest until total bytes <= cap.
4. Strip the `<memory>...</memory>` blocks from the reply BEFORE sending to the channel — they are internal control markers, not user-facing.

CONSTRAINTS
- All reads/writes go through secureRead/secureWrite.
- Cap is 8192 bytes (configurable via env later — for now, hardcode).
- Concurrent writes are serialized per-user via a tiny per-user mutex (Map<userId, Promise>) to avoid lost updates.

OUTPUT
- Patched src/agents/agent-command.ts (the relevant function or full file).
- Updated tests asserting that <memory> blocks are persisted and stripped from the reply.
```

### 🧪 Testing Instructions
1. Mock the LLM to return `Hello! <memory>user prefers Hindi</memory>`.
2. Run a turn with `team.files` populated.
3. Reply sent to channel = `Hello!` (block stripped).
4. `MEMORY.md` now contains `user prefers Hindi`.
5. Repeat 100 times → file stays under 8192 bytes (oldest lines trimmed).
6. Two concurrent turns for same user → both lines persisted (no lost update).

### ✅ Acceptance Criteria
- [ ] `<memory>` blocks captured and persisted.
- [ ] Blocks stripped from outbound reply.
- [ ] Cap honored.
- [ ] Concurrent writes serialized.

---

## STORY 3.4 — Patch `session-key-utils.ts` for User-Prefix

### 🎯 Description
Prefix the session key with `u:<userId>:` whenever `team.userId` is present in the derivation input. This is the single change that makes vector memory, session JSON files, and conversation history user-isolated for free.

### ⚙️ Implementation Details

**File**: `src/sessions/session-key-utils.ts` (PATCH, +5 lines).

```ts
export function deriveSessionKey(parts) {
  const base = existingDerivation(parts);
  const userId = parts.team?.userId;
  return userId ? `u:${userId}:${base}` : base;
}
```

### 🤖 AI CODING PROMPT

```
You are a senior Node.js engineer.

TASK
Patch src/sessions/session-key-utils.ts to prefix session keys with `u:<userId>:` when team context is present.

REQUIREMENTS
1. Identify the existing fn that derives a session key. Inspect its parameter shape; the existing logic stays UNCHANGED.
2. Accept an optional `team` field in the input shape (or a new parameter, whichever matches the existing convention).
3. After the existing logic computes `base`, return `userId ? `u:${userId}:${base}` : base`.
4. userId source: parts.team?.userId — never from request-supplied data.
5. If callers exist in src/agents/agent-command.ts, src/channels/*, etc. — find them and pass the team through.

CONSTRAINTS
- Existing tests in src/sessions/ must pass without modification.
- The new prefix is `u:` + userId + `:` — a single colon separator both sides; no other changes.

OUTPUT
- The patch (unified diff) for src/sessions/session-key-utils.ts.
- A list of caller sites updated (if any) with their diffs.
```

### 🧪 Testing Instructions
1. Without team → `deriveSessionKey({ … })` returns whatever it returned before.
2. With team `{ userId: 'amit' }` → key starts with `u:amit:`.
3. Two users with same threadId → keys differ.
4. Vector memory query keyed by session id is naturally scoped per user (verify by writing a memory entry for user A, then querying as user B → no result).
5. `~/.openclaw/sessions/` shows files starting with `u:<userId>:` for team-mode users.

### 📥 Example Input
```ts
deriveSessionKey({ channel: 'whatsapp', threadId: '+919876543210', team: { userId: 'amit' } });
```

### 📤 Expected Output
```
"u:amit:wa:+919876543210"
```

### ✅ Acceptance Criteria
- [ ] Prefix applied only when team.userId is present.
- [ ] No regression in single-user mode.
- [ ] Vector-memory and session JSON isolation verified end-to-end.
