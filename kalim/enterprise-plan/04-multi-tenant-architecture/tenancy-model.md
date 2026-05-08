# Tenancy Model & DB Schema

## Tenancy Strategy: Row-Level Isolation

Every table has `tenant_id` as the primary isolation boundary. No shared database instances or schemas per tenant — one database, strict row-level filtering.

## Core Tables

### platforms
```sql
CREATE TABLE platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### tenants
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID REFERENCES platforms(id),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'community', -- community, pro, enterprise
    status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled
    settings JSONB DEFAULT '{}',
    billing_email VARCHAR(255),
    subscription_start TIMESTAMPTZ,
    subscription_end TIMESTAMPTZ,
    max_users INT DEFAULT 5,
    max_channels INT DEFAULT 3,
    max_storage_gb INT DEFAULT 10,
    max_conversations_per_month INT DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
```

### users (platform-wide identity)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Argon2id
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    email_verified_at TIMESTAMPTZ,
    mfa_secret_encrypted TEXT,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### memberships (tenant membership)
```sql
CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- tenant_owner, tenant_admin, manager, agent, support, billing, read_only
    workspace_ids UUID[] DEFAULT '{}',
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active', -- active, pending, suspended, removed
    UNIQUE(user_id, tenant_id)
);
```

### roles (system + custom)
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = system role
    name VARCHAR(100) NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    permissions TEXT[] DEFAULT '{}',
    parent_role_id UUID REFERENCES roles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### workspaces (optional team grouping)
```sql
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### channel_connections
```sql
CREATE TABLE channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL, -- whatsapp, telegram, email, slack
    provider VARCHAR(50) NOT NULL, -- gupshup, twilio, meta, etc.
    credentials_encrypted TEXT NOT NULL,
    webhook_secret VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, active, error, paused
    config JSONB DEFAULT '{}',
    last_error TEXT,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### bot_identities
```sql
CREATE TABLE bot_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    channel_connection_id UUID REFERENCES channel_connections(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    welcome_message TEXT,
    personality JSONB DEFAULT '{}',
    office_hours JSONB DEFAULT '{"timezone":"Asia/Kolkata","hours":{"Mon":"09:00-18:00","Tue":"09:00-18:00","Wed":"09:00-18:00","Thu":"09:00-18:00","Fri":"09:00-18:00","Sat":"09:00-14:00","Sun":"closed"}}',
    handoff_keywords TEXT[] DEFAULT ARRAY['human','manager','talk to person'],
    offline_auto_reply TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### conversations
```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    channel_connection_id UUID REFERENCES channel_connections(id),
    external_thread_id VARCHAR(255) NOT NULL, -- WhatsApp chat ID, Telegram chat ID
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    source VARCHAR(50), -- whatsapp, telegram, web, email, referral
    status VARCHAR(50) DEFAULT 'open', -- open, closed, pending, spam
    priority VARCHAR(50) DEFAULT 'normal', -- low, normal, high, urgent
    assigned_to UUID REFERENCES memberships(id),
    tags TEXT[] DEFAULT '{}',
    lead_id UUID, -- nullable until lead created
    metadata JSONB DEFAULT '{}',
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### messages
```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- bot, user, contact, agent, system
    sender_id UUID, -- user_id or membership_id or NULL for bot
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text', -- text, image, document, template, location
    media_url TEXT,
    media_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'sent', -- pending, sent, delivered, read, failed
    external_message_id VARCHAR(255),
    provider VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### leads
```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    source VARCHAR(50), -- whatsapp, telegram, web, referral, walk-in
    status VARCHAR(50) DEFAULT 'new', -- new, contacted, qualified, viewing, negotiating, closed, lost
    priority VARCHAR(50) DEFAULT 'normal',
    property_type VARCHAR(50), -- 1bhk, 2bhk, 3bhk, villa, commercial
    location_preference TEXT,
    budget_min DECIMAL(15,2),
    budget_max DECIMAL(15,2),
    timeline VARCHAR(50), -- immediate, 1_month, 3_months, 6_months, investment
    purpose VARCHAR(50), -- self_use, investment, rental
    assigned_to UUID REFERENCES memberships(id),
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### agent_configs
```sql
CREATE TABLE agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    system_prompt TEXT,
    model_provider VARCHAR(50),
    model_name VARCHAR(100),
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INT DEFAULT 4096,
    thinking_level VARCHAR(50) DEFAULT 'medium',
    skills TEXT[] DEFAULT '{}',
    tools_enabled JSONB DEFAULT '{}',
    handoff_keywords TEXT[] DEFAULT '{}',
    auto_reply BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### usage_events (billing metering)
```sql
CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(100) NOT NULL, -- message, conversation, token, storage, api_call
    resource VARCHAR(100),
    quantity DECIMAL(15,6) NOT NULL,
    unit VARCHAR(50), -- count, tokens, mb, seconds
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
