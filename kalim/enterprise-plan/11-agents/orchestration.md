# Agent Orchestration

## Purpose
How multiple agents, subagents, and node invocations coordinate.

## Findings

### Subagent System

- File: `src/agents/acp-spawn.ts`
- Subagents are child agent runs within the same process
- `subagent.run()` — start subagent with new session
- `subagent.waitForRun()` — wait for completion
- `subagent.getSessionMessages()` — read transcript
- `subagent.deleteSession()` — cleanup

### Subagent Parameters

```typescript
interface SubagentRunParams {
  sessionKey: string;
  message: string;
  provider?: string;
  model?: string;
  extraSystemPrompt?: string;
  lane?: string;
  lightContext?: boolean;
  deliver?: boolean;
  idempotencyKey?: string;
}
```

### Node Invocation

- File: `src/agents/command/node-invoke.ts`
- Remote nodes = paired devices (iOS, Android, macOS)
- `nodes.list()` — list connected nodes
- `nodes.invoke()` — send command to remote node
- `timeoutMs` for remote operations
- Cross-device tool execution

### ACP (Agent Communication Protocol)

- File: `src/acp/control-plane/manager.ts`
- Coordinates agent runs across sessions
- Handles run queueing, priority, cancellation
- `src/acp/runtime/session-meta.ts` — session metadata

### Session Isolation

- Each session has independent:
  - Conversation history
  - Workspace directory
  - Model/provider selection
  - Sandbox mode
  - Tool policy

### Shared State

- Config is global (all sessions share)
- Model catalog is global
- Auth profiles are global
- Task registry is global
- Cron jobs are global

### Parallel Execution

- Multiple sessions can run simultaneously
- Each session runs in its own async context
- No worker threads — all in Node.js event loop
- CPU-intensive tasks (image gen) may spawn child processes

### Run Queue

- `src/agents/subagent-announce-queue.ts` — subagent queue
- `src/process/command-queue.ts` — process command queue
- Queue ordering: FIFO with priority boost for interactive sessions

## Evidence
- `src/agents/acp-spawn.ts` — subagent spawn
- `src/agents/command/node-invoke.ts` — node invocation
- `src/acp/control-plane/manager.ts` — ACP manager
- `src/agents/subagent-announce-queue.ts` — queue
- `src/plugins/runtime/types.ts` — runtime types

## Notes
- No distributed agent coordination (single process)
- Node invocation limited to paired devices on same network
- Subagents share process memory — no true isolation
- Sandbox provides filesystem-level isolation, not memory isolation
