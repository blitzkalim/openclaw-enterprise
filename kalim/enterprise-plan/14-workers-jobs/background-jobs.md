# Background Jobs

## Purpose
Document cron jobs, scheduled tasks, and background processing.

## Findings

### Cron System

- Directory: `src/cron/`
- File: `src/cron/service/jobs.ts` — job execution engine
- File: `src/cron/service/timer.ts` — scheduling timer
- File: `src/cron/isolated-agent/run.ts` — isolated agent runner for cron

### Cron Job Types

1. **Schedule Types**
   - `cron` — standard cron expression (`*/5 * * * *`)
   - `every` — interval in milliseconds (`everyMs: 3600000`)
   - `once` — one-time execution at specific time
   - `absolute` — run at exact timestamp

2. **Payload Types**
   - `systemText` — send text message to session
   - `toolCall` — invoke tool directly
   - `agentCommand` — run agent with prompt

### Cron Execution Flow

```
Timer fires (src/cron/service/timer.ts)
  -> src/cron/service/jobs.ts (executeJob)
    -> src/cron/isolated-agent/run.ts (isolated run)
      -> src/agents/agent-command.ts (agent execution)
        -> LLM call (if agentCommand payload)
          -> delivery.runtime.ts (send result)
    -> src/cron/run-log.ts (log result)
```

### Cron Configuration

```json5
{
  "cron": {
    "jobs": [
      {
        "id": "morning-brief",
        "name": "Morning Brief",
        "enabled": true,
        "schedule": { "kind": "cron", "expression": "0 8 * * *" },
        "payload": { "kind": "systemText", "text": "Generate morning brief" },
        "delivery": { "channelId": "telegram", "accountId": "mybot", "sessionKey": "main" }
      }
    ]
  }
}
```

### Task Registry

- File: `src/tasks/`
- SQLite-backed task tracking
- Task statuses: `queued`, `running`, `succeeded`, `failed`, `timed_out`, `lost`
- Task sweeper runs every 60 seconds
- Tasks older than 7 days auto-pruned

### Maintenance Sweeper

- File: `src/tasks/task-registry.maintenance.ts`
- Reconciles tasks with cron run logs
- Marks stale tasks as `lost`
- Cleans up old task records
- Yield batch size: 25 tasks per event loop tick

### Stuck Run Detection

- `STUCK_RUN_MS = 2 * 60 * 60 * 1000` (2 hours)
- Cron jobs stuck longer than 2 hours marked lost
- `src/cron/service/jobs.ts` — stuck detection

### Failure Alerting

- `src/cron/service/failure-alert.ts` — failure notifications
- Alerts sent to configured channel on repeated failures
- Backoff schedule: 30s, 60s, 5min, 15min, 60min

### No Background Worker Pool

- No worker threads for background jobs
- No child process pool
- Cron jobs run in same event loop as gateway
- Heavy cron jobs may impact gateway responsiveness

## Evidence
- `src/cron/service/jobs.ts` — job execution
- `src/cron/service/timer.ts` — scheduling
- `src/cron/isolated-agent/run.ts` — isolated runner
- `src/cron/run-log.ts` — run logging
- `src/tasks/task-registry.maintenance.ts` — maintenance
- `src/cron/types.ts` — type definitions

## Notes
- Cron is the primary background job mechanism
- No traditional job queue (BullMQ, Celery, etc.)
- Cron jobs can trigger agents, tools, or simple messages
- Task registry provides visibility but not execution scheduling
- All background processing is single-threaded
