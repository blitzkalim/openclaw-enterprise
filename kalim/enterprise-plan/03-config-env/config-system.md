# Config System

## Purpose
Explain how configuration is loaded, validated, persisted, and reloaded at runtime.

## Findings

### Config File Format
- Primary config: `~/.openclaw/openclaw.json` (JSON5 — supports comments, trailing commas)
- Config is a single JSON5 file, not a directory of files
- Environment overrides can be set in `openclaw.json` under `env.vars`

### Loading Precedence (highest to lowest)
1. **Process env variables** (already set, not overridden)
2. **`./.env`** (repo-local dotenv)
3. **`~/.openclaw/.env`** (user dotenv)
4. **`openclaw.json` `env` block** (explicit env vars in config)
5. **Config defaults & schema defaults**

### Config Schema
- Base schema auto-generated: `src/config/schema.base.generated.ts`
- Plugin-provided config schemas merged at validation time
- Zod-based runtime validation: `src/config/validation.ts`
- Schema covers: `meta`, `env`, `wizard`, `diagnostics`, `gateway`, `agents`, `channels`, `tools`, `cron`, etc.

### Config I/O Pipeline
```
File read (~/.openclaw/openclaw.json)
  → JSON5 parse (src/config/io.ts:parseConfigJson5)
  → Env substitution (${VAR} resolution)
  → Plugin schema merge
  → Zod validation
  → Runtime snapshot materialization
  → Write to runtime cache
```

### Config Recovery
- `lastKnownGood` fingerprint stored in `config-health.json`
- If current config is corrupt/suspicious, auto-recovery from `lastKnownGood`
- `src/config/io.observe-recovery.ts` handles recovery logic
- Config backups maintained by `src/config/backup-rotation.ts`

### Config Mutation
- `src/config/mutate.ts` — `mutateConfigFile()` for safe writes
- Write preparation: `src/config/io.write-prepare.ts`
- Audit records appended on every write: `src/config/io.audit.ts`
- Listeners notified on config change: `src/config/runtime-snapshot.ts`

### Runtime Overrides
- CLI flags can override config: `--token`, `--password`, `--port`, `--bind`
- `src/config/runtime-overrides.ts` merges CLI overrides into runtime snapshot
- Overrides are ephemeral unless explicitly persisted

### Config Includes
- `src/config/includes.ts` supports `#include` directives
- Circular include detection prevents loops
- Included files resolved relative to main config path

## Evidence
- `src/config/io.ts` — config file I/O
- `src/config/validation.ts` — schema validation
- `src/config/schema.base.generated.ts` — generated base schema
- `src/config/runtime-snapshot.ts` — runtime materialization
- `src/config/mutate.ts` — safe writes
- `src/config/env-substitution.ts` — env var substitution

## Notes
- Config writes are atomic (write to temp, rename)
- Schema generation script: `scripts/generate-base-config-schema.ts`
- Wizard state tracked in config (`wizard.lastRunAt`, etc.)
- Config can reference secrets via `secret://` or `file://` URIs
