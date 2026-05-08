# Database Stack

## Purpose
Identify database engines and ORM/data access patterns.

## Findings

### No Traditional Database Server

OpenClaw does **not** use PostgreSQL, MySQL, MongoDB, or any dedicated database server.

### Storage Backends Found

1. **File-Based JSON / JSON5**
   - Primary config: `~/.openclaw/openclaw.json` (JSON5)
   - Session transcripts: `~/.openclaw/sessions/*.json`
   - Task registry: `~/.openclaw/tasks.json`
   - Cron store: `~/.openclaw/cron.json`
   - Pairing store: `~/.openclaw/pairing.json`
   - Plugin install index: `~/.openclaw/plugins.json`

2. **SQLite (LiteFS / local)**
   - Task registry SQLite store: `src/tasks/task-registry.store.sqlite.ts`
   - Task flow registry: `src/tasks/task-flow-registry.store.sqlite.ts`
   - Proxy capture store: `src/proxy-capture/store.sqlite.ts`
   - Used for structured query capabilities over task data

3. **LanceDB (Vector Store)**
   - Extension: `extensions/memory-lancedb/`
   - Vector embeddings for long-term memory
   - Optional — only if memory extension enabled

4. **SQLite-Vec (Vector Search)**
   - Mentioned in `pnpm-workspace.yaml` minimumReleaseAgeExclude
   - Used by `extensions/memory-core/` for vector search

5. **Convex (External, Optional)**
   - `qa/convex-credential-broker/` — QA infrastructure only
   - Not used in production runtime

### Data Access Patterns

- **No ORM** — raw file I/O and SQL
- `src/config/io.ts` — config file read/write with JSON5
- `src/tasks/runtime-internal.ts` — task registry with SQLite
- `src/sessions/session-store.ts` — session file read/write
- `src/cron/store.ts` — cron job file read/write
- `src/infra/outbound/delivery-queue-storage.ts` — message queue file storage

### Persistence Locations

| Data Type | Storage | Path |
|-----------|---------|------|
| Config | JSON5 | `~/.openclaw/openclaw.json` |
| Sessions | JSON | `~/.openclaw/sessions/` |
| Tasks | SQLite | `~/.openclaw/tasks.sqlite` |
| Cron Jobs | JSON | `~/.openclaw/cron.json` |
| Pairing | JSON | `~/.openclaw/pairing/` |
| Media | Files | `~/.openclaw/media/` |
| Workspace | Files | `~/.openclaw/workspace/` |
| Logs | Files | `~/.openclaw/logs/` |
| Vector Memory | LanceDB | `~/.openclaw/memory/` |
| Proxy Captures | SQLite | `~/.openclaw/proxy-capture.sqlite` |

## Evidence
- `src/config/io.ts` — config file I/O
- `src/tasks/task-registry.store.sqlite.ts` — SQLite task store
- `src/sessions/session-store.ts` — session store
- `src/cron/store.ts` — cron store
- `extensions/memory-lancedb/` — vector memory backend
- `src/infra/outbound/delivery-queue-storage.ts` — queue storage

## Notes
- All state is local to the machine running OpenClaw
- No replication, no backups (except config `lastKnownGood`)
- SQLite used selectively where query/transaction semantics needed
- File-based storage limits concurrent access from multiple processes
- No migration framework for file schema changes — uses config migrations instead
