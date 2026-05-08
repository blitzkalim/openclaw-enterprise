# Data Relationships

## Overview

Since OpenClaw uses file-based JSON storage rather than a relational database, relationships are **logical** rather than enforced by foreign keys. This document maps the logical relationships between data entities.

## Entity Relationship Diagram

```
┌─────────────────┐       ┌──────────────────┐
│     Config      │◄──────│    Session       │
│  (openclaw.json)│       │ ({key}.json)     │
│                 │       │                  │
│ • gateway.auth  │       │ • key            │
│ • channels[]    │◄──────│ • channelId      │
│ • providers[]   │       │ • senderId       │
│ • agents        │       │ • messages[]     │
│ • memory        │       │ • pendingToolCalls│
│ • skills        │       │ • agentState     │
│ • cron          │       └────────┬─────────┘
└─────────────────┘                │
       ▲                           │
       │                           │
       │                    ┌──────┴──────┐
       │                    │  Message    │
       │                    │ (in Session)│
       │                    │             │
       │                    │ • id        │
       │                    │ • role      │
       │                    │ • content   │
       │                    │ • timestamp │
       │                    │ • toolCalls │
       │                    └──────┬──────┘
       │                           │
       │                    ┌──────┴──────┐
       │                    │  ToolCall   │
       │                    │             │
       │                    │ • id        │
       │                    │ • function  │
       │                    │ • arguments │
       │                    └─────────────┘
       │
       │       ┌──────────────────┐
       │       │   AgentRun       │
       │       │ (runtime state)  │
       │       │                  │
       └───────│ • runId          │
               │ • sessionKey ────┼──► Session
               │ • model          │
               │ • provider ──────┼──► Config.providers
               │ • tools[] ───────┼──► PluginRegistry
               │ • skills[] ──────┼──► Config.skills
               │ • status         │
               │ • plan           │
               └──────────────────┘

┌─────────────────┐       ┌──────────────────┐
│ PluginRegistry  │       │ MemoryVector       │
│ (runtime map)   │       │ (SQLite/LanceDB)  │
│                 │       │                   │
│ • id            │       │ • id              │
│ • manifest      │       │ • content         │
│ • runtime       │       │ • embedding       │
│ • configSchema  │       │ • metadata        │
│                 │       │   • source ───────┼──► Session (optional)
└─────────────────┘       │   • type          │
                          │   • channelId ────┼──► Config.channels
                          │   • sessionKey ───┼──► Session
                          │   • tags[]        │
                          │ • timestamp       │
                          └───────────────────┘

┌─────────────────┐       ┌──────────────────┐
│   CronJob       │       │ GatewayClient     │
│ (config +     │       │ (runtime WS state)│
│  runtime)       │       │                   │
│                 │       │ • id              │
│ • id            │       │ • ws              │
│ • name          │       │ • auth ───────────┼──► GatewayAuthResult
│ • schedule      │       │ • ip              │
│ • command       │       │ • subscribedSessions│
│ • enabled       │       │                   │
│ • lastRun       │       └───────────────────┘
│ • lastResult    │
└─────────────────┘
```

## Relationship Details

### 1. Config → Sessions (One-to-Many)

**Relationship:** Each session belongs to one channel configured in `Config.channels`
**Enforcement:** Logical (session.channelId references Config.channels key)
**On Delete:** Session orphaned if channel removed (no cascade)
**On Update:** Session continues working with old channelId (no referential integrity)

### 2. Config → AgentRun (Many-to-One)

**Relationship:** AgentRun references `Config.providers` and `Config.agents.defaults`
**Enforcement:** Runtime resolution (provider string looked up in config at runtime)
**On Missing:** Runtime error if provider not configured

### 3. Session → Messages (One-to-Many)

**Relationship:** Session contains array of messages
**Enforcement:** Nested JSON (messages stored inline in session file)
**On Delete:** Session delete removes all messages (cascade by storage)
**Performance:** All messages loaded with session (no pagination observed)

### 4. Message → ToolCalls (One-to-Many)

**Relationship:** Message may contain tool_calls array
**Enforcement:** Nested JSON
**Lifecycle:** Tool call created by LLM, executed by runtime, result appended as new message

### 5. Session → MemoryVector (Many-to-Many)

**Relationship:** Memory vectors may reference sessions via metadata.sessionKey
**Enforcement:** Logical reference in metadata JSON
**Query Pattern:** `SELECT * FROM memories WHERE json_extract(metadata, '$.sessionKey') = ?`
**On Delete:** Memory vectors not automatically cleaned up when session deleted

### 6. PluginRegistry → Config (Many-to-Many)

**Relationship:** Plugin entries activated/deactivated via `Config.channels` and `Config.providers`
**Enforcement:** Config contains activation flags; plugin registry contains runtime implementations
**Activation:** Channel enabled in config → plugin runtime instantiated on startup

### 7. Config → CronJob (One-to-Many)

**Relationship:** Cron jobs defined in `Config.cron.jobs`
**Enforcement:** Config-driven (jobs loaded from config on startup)
**Runtime:** Job state (lastRun, lastResult) stored in runtime memory (not persisted to config)

### 8. GatewayClient → Session (Many-to-Many)

**Relationship:** WS clients subscribe to sessions via `session_subscribe` method
**Enforcement:** Runtime Map `sessionEventSubscribers` in `GatewayRuntimeState`
**Lifecycle:** Client disconnect → automatic unsubscribe from all sessions

## No Referential Integrity

Since storage is file-based:
- **No foreign key constraints**
- **No cascading deletes**
- **No automatic updates**
- **No transaction isolation**

## Data Consistency Strategies

### 1. Single-Process Design
Only one gateway process accesses the state directory at a time, preventing concurrent write conflicts.

### 2. Atomic File Writes
Config file writes use temp-file + rename pattern to prevent corruption.

### 3. Zod Validation
All config reads validated against Zod schema. Invalid config rejected with descriptive error.

### 4. Graceful Degradation
- Missing provider config → runtime error with helpful message
- Missing channel config → channel disabled
- Orphaned session → treated as new session
- Missing memory record → empty result (not error)

### 5. Last-Known-Good Fallback
Config reload failures fall back to previous valid config, preventing corruption from bad edits.

## Query Patterns

### Session Queries
```
Load session by key:     readFile(`sessions/{key}.json`)
List all sessions:       readdir(`sessions/`)
Delete session:          unlink(`sessions/{key}.json`)
Update session:          writeFile(`sessions/{key}.json`, JSON)
```

### Memory Queries
```sql
-- SQLite-vec (inferred)
SELECT id, content, metadata, distance
FROM memories
WHERE embedding MATCH vec_encode(?)
  AND k = 10;

-- With metadata filter
SELECT id, content, metadata, distance
FROM memories
WHERE embedding MATCH vec_encode(?)
  AND json_extract(metadata, '$.channelId') = 'telegram'
  AND k = 10;
```

### Config Queries
```
Read config:             readFile(`openclaw.json`) → parse → Zod validate
Update config:           validate → writeFile atomic
Reload config:           re-read → validate → apply
```

## Key Files

- `src/config/config.ts` — Config types
- `src/sessions/session-store.ts` — Session types
- `src/channels/message-normalization.ts` — Message types
- `src/agents/runtime/` — Agent runtime types
- `extensions/memory-core/` — Vector memory schema
- `src/cron/` — Cron job types

---

*Evidence: `src/config/config.ts`, `src/sessions/session-store.ts`, `src/channels/message-normalization.ts`, `src/agents/runtime/`, `extensions/memory-core/`.*
