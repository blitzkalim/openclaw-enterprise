# Background Tasks & Workers

## Overview

OpenClaw handles long-running work through background tasks. Not everything completes within the request/response cycle.

## Task Types

| Task | Trigger | Handler |
|------|---------|---------|
| Agent run | User message | Agent runtime |
| Tool execution | LLM tool call | Tool handler |
| Media download | Inbound media | Channel extension |
| Memory indexing | After agent reply | Vector embedder |
| Memory search | During context build | Vector search |
| Config reload | File change / API | Config loader |
| Diagnostics export | Scheduled / manual | Diagnostics service |

## Async Agent Execution

```
Inbound message
  |
  v
Queue agent_run task
  |
  v
Respond immediately ("Processing...")
  |
  v
Background worker runs agent
  |
  v
Stream results to WS / channel
```

## Task Registry

```typescript
type BackgroundTask = {
  id: string;
  type: "agent_run" | "tool_execution" | "media_processing";
  status: "queued" | "running" | "completed" | "failed";
  priority: number;
  createdAt: Date;
  abortController?: AbortController;
};
```

## Cron / Scheduled Tasks

From `src/cron/` directory:

| Job | Interval | Purpose |
|-----|----------|---------|
| Session cleanup | Daily | Remove old session files |
| Media cleanup | Daily | Remove old media files |
| Memory compaction | Weekly | Optimize vector DB |
| Diagnostic rotation | Weekly | Archive old diagnostic logs |

## Concurrency

- Max concurrent agent runs: configurable (default: no hard limit observed)
- Tool executions: per-agent, sequential or parallel
- Media processing: async, fire-and-forget

## Error Handling

- Task failures logged to diagnostics
- Failed tasks may retry (exponential backoff)
- User notified of failures via reply or WS event

## Key Files

- `src/cron/` — Scheduled job definitions
- `src/gateway/server-runtime-state.ts` — Task registry
- `src/agents/runtime/` — Agent execution
- `src/channels/outbound-messaging.ts` — Async replies

---

*Evidence: `src/cron/` directory, `src/gateway/server-runtime-state.ts`, agent runtime patterns.*
