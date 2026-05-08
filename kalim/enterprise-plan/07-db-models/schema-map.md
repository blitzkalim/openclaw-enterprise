# Schema Map

## Purpose
Catalog all tables/models/entities.

## Findings

### File-Based Schemas

#### Config Schema (`~/.openclaw/openclaw.json`)
- `meta`: `{ lastTouchedVersion, lastTouchedAt }`
- `env`: `{ shellEnv: { enabled, timeoutMs }, vars: {} }`
- `wizard`: `{ lastRunAt, lastRunVersion, lastRunCommit, lastRunCommand, lastRunMode }`
- `diagnostics`: `{ enabled, flags, stuckSessionWarnMs }`
- `gateway`: `{ auth: { mode, token, password, allowTailscale, rateLimit, trustedProxy }, tailscale: { mode, resetOnExit }, port, bind }`
- `agents`: `{ defaults: { model, provider, thinking, verbose, workspace, sandbox: { mode } }, skills: [] }`
- `channels`: `{ [channelId]: { enabled, accounts: [], allowFrom, dmPolicy, groupPolicy } }`
- `cron`: `{ jobs: [] }`
- `tools`: `{ enabled: [] }`

#### Session Entry Schema (`~/.openclaw/sessions/*.json`)
- `sessionKey`: string (channel:account:agent format)
- `messages`: array of `{ role, content, timestamp, model, provider }`
- `metadata`: `{ createdAt, lastActiveAt, model, provider, agentId }`

#### Cron Job Schema (`~/.openclaw/cron.json`)
- `jobs`: array of `{ id, name, schedule, payload, delivery, enabled, lastRunAt, nextRunAt, runCount, errorCount }`

#### Pairing Store Schema (`~/.openclaw/pairing/`)
- `allowFrom`: `{ [provider]: { [accountId]: string[] } }`
- `deviceTokens`: `{ [deviceId]: { token, createdAt, expiresAt } }`

### SQLite Schemas

#### Task Registry (`tasks.sqlite`)
- Table: `tasks`
  - `id` TEXT PRIMARY KEY
  - `status` TEXT (queued, running, succeeded, failed, timed_out, lost)
  - `createdAt` INTEGER (timestamp ms)
  - `updatedAt` INTEGER
  - `agentId` TEXT
  - `sessionKey` TEXT
  - `lane` TEXT
  - `runId` TEXT
  - `error` TEXT
  - `terminalSummary` TEXT
  - `cleanupAfter` INTEGER

#### Proxy Capture (`proxy-capture.sqlite`)
- Table: `captures`
  - `id` TEXT PRIMARY KEY
  - `url` TEXT
  - `method` TEXT
  - `requestHeaders` TEXT (JSON)
  - `requestBody` BLOB
  - `responseStatus` INTEGER
  - `responseHeaders` TEXT (JSON)
  - `responseBody` BLOB
  - `timestamp` INTEGER
  - `durationMs` INTEGER

### In-Memory Structures (Runtime)

#### Plugin Registry
- `Map<string, PluginManifest>` — loaded plugin manifests
- `Map<string, PluginRuntime>` — active plugin runtimes

#### Channel Runtime State
- `Map<string, ChannelRuntime>` — active channel connections
- Account binding state per channel

#### Model Catalog
- `Map<string, ModelInfo>` — available models by provider
- Auth profile state per provider

#### Auth Rate Limiter
- `Map<string, RateLimitEntry>` — per-IP failed auth tracking

## Evidence
- `src/config/schema.base.generated.ts` — generated base schema
- `src/tasks/task-registry.types.ts` — task type definitions
- `src/tasks/task-registry.store.sqlite.ts` — SQLite schema
- `src/cron/types.ts` — cron type definitions
- `src/sessions/session-store.ts` — session structure
- `src/proxy-capture/store.sqlite.ts` — proxy capture schema

## Notes
- No centralized schema registry — schemas distributed across modules
- File-based schemas are implicit (JSON structure, not SQL DDL)
- SQLite schemas are embedded in TypeScript source
- Config schema auto-generated from TypeScript types
