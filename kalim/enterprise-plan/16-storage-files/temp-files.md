# Temporary Files

## Purpose
How temporary files are managed.

## Findings

### Temporary File Locations

| Location | Purpose | Cleanup |
|----------|---------|---------|
| `~/.openclaw/tmp/` | General temp files | On restart / periodic |
| `~/.openclaw/media/` | Media downloads | TTL-based |
| `os.tmpdir()` | Child process temp | OS managed |
| `/tmp/` (Docker) | Container temp | Container lifecycle |

### Temp File Patterns

1. **Channel Media Downloads**
   - Files downloaded from channel APIs (WhatsApp, Telegram, etc.)
   - Stored in `~/.openclaw/media/` with `.tmp` suffix during download
   - Renamed to final filename on completion
   - Partial files cleaned up on failure

2. **Agent Workspace Temp**
   - `src/agents/sandbox/fs-bridge.ts` — sandboxed file operations
   - Temp files for read/write/edit operations
   - Atomic writes (write to temp, then rename)

3. **Build / Compile Temp**
   - `src/agents/apply-patch.ts` — patch application temp files
   - `src/agents/sandbox/backend.ts` — backend temp files

4. **Log Rotation Temp**
   - `src/logging/` — log files rotated with `.N` suffix
   - Old logs compressed or deleted based on retention

### Cleanup Mechanisms

1. **Startup Cleanup**
   - `src/infra/restart.ts` — cleanup on restart
   - Removes stale temp files from previous run
   - `browser-lifecycle-cleanup.ts` — browser process cleanup

2. **Periodic Sweeper**
   - `src/tasks/task-registry.maintenance.ts` — task sweeper
   - `src/cron/service/jobs.ts` — cron maintenance
   - Media TTL enforcement

3. **On-Access Cleanup**
   - `src/media/store.ts` — checks TTL on media access
   - Deletes expired media files

### No Explicit Temp File API

- No dedicated `tmpfile()` or `mktemp()` wrapper detected
- Uses Node.js `os.tmpdir()` and `fs.mkdtemp()` directly
- No temp file lifecycle tracking

### Docker Temp Files

- `docker-compose.yml` — no tmpfs mount
- Container `/tmp/` is ephemeral (container lifecycle)
- No volume mounted for temp persistence

## Evidence
- `src/media/store.ts` — media temp handling
- `src/agents/sandbox/fs-bridge.ts` — atomic writes
- `src/infra/restart.ts` — restart cleanup
- `src/infra/browser-lifecycle-cleanup.ts` — browser cleanup
- `src/agents/apply-patch.ts` — patch temp files

## Notes
- Temp files may accumulate if gateway crashes
- No temp file quota enforcement
- Sandbox backends (Docker/SSH) have their own temp spaces
- Media temp files are the largest temp usage category
