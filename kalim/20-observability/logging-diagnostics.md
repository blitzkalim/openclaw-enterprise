# Observability

## Logging

| Component | Technology |
|-----------|------------|
| Logger | Custom structured logger |
| Levels | debug, info, warn, error |
| Output | stdout / stderr, file |
| Format | JSON or structured text |

## Log Files

```
~/.openclaw/logs/
  +-- gateway.log           → Gateway runtime logs
  +-- agent.log             → Agent execution logs
  +-- channel-{id}.log      → Per-channel logs
```

## Diagnostics

Diagnostic events stored in `~/.openclaw/diagnostics/`:

```
~/.openclaw/diagnostics/
  +-- {date}/
        +-- events.jsonl      → Structured event log
        +-- traces.jsonl      → Execution traces
        +-- errors.jsonl      → Error captures
```

Event format:
```json
{ "timestamp": "...", "level": "error", "component": "agent", "message": "...", "context": {...} }
```

## OpenTelemetry

From `docker-compose.yml`:

```yaml
environment:
  OTEL_SERVICE_NAME: openclaw-gateway
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4317"
```

OTEL metrics/traces optionally exported to collector.

## Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Basic liveness |
| `GET /ready` | Readiness (channels loaded) |

## Prometheus

May expose metrics at `/metrics` (inferred from observability patterns).

## Key Files

- `src/logging/` — Logger implementation
- `src/diagnostics/` — Diagnostic event capture
- `src/gateway/server-runtime-state.ts` — Health state

---

*Evidence: `docker-compose.yml` OTEL vars, `src/logging/`, `src/diagnostics/`, `src/gateway/server-runtime-state.ts`.*
