# File Storage

## Storage Architecture

OpenClaw uses **file-based storage** for all persistent state. No traditional database server required.

## Storage Root

```
~/.openclaw/ (or OPENCLAW_STATE_DIR)
  +-- config/
  |     +-- openclaw.json           → Main configuration
  |     +-- openclaw.json.bak       → Backup copies
  |
  +-- sessions/
  |     +-- {channelId}/
  |           +-- {senderId}.json   → Session state per user
  |
  +-- media/
  |     +-- {hash}.jpg              → Downloaded media
  |     +-- {hash}.mp4
  |     +-- ...
  |
  +-- memory/
  |     +-- vector.db               → Vector embeddings (SQLite-vec)
  |     +-- lancedb/                → LanceDB alternative
  |
  +-- diagnostics/
  |     +-- {date}/
  |           +-- events.jsonl      → Diagnostic events
  |
  +-- logs/
  |     +-- gateway.log             → Gateway logs
  |
  +-- plugins/
  |     +-- {pluginId}/
  |           +-- state.json        → Plugin state
  |
  +-- skills/
  |     +-- {skillId}/
  |           +-- skill.json        → Custom skill definitions
  |
  +-- tmp/
        +-- ...                     → Temporary files
```

## Session Storage

```typescript
// ~/.openclaw/sessions/{channelId}/{senderId}.json
{
  "key": "whatsapp:1234567890",
  "messages": [
    { "role": "user", "content": "Hello", "timestamp": "..." },
    { "role": "assistant", "content": "Hi there!", "timestamp": "..." }
  ],
  "metadata": {
    "createdAt": "...",
    "lastActivity": "...",
    "messageCount": 42
  }
}
```

Sessions are JSON files, no encryption observed.

## Config Storage

```typescript
// ~/.openclaw/config/openclaw.json
{
  "version": "1.2.3",
  "gateway": { ... },
  "agents": { ... },
  "channels": { ... },
  "providers": { ... }
}
```

- Atomic writes (write to temp, rename)
- Backup on write (`.bak` files)
- Hot reload watches file changes

## Media Storage

- Files named by content hash (SHA-256)
- Deduplication: same content = same file
- No expiration observed (configurable `maxAge`)
- Path reference stored in session messages

## Vector Memory

Two backends observed:
1. **SQLite-vec** — SQLite extension for vector search
2. **LanceDB** — Embedded vector database

```
~/.openclaw/memory/
  +-- vector.db           → SQLite-vec embeddings
  +-- lancedb/            → LanceDB tables
```

## Backup Strategy

- Config: automatic `.bak` on every write
- Sessions: no explicit backup (single JSON file)
- Media: content-hash dedup provides implicit backup
- Memory: DB-specific backup (if supported by backend)

## Storage Limits

| Storage | Limit | Mitigation |
|---------|-------|------------|
| Sessions | Disk space | Cleanup old sessions (cron) |
| Media | Disk space | Cleanup old media (cron) |
| Memory | Disk space | Compaction (weekly cron) |
| Diagnostics | Disk space | Rotation (weekly cron) |
| Logs | Disk space | Log rotation |

## Multi-Instance Risk

Running multiple OpenClaw instances sharing the same `OPENCLAW_STATE_DIR`:
- **Config**: race condition on writes (last write wins, no locking)
- **Sessions**: concurrent writes may corrupt JSON
- **Memory**: DB concurrency depends on backend (SQLite may lock)
- **Media**: content-hash dedup is safe for reads, concurrent writes may duplicate

## Key Files

- `src/sessions/session-store.ts` — Session persistence
- `src/config/config.ts` — Config storage
- `src/media/` — Media utilities
- `src/memory/` — Memory storage
- `src/cron/` — Cleanup jobs

---

*Evidence: `src/sessions/session-store.ts`, `src/config/config.ts`, `src/gateway/server-runtime-state.ts`, `src/memory/`, `src/cron/`, `docker-compose.yml` volume mounts.*
