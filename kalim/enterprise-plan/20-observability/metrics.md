# Metrics

## Purpose
Document metrics, monitoring, and telemetry.

## Findings

### No Built-in Metrics Endpoint

OpenClaw does not expose a `/metrics` endpoint for Prometheus or similar.

### Available Telemetry

1. **OpenTelemetry (Optional)**
   - `OPENCLAW_OTEL_*` environment variables
   - Traces for HTTP requests, LLM calls, channel operations
   - Export to OTLP collector
   - Not enabled by default

2. **Health Endpoint**
   - `GET /health` — binary healthy/unhealthy
   - No detailed subsystem status
   - Used by load balancers

3. **Log-Based Metrics**
   - Log aggregation can derive metrics
   - Request counts, error rates, latencies
   - Requires external processing (ELK, Loki, etc.)

4. **Gateway Status**
   - WebSocket status message to connected clients
   - Subjective health (not quantitative)
   - Channel connection states

### Missing Metrics

- No Prometheus `/metrics` endpoint
- No request latency histograms
- No error rate counters
- No active connection gauges
- No LLM token usage metrics
- No channel message throughput
- No queue depth metrics
- No memory/CPU process metrics exposed

### External Monitoring

Users must rely on:
- Platform metrics (Docker stats, Fly.io metrics, etc.)
- Log aggregation dashboards
- APM tools (if OpenTelemetry enabled)
- Health check failures for alerting

### OpenTelemetry Configuration

```
OPENCLAW_OTEL_ENABLED=true
OPENCLAW_OTEL_ENDPOINT=http://otel-collector:4317
OPENCLAW_OTEL_SERVICE_NAME=openclaw
```

### What is Traced (when enabled)

- HTTP request handling
- WebSocket message processing
- LLM API calls (including provider, model, latency)
- Channel send/receive operations
- Tool execution
- Database operations

## Evidence
- `.env.example` — OTEL variables
- `src/infra/telemetry.ts` — telemetry setup (if exists)
- `src/gateway/health.ts` — health endpoint
- OpenTelemetry imports in gateway

## Notes
- Observability is minimal out-of-the-box
- OpenTelemetry provides decent tracing when configured
- Metrics require external log processing or APM
- No built-in alerting or dashboards
- Cloud platforms provide basic container metrics
