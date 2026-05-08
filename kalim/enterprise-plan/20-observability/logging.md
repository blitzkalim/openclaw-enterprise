# Logging

## Purpose
Document the logging system and log formats.

## Findings

### Logging Framework

- **Library**: Custom + structured logging (likely Pino or similar)
- **Format**: JSON lines (structured)
- **Levels**: debug, info, warn, error, fatal

### Log Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `OPENCLAW_LOG_LEVEL` | `info` | Minimum log level |
| `OPENCLAW_LOG_FORMAT` | `json` | `json` or `pretty` |
| `OPENCLAW_LOG_DESTINATION` | `stdout` | `stdout`, `file`, or both |

### Log Outputs

1. **Console (stdout)**
   - Primary output in Docker/cloud
   - JSON format for log aggregation
   - Pretty format for local development

2. **File**
   - `~/.openclaw/logs/openclaw.log`
   - Rotated daily or by size
   - Retention: 7 days default

3. **Structured Fields**
   ```json
   {
     "level": "info",
     "time": "2024-01-01T00:00:00.000Z",
     "msg": "Gateway started",
     "service": "gateway",
     "version": "1.0.0",
     "pid": 1234
   }
   ```

### Log Categories

| Category | Examples |
|----------|----------|
| Gateway | Startup, shutdown, HTTP requests |
| Auth | Login attempts, token validation |
| Channels | Message receive/send, connection state |
| Agents | LLM calls, tool execution, errors |
| Plugins | Load, unload, errors |
| Tools | Execution, sandbox events |
| Cron | Job execution, failures |
| System | Memory, CPU, errors |

### Sensitive Data Handling

- Tokens redacted in logs (partial: `tok...abc`)
- API keys never logged in full
- Passwords never logged
- Session content may be logged at debug level

### Log Rotation

- File-based rotation
- Max size: 10MB per file
- Max files: 10
- Old files: compressed or deleted

### Cloud-Native Logging

- JSON format for log aggregation (ELK, Datadog, etc.)
- No built-in log shipping
- Docker: stdout -> container logs -> host log driver
- No structured trace ID injection (OpenTelemetry provides traces)

## Evidence
- `src/logging/` — logging module
- `src/infra/system-events.ts` — event logging
- `src/gateway/server.impl.ts` — gateway startup logs
- Environment variables in `.env.example`

## Notes
- Logging is functional but basic
- No centralized log management built-in
- Cloud deployments rely on platform logging
- Debug logs can be verbose (include full prompts)
- No log sampling or rate limiting
