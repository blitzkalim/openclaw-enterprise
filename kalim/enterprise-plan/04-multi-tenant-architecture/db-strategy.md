# Database Strategy

## Database Selection: PostgreSQL 15+

Why Postgres:
- Native JSONB for flexible schemas (matches OpenClaw's JSON config)
- Row-Level Security for multi-tenant isolation
- Full-text search for conversations and leads
- Extensions: pgvector, pg_trgm, uuid-ossp
- ACID compliance for billing/audit
- Industry standard, well-supported in K8s

## Connection Management

### Pooling (PgBouncer)

```yaml
# pgbouncer-deployment.yaml
replicas: 3
max_client_conn: 10000
default_pool_size: 25
reserve_pool_size: 5
max_db_connections: 100
pool_mode: transaction  # best for web workloads
```

### Application Pool

```typescript
// src/enterprise/db/client.ts
import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  },
  pool: { min: 2, max: 20 },
  postProcessResponse: (result) => {
    // Convert snake_case to camelCase
    return result;
  },
});

// Middleware: set tenant context for RLS
export async function setTenantContext(tenantId: string) {
  await db.raw('SET LOCAL app.current_tenant = ?', [tenantId]);
}
```

## Migration Strategy

### Tool: node-pg-migrate or Knex migrations

```typescript
// migrations/001_initial_schema.ts
export async function up(knex: Knex): Promise<void> {
  // Create tables in dependency order
  await knex.schema.createTable('platforms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('domain', 255).unique();
    table.jsonb('settings').defaultTo('{}');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('tenants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('platform_id').references('id').inTable('platforms');
    table.string('slug', 100).unique().notNullable();
    table.string('name', 255).notNullable();
    table.string('plan', 50).notNullable().defaultTo('community');
    table.string('status', 50).defaultTo('active');
    table.jsonb('settings').defaultTo('{}');
    table.string('billing_email', 255);
    table.timestamp('subscription_start');
    table.timestamp('subscription_end');
    table.integer('max_users').defaultTo(5);
    table.integer('max_channels').defaultTo(3);
    table.integer('max_storage_gb').defaultTo(10);
    table.integer('max_conversations_per_month').defaultTo(1000);
    table.timestamps(true, true);
    table.timestamp('deleted_at');
  });

  // ... additional tables
}
```

## Row-Level Security (RLS)

Enable on all tenant-scoped tables:

```sql
-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_identities ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

## Backup Strategy

### Automated Backups

| Frequency | Method | Retention |
|-----------|--------|-----------|
| Continuous | WAL archiving (pg_basebackup) | 7 days |
| Hourly | pg_dump logical | 7 days |
| Daily | Full snapshot (cloud) | 30 days |
| Weekly | Cross-region copy | 90 days |

### Restore Process

```bash
# Point-in-time recovery
pg_restore --host=$DB_HOST --dbname=openclaw_production \
  --clean --if-exists backup_$(date +%Y%m%d).sql

# Or from WAL archive for specific point-in-time
pg_basebackup -D /restore -X fetch -P -v -h $DB_HOST
```

## Read Replicas

For high read workloads (dashboard queries, analytics):

```yaml
# 1 primary + 2 read replicas
postgres:
  primary:
    replicas: 1
    resources:
      requests:
        memory: 2Gi
        cpu: 1000m
  readReplicas:
    replicas: 2
    resources:
      requests:
        memory: 1Gi
        cpu: 500m
```

Application routing:
```typescript
const readDb = knex({ client: 'pg', connection: process.env.DATABASE_REPLICA_URL });
const writeDb = knex({ client: 'pg', connection: process.env.DATABASE_URL });

// Reads go to replica (eventual consistency OK)
const leads = await readDb('leads').where({ tenant_id: ctx.tenantId });

// Writes go to primary
await writeDb('leads').insert(newLead);
```

## Redis Strategy

### Use Cases

| Use Case | Key Pattern | TTL |
|----------|------------|-----|
| Session refresh tokens | `refresh:{token}` | 7 days |
| Access token blacklist | `blacklist:{jti}` | 15 min |
| User permissions cache | `perms:{tenant}:{user}` | 5 min |
| Rate limiting | `ratelimit:{ip}:{endpoint}` | 1 min |
| WebSocket presence | `ws:{tenant}:{user}` | 1 hour |
| Conversation context | `ctx:{tenant}:{conversation}` | 1 hour |
| Async job locks | `lock:{job_id}` | 5 min |

### Redis Cluster Setup

```yaml
# 3 master + 3 replica
redis-cluster:
  replicas: 6
  nodes: 3
  resources:
    requests:
      memory: 512Mi
      cpu: 250m
```

### Connection

```typescript
import Redis from 'ioredis';

export const redis = new Redis.Cluster(
  [
    { host: 'redis-0', port: 6379 },
    { host: 'redis-1', port: 6379 },
    { host: 'redis-2', port: 6379 },
  ],
  {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  }
);
```

## Object Storage (MinIO/S3)

### Use Cases

| Use Case | Bucket | Path Pattern |
|----------|--------|-------------|
| Document uploads | uploads | `/{tenantId}/{year}/{month}/{uuid}.pdf` |
| Media messages | media | `/{tenantId}/{conversationId}/{messageId}.jpg` |
| Agent artifacts | artifacts | `/{tenantId}/{agentId}/{runId}/output.md` |
| Backups | backups | `/{tenantId}/backup/{date}.sql.gz` |

### MinIO Setup

```yaml
# StatefulSet for persistent storage
minio:
  replicas: 4
  persistence:
    size: 100Gi
  mode: distributed
```

### SDK

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  region: 'us-east-1',
  forcePathStyle: true,
});

export async function uploadDocument(
  tenantId: string,
  file: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const key = `${tenantId}/${Date.now()}/${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: 'uploads',
    Key: key,
    Body: file,
    ContentType: contentType,
    Metadata: { 'x-tenant-id': tenantId },
  }));

  return `${process.env.STORAGE_PUBLIC_URL}/uploads/${key}`;
}
```

## Data Retention & Cleanup

| Data Type | Retention | Cleanup Action |
|-----------|-----------|---------------|
| Active conversations | 2 years | Archive to cold storage |
| Closed conversations | 1 year | Compress & archive |
| Messages | Same as conversation | Cascade delete |
| Audit logs | 7 years | Append-only, never delete (compliance) |
| Usage events | 2 years | Aggregate to monthly summaries |
| Failed sync logs | 30 days | Delete after resolution |
| Temp uploads | 7 days | Auto-delete |

## Scaling Database

### Phase 1: Single Instance (1-100 tenants)
- Postgres 15, 2 CPU, 4GB RAM
- Single Redis instance
- Daily backups

### Phase 2: Read Replicas (100-1000 tenants)
- Primary + 1 read replica
- PgBouncer connection pooling
- Hourly backups

### Phase 3: Partitioning (1000+ tenants)
- Partition `messages` by `tenant_id` (hash partitioning)
- Partition `usage_events` by month (range partitioning)
- Archive old partitions to S3

### Phase 4: Sharding (10000+ tenants)
- Shard by `tenant_id` hash across multiple Postgres clusters
- Each shard: 1000-2000 tenants
- Router layer: consistent hashing

## Disaster Recovery

### RPO (Recovery Point Objective): 5 minutes
- Continuous WAL archiving
- Async replication to secondary region

### RTO (Recovery Time Objective): 30 minutes
- Automated failover with Patroni / Stolon
- Pre-warmed read replicas in secondary region
- Runbook for manual intervention if automation fails
