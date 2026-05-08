# Agent Orchestration

## Orchestration Overview

OpenClaw's agent system supports **multi-step reasoning** with optional planning, tool execution loops, and memory-augmented context building.

## Execution Modes

### 1. Direct Mode (Single LLM Call)

```
User message
  |
  v
Build context (history + memory)
  |
  v
Single LLM call
  |
  v
Return response directly
```

**Use case:** Simple Q&A, no tool use needed.

### 2. Tool-Enabled Mode (Reactive Tool Calling)

```
User message
  |
  v
Build context (history + memory + tool definitions)
  |
  v
LLM call with tools
  |
  v
LLM returns: text response OR tool_calls
  |
  +-- If text: return to user
  +-- If tool_calls:
        |
        v
        Execute each tool
        |
        v
        Append results to messages
        |
        v
        Re-prompt LLM with results
        |
        v
        LLM returns final response
```

**Use case:** Web search, file read, memory lookup, browser use.

### 3. Planner Mode (Multi-Step Planning)

```
User message
  |
  v
Planner LLM analyzes request
  |
  v
Generate execution plan:
  {
    steps: [
      { id: "1", description: "Search web for X", tool: "web_search" },
      { id: "2", description: "Read result pages", tool: "browser_navigate", depends: ["1"] },
      { id: "3", description: "Summarize findings", depends: ["2"] }
    ]
  }
  |
  v
Execute plan step by step
  |
  +-- Step 1: web_search("X")
  +-- Step 2: browser_navigate(url) [waits for step 1]
  +-- Step 3: LLM summarization [waits for step 2]
  |
  v
Return final response
```

**Use case:** Complex research, multi-step tasks, coding projects.

## Orchestration Loop

```typescript
async function runAgent(sessionKey: string, message: string, config: AgentConfig) {
  const session = await loadSession(sessionKey);
  const abortController = new AbortController();

  // 1. Set status
  setAgentRunStatus(sessionKey, "planning");

  // 2. Load context
  const context = await buildContext({
    session,
    memoryQuery: message,
    tools: config.tools,
    skills: config.skills,
  });

  // 3. Plan (if planner enabled)
  let plan: ExecutionPlan | undefined;
  if (config.planner?.mode !== "direct") {
    plan = await planner.generatePlan({ message, context, tools: config.tools });
    setAgentRunStatus(sessionKey, "executing");
  }

  // 4. Execute
  let iteration = 0;
  let response: string | undefined;

  while (iteration < config.maxIterations && !abortController.signal.aborted) {
    iteration++;

    // LLM call
    const llmResponse = await callLLM({
      model: config.model,
      provider: config.provider,
      messages: context.messages,
      tools: config.tools,
      abortSignal: abortController.signal,
    });

    // Parse response
    if (llmResponse.content) {
      // Direct text response
      response = llmResponse.content;
      break;
    }

    if (llmResponse.toolCalls) {
      // Execute tools
      const toolResults = await executeToolCalls({
        toolCalls: llmResponse.toolCalls,
        context: { sessionKey, runtime: getRuntime() },
        requireApproval: config.requireApproval,
      });

      // Append results
      context.messages.push({
        role: "assistant",
        content: null,
        toolCalls: llmResponse.toolCalls,
      });

      for (const result of toolResults) {
        context.messages.push({
          role: "tool",
          toolCallId: result.toolCallId,
          content: result.output,
        });
      }

      // Continue loop for re-prompt
      continue;
    }

    // Plan step execution
    if (plan && plan.status === "executing") {
      const nextStep = getNextExecutableStep(plan);
      if (!nextStep) {
        response = compilePlanResults(plan);
        break;
      }

      const stepResult = await executePlanStep(nextStep, context);
      updateStepStatus(plan, nextStep.id, stepResult.status, stepResult.output);
    }
  }

  // 5. Finalize
  setAgentRunStatus(sessionKey, "completed");

  // 6. Save to session
  session.messages.push(
    { role: "user", content: message },
    { role: "assistant", content: response || "[No response generated]" }
  );
  await saveSession(session);

  // 7. Index to memory
  await indexToMemory(sessionKey, message, response);

  return response;
}
```

## Parallel Tool Execution

When LLM requests multiple tools, they may execute in parallel:

```typescript
// LLM returns 3 tool calls
const toolCalls = [
  { id: "call_1", function: { name: "web_search", arguments: '{"query": "X"}' } },
  { id: "call_2", function: { name: "web_search", arguments: '{"query": "Y"}' } },
  { id: "call_3", function: { name: "memory_search", arguments: '{"query": "Z"}' } },
];

// Independent tools execute in parallel
const results = await Promise.all(
  toolCalls.map(tc => executeToolCall(tc))
);
```

Dependencies between tools are handled by the planner or by sequential LLM re-prompting.

## Streaming Orchestration

```
LLM streams tokens
  |
  +-- Token 1: "The"
  +-- Token 2: " weather"
  +-- Token 3: " in"
  +-- ...
  +-- Token N: "Paris is 22°C."
  |
  v
Stream handler
  |
  +-- Buffer tokens
  +-- Detect tool_call start marker
  +-- If tool_call detected:
        Pause stream
        Parse tool call
        Execute tool
        Resume stream with result
  +-- Otherwise:
        Forward tokens to WS clients
        Forward tokens to channel (if supported)
```

## Abort Handling

```typescript
const abortController = new AbortController();

// User can abort via:
// 1. WS message: { method: "abort", params: { sessionKey } }
// 2. Channel command: "/stop"
// 3. Control UI: Cancel button

abortController.signal.addEventListener("abort", () => {
  // Cancel in-flight LLM request
  // Cancel pending tool executions
  // Update status to "cancelled"
  // Clean up resources
});
```

## Context Window Management

```typescript
function buildContext({ session, maxTokens, model }): Message[] {
  const modelEntry = modelCatalog.get(model);
  const contextLimit = modelEntry.contextWindow;

  let messages = [...session.messages];

  // Strategy: summarize if over limit
  if (estimateTokens(messages) > contextLimit * 0.8) {
    messages = summarizeOldMessages(messages);
  }

  // Inject memory
  const memoryResults = await memorySearch(session.key, latestMessage);
  if (memoryResults.length > 0) {
    const memoryContext = formatMemoryResults(memoryResults);
    messages = [
      { role: "system", content: `Relevant context: ${memoryContext}` },
      ...messages,
    ];
  }

  return messages;
}
```

## Error Recovery

```
LLM call fails
  |
  v
Retry with exponential backoff
  |
  v
Max retries exceeded
  |
  v
Fallback options:
  +-- Switch to fallback model (configurable)
  +-- Return error message to user
  +-- Log to diagnostics
```

Tool execution errors:
```
Tool execution fails
  |
  v
Capture error details
  |
  v
Return error as tool_result to LLM
  |
  v
LLM may:
  +-- Retry with corrected arguments
  +-- Use alternative tool
  +-- Report failure to user
```

## Session State Machine

```
[idle] ──► [planning] ──► [executing] ──► [streaming] ──► [completed]
   ▲           │              │               │                │
   │           │              │               │                │
   └───────────┴──────────────┴───────────────┴────────────────┘
        (abort resets to idle)
```

States stored in `chatRunState` Map in `GatewayRuntimeState`.

## Key Files

- `src/agents/runtime/` — Agent runtime core, orchestration loop
- `src/agents/planner/` — Planning subsystem
- `src/agents/tools/` — Tool execution
- `src/context-engine/` — Context building
- `src/sessions/session-store.ts` — Session persistence
- `src/gateway/server-runtime-state.ts` — Chat run state management
- `src/model-catalog/` — Model selection

---

*Evidence: `src/agents/` directory structure, `src/gateway/server-runtime-state.ts`, `src/context-engine/`, `src/sessions/session-store.ts`, `src/model-catalog/`, agent runtime patterns inferred from architecture.*
