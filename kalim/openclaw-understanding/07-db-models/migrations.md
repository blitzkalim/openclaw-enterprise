# Migrations

## Finding: No Traditional Database Migrations

OpenClaw does not use a relational database or schema migration system. Data evolution is handled through **file format compatibility** and **config reload**.

## Migration Strategy: File-Based Evolution

### 1. Config Format Evolution

From `src/config/io.ts` and `src/crestodian/`:

```typescript
// Config file has no version field observed
// Changes handled by:
//   a) Zod schema with default values for new fields
//   b) Runtime validation on load
//   c) Last-known-good fallback on parse failure
```

**Example evolution path:**
```
Config v1 (old):
  { gateway: { token: "..." } }

Config v2 (current):
  { gateway: { auth: { mode: "token", token: "..." } } }
  → Old format: zod parser applies default `auth.mode = "token"`
  → `gateway.token` migrated to `gateway.auth.token` (inferred)
```

### 2. Session Format Evolution

From `src/sessions/session-store.ts`:

```typescript
// Sessions are JSON files with no version field
// Backward-compatible reading:
//   - Missing fields: populated with defaults
//   - Extra fields: preserved (passthrough)
//   - Changed types: coerced or error
```

**No automatic migration scripts** — format is simple enough that forward compatibility handles most changes.

### 3. Plugin Data Migration

Plugins responsible for their own data:

```typescript
// Plugin manifest may declare:
{
  "dataVersion": "2",
  "migration": {
    "1→2": "./migrations/v1-to-v2.js"
  }
}
```

Not observed in core. Extension-owned behavior per AGENTS.md rules.

### 4. Memory Vector Store Migration

From `extensions/memory-core/`:

```sql
-- SQLite-vec: schema changes require:
--   a) ALTER TABLE (SQLite supports limited ALTER)
--   b) Export → Recreate → Import (for major changes)
--   c) New table alongside old (backward compatibility)
```

Not automated. Manual intervention required for schema changes.

## Config Reload as Soft Migration

From `src/gateway/server-reload-handlers.ts`:

```
Config changed on disk
  |
  v
Read new snapshot
  |
  v
Validate with Zod schema (current)
  |
  v
If valid: apply to runtime
  +-- Restart affected channels (new config)
  +-- Update provider settings
  +-- Reload cron jobs
  +-- Broadcast config_change event
  |
  v
If invalid: reject, keep running with old config
```

This is **not** a migration system but achieves similar goals for runtime config.

## No Migration History

| Feature | Status | Reason |
|---------|--------|--------|
| Migration table | Not present | No SQL database |
| Migration scripts directory | Not present | No schema to migrate |
| Rollback mechanism | Manual | Last-known-good config only |
| Version tracking | Not present | No schema versioning |
| Automated migration | Not present | File-based storage |

## Potential Migration Scenarios

### Scenario: Session Format V1 → V2

```javascript
// Manual migration script (conceptual)
const sessions = await readdir("sessions/");
for (const file of sessions) {
  const session = JSON.parse(await readFile(file));
  // V1 had 'history' array, V2 has 'messages' array
  if (session.history && !session.messages) {
    session.messages = session.history.map(h => ({
      id: h.id || generateId(),
      role: h.role,
      content: h.content,
      timestamp: h.timestamp || new Date().toISOString(),
    }));
    delete session.history;
    await writeFile(file, JSON.stringify(session, null, 2));
  }
}
```

No such script observed in repo. Would need to be custom-written.

### Scenario: Memory Engine SQLite → LanceDB

```javascript
// Manual export/import (conceptual)
const sqliteMemories = await sqlite.query("SELECT * FROM memories");
for (const row of sqliteMemories) {
  await lancedb.add({
    id: row.id,
    content: row.content,
    embedding: deserialize(row.embedding),
    metadata: JSON.parse(row.metadata),
    timestamp: row.timestamp,
  });
}
```

No such script observed. Extension-specific migration.

## Data Backup Strategy

Since there's no migration system, backup is critical:

| Data | Backup Method | Location |
|------|--------------|----------|
| Config | File copy | `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak` |
| Sessions | Directory copy | `cp -r ~/.openclaw/sessions/ ~/.openclaw/sessions.bak/` |
| Memory | File copy (SQLite/LanceDB) | `cp ~/.openclaw/memory/ ~/.openclaw/memory.bak/` |
| Media | Directory copy | `cp -r ~/.openclaw/media/ ~/.openclaw/media.bak/` |

## Version Compatibility

| Component | Backward Compat | Forward Compat |
|-----------|-----------------|----------------|
| Config | Yes (Zod defaults) | Partial (unknown fields preserved) |
| Sessions | Yes (missing fields default) | Partial (extra fields preserved) |
| Memory | No (schema-dependent) | No |
| Plugin data | Extension-defined | Extension-defined |

## Key Files

- `src/config/io.ts` — Config file I/O (atomic write)
- `src/config/schema.ts` — Zod schema (forward compatibility via defaults)
- `src/crestodian/` — Config crestodian (migration helpers)
- `src/gateway/server-reload-handlers.ts` — Hot reload (soft migration)

---

*Evidence: `src/config/io.ts`, `src/config/schema.ts`, `src/crestodian/`, `src/gateway/server-reload-handlers.ts`, `src/sessions/session-store.ts`.*
