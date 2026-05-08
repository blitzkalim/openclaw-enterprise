# Per-Tenant Memory Model

## Problem

OpenClaw's memory is either:
- Session-level (in conversation JSON files)
- Long-term via LanceDB vector store (`extensions/memory-lancedb/`)

Neither is multi-tenant aware. Tenant A's embeddings must not appear in Tenant B's search results.

## Architecture

```
┌─────────────────────────────────────────────┐
│         Memory Layer                          │
│  ┌───────────────────────────────────────┐  │
│  │  Short-Term (Redis)                   │  │
│  │  - Active conversation context        │  │
│  │  - TTL: 1 hour                        │  │
│  │  - Key: tenant:{id}:session:{key}     │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Long-Term (Postgres + Vector Store)  │  │
│  │  - Conversation history               │  │
│  │  - Document embeddings                │  │
│  │  - Agent learnings                    │  │
│  │  - Filtered by tenant_id              │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Cross-Tenant (Platform)              │  │
│  │  - Best practices library             │  │
│  │  - Training data (anonymized)         │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Short-Term Memory (Redis)

```typescript
// Active conversation context (last 10 messages)
const SESSION_KEY = `tenant:${tenantId}:session:${sessionKey}:context`;

async function getConversationContext(tenantId: string, sessionKey: string) {
  const context = await redis.lrange(SESSION_KEY, 0, 9);
  return context.map(JSON.parse);
}

async function appendToContext(tenantId: string, sessionKey: string, message: Message) {
  await redis.lpush(SESSION_KEY, JSON.stringify(message));
  await redis.ltrim(SESSION_KEY, 0, 19); // Keep last 20
  await redis.expire(SESSION_KEY, 3600);  // 1 hour TTL
}
```

## Long-Term Memory (Postgres + Vector)

### Conversation History

```sql
CREATE TABLE conversation_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536),  -- OpenAI embedding dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_memories_embedding
ON conversation_memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_conversation_memories_tenant
ON conversation_memories(tenant_id);
```

### Semantic Search (Per Tenant)

```typescript
async function searchMemories(
  tenantId: string,
  query: string,
  limit: number = 5
): Promise<Memory[]> {
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);

  // Search within tenant boundary
  const results = await db.raw(`
    SELECT content, metadata, 1 - (embedding <=> ?::vector) as similarity
    FROM conversation_memories
    WHERE tenant_id = ?
    ORDER BY embedding <=> ?::vector
    LIMIT ?
  `, [queryEmbedding, tenantId, queryEmbedding, limit]);

  return results.rows;
}
```

### Document Memory

```sql
CREATE TABLE document_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}',
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_document_memories_embedding
ON document_memories USING ivfflat (embedding vector_cosine_ops);
```

## Agent Learnings (Per Tenant)

```sql
CREATE TABLE agent_learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,  -- 'preference', 'correction', 'success'
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    confidence DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ  -- Some learnings expire
);
```

Example learning:
```json
{
  "category": "preference",
  "content": "Client Rahul prefers properties with gym and pool",
  "confidence": 0.9,
  "expires_at": "2025-01-01"
}
```

## Memory Retrieval Strategy

```typescript
async function buildAgentMemoryContext(
  tenantId: string,
  conversationId: string,
  currentMessage: string
): Promise<string> {
  // 1. Get recent conversation (short-term)
  const recentContext = await getConversationContext(tenantId, conversationId);

  // 2. Search long-term memory for relevant past interactions
  const relevantMemories = await searchMemories(tenantId, currentMessage, 3);

  // 3. Get agent learnings for this tenant
  const learnings = await searchAgentLearnings(tenantId, currentMessage, 2);

  // 4. Get document memories if query seems factual
  const docs = await searchDocumentMemories(tenantId, currentMessage, 2);

  return formatMemoryContext({
    recentContext,
    relevantMemories,
    learnings,
    documents: docs,
  });
}
```

## Memory Isolation Guarantees

### Must Never Happen

| Violation | Prevention |
|-----------|------------|
| Tenant A's memory in Tenant B's search | All queries filter by `tenant_id` |
| Agent learns from wrong tenant | `tenant_id` in `agent_learnings` table |
| Cross-tenant conversation context | Redis keys prefixed with `tenant:{id}` |
| Admin sees all tenant memories | RBAC check before search |

### Vector Store Isolation

For LanceDB (OpenClaw's current vector store):

```typescript
// Instead of one global vector store, create per-tenant tables
function getTenantVectorTable(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}_vectors`;
}

async function searchVectors(tenantId: string, query: number[]) {
  const table = db.openTable(getTenantVectorTable(tenantId));
  return table.search(query).limit(5).toArray();
}
```

Alternative: Use pgvector (Postgres extension) for simplicity and ACID compliance.

## Memory Cleanup

```sql
-- Expire old learnings
DELETE FROM agent_learnings
WHERE expires_at < NOW();

-- Archive old conversations (> 1 year)
INSERT INTO conversation_memories_archive
SELECT * FROM conversation_memories
WHERE created_at < NOW() - INTERVAL '1 year';

DELETE FROM conversation_memories
WHERE created_at < NOW() - INTERVAL '1 year';

-- Purge deleted tenant data (cascades via FK)
DELETE FROM tenants WHERE status = 'cancelled' AND deleted_at < NOW() - INTERVAL '30 days';
```

## Platform-Level Memory (Cross-Tenant)

Some knowledge should be shared across tenants:

```sql
CREATE TABLE platform_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    source VARCHAR(100),  -- 'training', 'best_practice', 'common_question'
    is_anonymized BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Access requires explicit opt-in by tenant admin.
