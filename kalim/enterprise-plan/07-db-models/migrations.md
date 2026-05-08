# Migrations & Schema Evolution

## Purpose
Trace migration scripts and schema evolution.

## Findings

### No Traditional Migration Framework

OpenClaw does not use a database migration framework (no Flyway, Liquibase, Alembic, etc.).

### Config Migration Strategy

1. **Runtime Config Migration**
   - `src/config/io.ts` — config read with automatic repair
   - `lastKnownGood` snapshot recovery if current config is corrupt
   - `src/config/io.observe-recovery.ts` — recovery logic
   - Config backups rotated automatically

2. **Plugin State Migrations**
   - `extensions/*/package.json` — `setupFeatures.legacyStateMigrations: true`
   - Extensions handle their own state migration on load
   - Example: WhatsApp extension migrates Baileys auth state formats

3. **Config Schema Evolution**
   - `src/config/schema.base.generated.ts` — auto-generated from TypeScript types
   - Schema generation script: `scripts/generate-base-config-schema.ts`
   - Unknown keys are preserved (not stripped) for forward compatibility
   - Validation warns but does not block on unknown keys

4. **Session Transcript Repair**
   - `src/agents/session-transcript-repair.ts`
   - Repairs corrupted session JSON files
   - Handles missing timestamps, malformed messages

5. **Cron Store Migration**
   - `src/cron/store.ts` — `loadCronStoreSync()`
   - Backward-compatible loading of old cron store formats
   - Missing fields defaulted safely

6. **Task Registry Migration**
   - `src/tasks/runtime-internal.ts` — `ensureTaskRegistryReady()`
   - SQLite schema created on first use
   - No explicit migrations — schema additive only

### Versioned Config Keys

- `meta.lastTouchedVersion` — tracks last config-writing OpenClaw version
- `meta.lastTouchedAt` — timestamp of last config mutation
- Wizard re-runs when version changes significantly

### Breaking Changes Handling

- `openclaw doctor` command detects and fixes config issues
- `src/commands/doctor-config-flow.ts` — config doctor logic
- `src/commands/doctor.ts` — general health checks
- Manual intervention often required for major schema changes

## Evidence
- `src/config/io.ts` — config I/O with recovery
- `src/config/io.observe-recovery.ts` — recovery logic
- `src/agents/session-transcript-repair.ts` — transcript repair
- `src/cron/store.ts` — cron store loading
- `src/tasks/runtime-internal.ts` — task registry initialization
- `scripts/generate-base-config-schema.ts` — schema generation

## Notes
- No automated migration tests detected
- File-based storage makes migrations simpler but less reliable
- SQLite schemas use additive-only changes
- Plugin extensions own their state migration logic
