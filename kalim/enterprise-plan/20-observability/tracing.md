# Distributed Tracing

## Purpose
Document tracing capabilities and OpenTelemetry integration.

## Findings

### OpenTelemetry Integration

- **Status**: Optional, not enabled by default
- **Protocol**: OTLP (gRPC or HTTP)
- **Instrumentation**: HTTP, WebSocket, LLM calls, channel operations

### Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCLAW_OTEL_ENABLED` | Yes | Enable tracing |
| `OPENCLAW_OTEL_ENDPOINT` | Yes | OTLP collector endpoint |
| `OPENCLAW_OTEL_SERVICE_NAME` | No | Defaults to `openclaw` |
| `OPENCLAW_OTEL_SERVICE_VERSION` | No | App version |

### What Gets Traced

1. **HTTP Requests**
   - Request start -> handler -> response
   - Status code, duration, path
   - Auth resolution span

2. **WebSocket Messages**
   - Message receive -> processing -> reply
   - Method name, duration

3. **LLM Calls**
   - Provider API call -> response
   - Model name, token count (if available), latency
   - Streaming: individual chunk spans

4. **Channel Operations**
   - Message receive normalization
   - Send message preparation
   - API call to channel provider

5. **Tool Execution**
   - Tool name, parameters (sanitized)
   - Execution duration
   - Success/failure

6. **Agent Runs**
   - Run start -> message processing -> response
   - Subagent calls as child spans
   - Cancellation events

### Span Attributes

```
http.method: GET
http.route: /v1/chat/completions
http.status_code: 200
llm.provider: openai
llm.model: gpt-4o
llm.tokens.prompt: 1024
llm.tokens.completion: 512
channel.type: telegram
channel.method: sendMessage
tool.name: fs_read
tool.success: true
```

### Sampling

- Default: head-based sampling (likely 100% or configurable)
- No tail-based sampling detected
- No custom sampling rules

### Propagation

- W3C Trace Context propagation (standard)
- No custom propagation headers
- Internal calls: context passed via function arguments

### Limitations

- No distributed tracing across services (single process)
- No baggage propagation
- No span events for detailed state changes
- No exception stack traces in spans (unless explicitly added)
- Performance impact minimal (async batch export)

### Local Development

```bash
# Run with Jaeger locally
OPENCLAW_OTEL_ENABLED=true \
OPENCLAW_OTEL_ENDPOINT=http://localhost:4317 \
  pnpm dev
```

### Production Usage

- Requires OTLP collector (Jaeger, Tempo, Datadog, etc.)
- Batch export with retry
- No offline buffering (spans lost if collector unavailable)

## Evidence
- `.env.example` — OTEL variables
- `src/infra/telemetry.ts` — telemetry setup
- `src/gateway/server.impl.ts` — trace initialization
- OpenTelemetry imports throughout codebase

## Notes
- Tracing is well-instrumented but opt-in
- Single-process architecture simplifies tracing
- No trace-to-log correlation built-in
- Useful for performance analysis when enabled
- Missing: metrics correlation, profiling integration
