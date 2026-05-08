# Backward Compatibility & Migration Strategy

## Core Principle

A single binary serves both modes:
- **Single-user mode**: `DATABASE_URL` unset — behaves exactly like current OpenClaw
- **Multi-tenant mode**: `DATABASE_URL` set — enterprise features activate

## Environment-Based Activation

```typescript
// src/enterprise/index.ts
export async function initEnterprise() {
  if (!process.env.DATABASE_URL) {
    console.log('Enterprise mode disabled: DATABASE_URL not set');
    return;
  }

  // Initialize enterprise services
  await initDatabase();
  await initRedis();
  await initAuthService();
  await initAdminServer();
}
```

No config file changes needed for existing users.

## Existing User Impact: Zero

| Aspect | Current | With Enterprise Code |
|--------|---------|---------------------|
| Config | `config.json` file | Still uses `config.json` |
| Auth | `OPENCLAW_GATEWAY_TOKEN` | Still works (legacy fallback) |
| Storage | SQLite/JSON files | Still works (no DB = file mode) |
| Telegram | `TELEGRAM_BOT_TOKEN` | Still works |
| WhatsApp | Baileys QR pairing | Still works |
| Commands | `pnpm openclaw start` | Same command |
| UI | `ui/` build | Still serves same UI |

## Migration Path: Single-User -> Multi-Tenant

### Step 1: User Decides to Upgrade
```bash
# User has existing OpenClaw running with file config
# They want team features and web dashboard
```

### Step 2: Set Environment Variables
```bash
export DATABASE_URL=postgresql://localhost/openclaw
export REDIS_URL=redis://localhost:6379
export MASTER_KEY=$(openssl rand -hex 32)
```

### Step 3: Run Migration
```bash
pnpm run migrate:up
# Creates all enterprise tables in Postgres
# Does NOT touch existing file-based config
```

### Step 4: Import Existing Config
```bash
pnpm run enterprise:import-config
# Reads existing config.json
# Creates tenant "default"
# Creates user "admin" from gateway token
# Imports agents, channels, skills settings
```

### Step 5: Start in Multi-Tenant Mode
```bash
pnpm openclaw start
# Same command, now with enterprise features active
```

### Step 6: Existing Behavior Preserved
- Old `OPENCLAW_GATEWAY_TOKEN` still authenticates as "admin" user
- Old Telegram bot keeps working
- Old Baileys WhatsApp keeps working
- All conversations remain accessible

## Rollback: Multi-Tenant -> Single-User

```bash
# Unset DATABASE_URL
unset DATABASE_URL

# Start again
pnpm openclaw start
# Falls back to file-based mode automatically
# All file-based config still intact (never modified)
```

## Data Migration Script

```typescript
// scripts/migrate-to-enterprise.ts
import { readConfig } from '../src/config/io';
import { db } from '../src/enterprise/db/client';
import { encrypt } from '../src/enterprise/secrets/encryption';

async function migrate() {
  const legacyConfig = await readConfig(); // reads config.json

  // Create default tenant
  const [tenant] = await db('tenants').insert({
    slug: 'default',
    name: legacyConfig.agencyName || 'My Agency',
    plan: 'enterprise', // grandfather existing users
    max_users: 100,
    max_channels: 10,
  }).returning('id');

  // Create admin user
  const [user] = await db('users').insert({
    email: 'admin@local',
    first_name: 'Admin',
    password_hash: await hashPassword(process.env.OPENCLAW_GATEWAY_TOKEN || 'changeme'),
  }).returning('id');

  // Create membership
  await db('memberships').insert({
    user_id: user.id,
    tenant_id: tenant.id,
    role: 'tenant_owner',
    status: 'active',
  });

  // Import Telegram config
  if (legacyConfig.telegram?.botToken) {
    await db('channel_connections').insert({
      tenant_id: tenant.id,
      channel_type: 'telegram',
      provider: 'telegram',
      credentials_encrypted: encrypt(JSON.stringify({ token: legacyConfig.telegram.botToken })),
      status: 'active',
    });
  }

  // Import agents
  for (const [name, config] of Object.entries(legacyConfig.agents || {})) {
    await db('agent_configs').insert({
      tenant_id: tenant.id,
      name,
      system_prompt: config.systemPrompt || '',
      model_provider: config.model?.provider || 'openai',
      model_name: config.model?.name || 'gpt-4o-mini',
      is_active: true,
    });
  }

  console.log('Migration complete. Tenant ID:', tenant.id);
}
```

## Breaking Changes Assessment

| Potential Change | Risk | Mitigation |
|-----------------|------|------------|
| New dependencies (knex, pg, ioredis) | Low | Only loaded if DATABASE_URL set |
| Build time increase | Low | Tree-shaking removes unused enterprise code in single-user mode |
| Startup time increase | Low | Enterprise init skipped if DATABASE_URL absent |
| Disk space increase | Low | Enterprise code ~200KB minified |
| Config format change | None | File format unchanged |
| API changes | None | Existing endpoints unchanged |
| Plugin compatibility | Low | Plugins wrapped transparently |

## Version Compatibility Matrix

| OpenClaw Base | Enterprise Overlay | Compatibility |
|---------------|-------------------|---------------|
| v0.5.x | v1.0.x | Full |
| v0.6.x | v1.1.x | Full |
| v0.7.x | v1.2.x | Test before deploy |
| v1.0.x | v2.0.x | Major version aligned |

Enterprise overlay releases track OpenClaw major versions. Minor versions independent.

## Testing Strategy

1. **Single-user regression tests**: Run full OpenClaw test suite with `DATABASE_URL` unset
2. **Migration tests**: Automate single-user -> multi-tenant -> single-user cycle
3. **Feature flag tests**: Test enterprise features only activate with DB configured
4. **Plugin compatibility tests**: All existing plugins run in both modes
