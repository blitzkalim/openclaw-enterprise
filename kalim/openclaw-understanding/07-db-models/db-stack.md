# Database Stack

## Core Finding: No Traditional SQL/NoSQL Database Server

OpenClaw does **not** use PostgreSQL, MySQL, MongoDB, or Redis as a primary database. Instead, it uses a **file-based + vector-store** persistence model.

## Storage Architecture

```
~/.openclaw/ (OPENCLAW_STATE_DIR)
  |
  +-- openclaw.json          → Main configuration (JSON)
  +-- .env                   → Environment variables (dotenv)
  +-- sessions/
  |     +-- {sessionKey}.json → Per-session conversation history
  +-- media/
  |     +-- {hash}.ext      → Downloaded/uploaded media files
  +-- cache/
  |     +-- ...              → Compile cache, temp data
  +-- plugins/
  |     +-- {pluginId}/      → Plugin-specific data
  +-- memory/
        +-- {index}/         → Vector store indices
```

## Storage Backends

### 1. JSON File Store (Primary)

**Technology:** Native Node.js `fs` module
**Format:** JSON with optional comments (relaxed JSON)
**Location:** `~/.openclaw/` (configurable via `OPENCLAW_STATE_DIR`)

| Data | File/Path | Format |
|------|-----------|--------|
| Configuration | `openclaw.json` | JSONC (JSON with comments) |
| Sessions | `sessions/{key}.json` | JSON |
| Plugin data | `plugins/{id}/...` | Plugin-defined |
| Media files | `media/{hash}.{ext}` | Binary |
| Runtime cache | `cache/...` | Various |

### 2. Vector Memory Store

**Technology:** Extension-based (pluggable)
**Default:** `extensions/memory-core/` uses **SQLite** with `sqlite-vec` extension
**Alternative:** `extensions/memory-lancedb/` uses **LanceDB**

From `extensions/memory-core/`:

```typescript
// SQLite + sqlite-vec for vector embeddings
// Stores: conversation embeddings, file embeddings, knowledge base
// Schema: id, content, embedding (BLOB), metadata (JSON), timestamp
```

From `extensions/memory-lancedb/`:

```typescript
// LanceDB (columnar vector database)
// Local file-based (no server)
// Stores: vectors with metadata filtering
```

### 3. Session Store

**Technology:** JSON file store (`src/sessions/session-store.ts`)
**Format:** Per-session JSON file

```typescript
type SessionData = {
  key: string;
  channel: string;
  sender: string;
  messages: Message[];
  metadata: Record<string, any>;
  lastUpdated: string;
};
```

- In-memory LRU cache with write-through to disk
- No locking mechanism observed for concurrent access
- Single-process design avoids concurrent write conflicts

### 4. Config Store

**Technology:** File-based with atomic replacement
**File:** `~/.openclaw/openclaw.json`
**I/O:** Atomic write via temp file + rename

From `src/config/io.ts`:

```typescript
async function replaceConfigFile(path, content) {
  const tmpPath = `${path}.tmp.${randomId()}`;
  await fs.writeFile(tmpPath, content, { mode: 0o600 });
  await fs.rename(tmpPath, path);
}
```

- File permissions: `0o600` (user read/write only)
- Atomic replacement prevents corruption on crash
- Last-known-good backup for recovery

### 5. Secret Store

**Technology:** Environment variables + config file + secret providers
**No dedicated secret vault** — secrets resolved at runtime

From `src/secrets/runtime.ts`:

```typescript
type SecretSource =
  | { type: "env", name: string }
  | { type: "file", path: string }
  | { type: "provider", provider: string, key: string };
```

- `OPENCLAW_GATEWAY_TOKEN` → env var
- `{env:OPENAI_API_KEY}` → env var reference in config
- `{file:/run/secrets/openai_key}` → file reference
- Extension providers (1Password, Vault, etc.) → plugin-based

### 6. Cache Store

**Technology:** `node:module` compile cache + file cache
**Location:** `~/.openclaw/cache/` or system temp

From `src/entry.ts`:

```typescript
enableCompileCache(); // Node.js 22+ compile cache
```

### 7. Optional: Redis

Some channel extensions may use Redis for:
- Session storage (at scale)
- Pub/sub for multi-instance
- Rate limiting (distributed)

Not required for core operation. Not observed in docker-compose.

## Data Flow

```
Inbound message
  |
  v
Channel plugin
  |
  v
Session store (in-memory + JSON file)
  |
  v
Agent runtime
  |
  +-- Memory query → Vector store (SQLite-vec or LanceDB)
  +-- Tool execution → File system / API
  +-- LLM call → External API (no local persistence)
  |
  v
Reply generated
  |
  v
Outbound dispatch → Channel API
  |
  v
Session updated → JSON file write (async)
```

## No Database Migrations

Since there's no relational schema:
- **No SQL migrations**
- **No schema versioning**
- Config changes handled by:
  - Config reload (hot apply)
  - Plugin-specific data migration (extension-owned)
  - Session format evolution (backward-compatible JSON parsing)

## Multi-Process / Multi-Instance

**Not supported** with file-based store:
- Two gateway processes on same `OPENCLAW_STATE_DIR` → race conditions
- Sessions may be corrupted
- Config writes may conflict

**Workaround:**
- One process per `OPENCLAW_STATE_DIR`
- External Redis for session sharing (if implemented by extension)
- Shared network filesystem (risky)

## Backup & Recovery

- Config: `last-known-good` snapshot in config directory
- Sessions: JSON files, can be backed up with standard tools
- Vector store: SQLite file or LanceDB directory
- Media: Binary files in `media/` directory

## Key Files

- `src/sessions/session-store.ts` — Session persistence
- `src/config/io.ts` — Config file I/O
- `src/secrets/runtime.ts` — Secret resolution
- `src/infra/env.ts` — State directory resolution
- `extensions/memory-core/` — Vector memory (SQLite)
- `extensions/memory-lancedb/` — Vector memory (LanceDB)

---

*Evidence: `src/sessions/session-store.ts`, `src/config/io.ts`, `src/secrets/runtime.ts`, `src/infra/env.ts`, `extensions/memory-core/` structure, `extensions/memory-lancedb/` structure, `docker-compose.yml` (no DB container).*
