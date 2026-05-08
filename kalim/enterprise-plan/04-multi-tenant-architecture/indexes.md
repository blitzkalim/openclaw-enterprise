# Database Indexes

## Performance Critical Indexes

### tenants
```sql
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_plan ON tenants(plan);
CREATE INDEX idx_tenants_platform ON tenants(platform_id);
```

### users
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
```

### memberships
```sql
CREATE INDEX idx_memberships_user_tenant ON memberships(user_id, tenant_id);
CREATE INDEX idx_memberships_tenant_role ON memberships(tenant_id, role);
CREATE INDEX idx_memberships_status ON memberships(status);
```

### conversations
```sql
-- Tenant isolation + status
CREATE INDEX idx_conversations_tenant_status ON conversations(tenant_id, status)
  WHERE deleted_at IS NULL;

-- For "recent conversations" queries
CREATE INDEX idx_conversations_tenant_updated ON conversations(tenant_id, updated_at DESC);

-- Contact lookup (when customer messages again)
CREATE INDEX idx_conversations_external ON conversations(tenant_id, external_thread_id, channel_connection_id);

-- Assigned to agent
CREATE INDEX idx_conversations_assigned ON conversations(tenant_id, assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- Full-text search on contact name
CREATE INDEX idx_conversations_contact_name ON conversations USING gin(to_tsvector('english', contact_name));

-- Source filtering
CREATE INDEX idx_conversations_source ON conversations(tenant_id, source);
```

### messages
```sql
-- Conversation history
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);

-- Tenant isolation
CREATE INDEX idx_messages_tenant ON messages(tenant_id);

-- Recent messages for dashboard
CREATE INDEX idx_messages_tenant_created ON messages(tenant_id, created_at DESC);

-- External message ID lookup (delivery status updates)
CREATE INDEX idx_messages_external ON messages(tenant_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Sender queries
CREATE INDEX idx_messages_sender ON messages(tenant_id, sender_type, sender_id);
```

### leads
```sql
-- Tenant + status
CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, status)
  WHERE deleted_at IS NULL;

-- Assigned to agent
CREATE INDEX idx_leads_assigned ON leads(tenant_id, assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- Phone lookup
CREATE INDEX idx_leads_phone ON leads(tenant_id, phone)
  WHERE phone IS NOT NULL;

-- Email lookup
CREATE INDEX idx_leads_email ON leads(tenant_id, email)
  WHERE email IS NOT NULL;

-- Source filtering
CREATE INDEX idx_leads_source ON leads(tenant_id, source);

-- Full-text search on name/notes
CREATE INDEX idx_leads_search ON leads USING gin(
  to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(notes, ''))
);

-- Budget range queries
CREATE INDEX idx_leads_budget ON leads(tenant_id, budget_min, budget_max)
  WHERE budget_min IS NOT NULL AND budget_max IS NOT NULL;

-- Timeline queries
CREATE INDEX idx_leads_timeline ON leads(tenant_id, timeline);

-- Created date for reports
CREATE INDEX idx_leads_created ON leads(tenant_id, created_at DESC);
```

### channel_connections
```sql
-- Active channels for tenant
CREATE INDEX idx_channels_tenant_active ON channel_connections(tenant_id, status)
  WHERE status = 'active';

-- Provider lookup
CREATE INDEX idx_channels_provider ON channel_connections(provider, status);
```

### agent_configs
```sql
-- Active agents for tenant
CREATE INDEX idx_agents_tenant_active ON agent_configs(tenant_id, is_active)
  WHERE is_active = TRUE;

-- By workspace
CREATE INDEX idx_agents_workspace ON agent_configs(workspace_id)
  WHERE workspace_id IS NOT NULL;
```

### usage_events
```sql
-- Billing aggregation
CREATE INDEX idx_usage_tenant_type ON usage_events(tenant_id, event_type, created_at);

-- Time-series queries
CREATE INDEX idx_usage_created ON usage_events(created_at DESC);

-- Per-user usage
CREATE INDEX idx_usage_user ON usage_events(tenant_id, user_id, event_type, created_at);
```

### audit_logs
```sql
-- Tenant audit trail
CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id, created_at DESC);

-- User action history
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);

-- Resource lookup
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

-- Action type
CREATE INDEX idx_audit_action ON audit_logs(tenant_id, action, created_at DESC);
```

### tenant_secrets
```sql
-- Credential lookup
CREATE INDEX idx_secrets_tenant_name ON tenant_secrets(tenant_id, name);

-- Category lookup
CREATE INDEX idx_secrets_category ON tenant_secrets(tenant_id, category);
```

### conversation_memories (vector)
```sql
-- Vector similarity search (ivfflat for approximate search)
CREATE INDEX idx_memories_embedding ON conversation_memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Tenant-scoped vector search
CREATE INDEX idx_memories_tenant ON conversation_memories(tenant_id);
```

### document_memories (vector)
```sql
CREATE INDEX idx_doc_memories_embedding ON document_memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_doc_memories_tenant ON document_memories(tenant_id);
```

## Partitioning Recommendations

### messages (Hash partition by tenant_id)
```sql
-- When 1000+ tenants
CREATE TABLE messages_partitioned (
    LIKE messages INCLUDING ALL
) PARTITION BY HASH (tenant_id);

CREATE TABLE messages_p0 PARTITION OF messages_partitioned
    FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... repeat for 16 partitions
```

### usage_events (Range partition by month)
```sql
CREATE TABLE usage_events_partitioned (
    LIKE usage_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE usage_events_2024_01 PARTITION OF usage_events_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- Generate monthly partitions automatically
```

### audit_logs (Range partition by month)
```sql
CREATE TABLE audit_logs_partitioned (
    LIKE audit_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

## Maintenance

### Auto-Vacuum Tuning

```sql
-- High-write tables
ALTER TABLE messages SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE usage_events SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE audit_logs SET (autovacuum_vacuum_scale_factor = 0.02);

-- Low-write tables
ALTER TABLE tenants SET (autovacuum_vacuum_scale_factor = 0.2);
ALTER TABLE users SET (autovacuum_vacuum_scale_factor = 0.2);
```

### Analyze Schedule

```bash
# Daily at 3 AM (low traffic)
0 3 * * * psql -c 'ANALYZE conversations, messages, leads, usage_events;'

# Weekly full analyze
0 4 * * 0 psql -c 'ANALYZE;'
```

### Index Bloat Monitoring

```sql
-- Check for bloated indexes
SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```
