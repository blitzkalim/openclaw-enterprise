# Internal Service Flow

## Purpose
Show how core modules call each other during message processing.

## Findings

### Inbound Message → Agent → Reply Flow

```
Channel Plugin (e.g., WhatsApp, Telegram)
  → channel-runtime.ts — normalize inbound message to internal envelope
  → src/channels/plugins/account-helpers.ts — resolve account & session
  → src/auto-reply/reply/dispatcher-registry.ts — queue reply dispatch
    → src/agents/agent-command.ts — execute agent command
      → resolveAgentRuntimeConfig() — load agent config
      → ensureAuthProfileStore() — resolve provider auth
      → loadModelCatalog() — select model
      → attempt-execution.runtime.ts — build prompt & call LLM
        → openai-transport-stream.ts / anthropic-transport-stream.ts
        → LLM response streaming
      → delivery.runtime.ts — send reply back to channel
        → runtime-channel.ts — channel-specific send
          → WhatsApp/Telegram/Discord API call
```

### Tool Invocation Flow

```
Agent receives tool_use request from LLM
  → pi-tools.ts — resolve tool by name
  → Tool routing:
    - browser → extensions/browser/src/browser/*.ts
    - canvas → src/canvas-host/server.ts
    - cron → src/cron/service/ops.ts
    - sessions_list → src/sessions/session-store.ts
    - read/write/edit → src/agents/sandbox/fs-bridge.ts (if sandboxed)
  → Tool result formatting
  → Return to LLM as tool_result
```

### Config Mutation Flow

```
Config change request (CLI or API)
  → src/config/mutate.ts — mutateConfigFile()
  → src/config/io.ts — writeConfigFile()
  → src/config/runtime-snapshot.ts — notify listeners
  → src/gateway/server-reload-handlers.ts — reload affected services
  → Channel reconnection if channel config changed
```

### Cron Job Execution Flow

```
Cron timer fires (src/cron/service/timer.ts)
  → src/cron/service/jobs.ts — execute job
  → src/cron/isolated-agent/run.ts — spawn isolated agent run
    → src/agents/agent-command.ts — same execution path as inbound messages
  → src/cron/run-log.ts — log execution result
```

## Evidence
- `src/agents/agent-command.ts` — central agent orchestration
- `src/auto-reply/reply/dispatcher-registry.ts` — reply dispatch
- `src/channels/plugins/account-helpers.ts` — account resolution
- `src/cron/service/jobs.ts` — cron execution
- `src/agents/pi-tools.ts` — tool registry

## Notes
- All communication is in-process; no inter-service network calls
- Plugins are dynamically imported via lazy boundaries (`*.runtime.ts`)
- Session store is file-based JSON under `~/.openclaw/sessions/`
- Agent workspace is directory-based under `~/.openclaw/workspace/`
