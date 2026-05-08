# Agent Architecture

## Purpose
Core agent runtime, prompts, tool selection, and execution.

## Findings

### Agent Execution Pipeline

```
Inbound message (channel / CLI / cron / API)
  -> src/agents/agent-command.ts (executeAgentCommand)
    -> resolveAgentRuntimeConfig() (load agent config)
      -> ensureAuthProfileStore() (resolve provider auth)
        -> loadModelCatalog() (select model)
          -> resolveAgentScope() (workspace, skills, sandbox)
            -> buildPrompt() (system prompt + context + history)
              -> attempt-execution.runtime.ts
                -> LLM API call (OpenAI / Anthropic / Google / etc.)
                  <- streaming response (SSE / WebSocket)
                    -> tool_use detection
                      -> pi-tools.ts (resolve tool)
                        -> tool execution (sandbox / browser / etc.)
                          -> tool_result formatting
                            -> continue LLM call (if more tools needed)
                              -> final text response
                                -> delivery.runtime.ts (send reply)
```

### Key Components

1. **`src/agents/agent-command.ts`**
   - Main orchestration (~1,218 lines)
   - Lazy-loads 15+ runtime modules for performance
   - Handles model fallback, thinking levels, verbose modes
   - Manages agent run context and cancellation

2. **`src/agents/command/attempt-execution.runtime.ts`**
   - Builds prompt and calls LLM
   - Handles streaming response parsing
   - Tool use detection and routing
   - Retry logic with exponential backoff

3. **`src/agents/pi-tools.ts`**
   - Core tool registry: `read`, `write`, `edit`, `bash`, `browser`, `canvas`, etc.
   - Tool schema generation for LLM
   - Tool result formatting

4. **`src/agents/model-selection.ts`**
   - Model key resolution: `provider/model` format
   - Auth profile matching
   - Default model fallback chain

5. **`src/agents/model-fallback.ts`**
   - Provider fallback on error / rate-limit
   - Rotates through available auth profiles
   - Marks providers unavailable temporarily

6. **`src/agents/sandbox.ts`**
   - Sandbox orchestration for non-main sessions
   - Backends: Docker, SSH, OpenShell, local
   - Tool policy enforcement

### Agent Types

| Type | Trigger | Sandbox | Workspace |
|------|---------|---------|-----------|
| Main | CLI / default channel | No (local) | `~/.openclaw/workspace/main/` |
| Subagent | `/new`, agent spawn | Optional | `~/.openclaw/workspace/<session>/` |
| Cron | Scheduled job | Optional | Per-cron workspace |
| Node | Remote node invoke | Optional | Remote workspace |

### System Prompt

- `src/agents/command/attempt-execution.shared.ts` — `resolveAcpPromptBody()`
- Includes: OpenClaw version, date/time, workspace path, available tools
- Skills appended as tool definitions
- Provider-specific prompt adjustments

### Thinking Levels

- `src/auto-reply/thinking.ts` — `formatThinkingLevels()`
- Levels: `disabled`, `concise`, `detailed`
- Affects how agent explains reasoning before answering
- Supported only by Anthropic Claude (extended thinking)

### Cancellation

- `src/agents/announce-idempotency.ts` — idempotency keys
- `src/agents/agent-command.ts` — run cancellation
- `GET /sessions/kill/:sessionKey` — HTTP kill endpoint
- Cancel propagates through LLM stream abort

## Evidence
- `src/agents/agent-command.ts` — main orchestration
- `src/agents/command/attempt-execution.runtime.ts` — execution
- `src/agents/pi-tools.ts` — tool registry
- `src/agents/model-selection.ts` — model resolution
- `src/agents/model-fallback.ts` — fallback logic
- `src/agents/sandbox.ts` — sandbox orchestration

## Notes
- Agent runtime is single-threaded per session
- Multiple sessions can run concurrently
- LLM calls are async (non-blocking)
- Tool execution may be sync or async depending on tool
- Streaming responses sent to client in real-time
