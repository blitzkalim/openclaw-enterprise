# Tenant Scoping for Agents, Skills, and Plugins

## Problem

OpenClaw's agent runtime, skill registry, and plugin system are all global. In a multi-tenant platform, we need:
- Tenant A's agent doesn't know about Tenant B's leads
- Tenant A's skills don't expose Tenant B's data
- Plugins operate within tenant boundaries

## Agent Scoping

### Current (OpenClaw)

```typescript
// src/agents/agent-command.ts
function resolveAgentRuntimeConfig(agentKey: string) {
  // Reads from global config file
  return config.agents[agentKey];
}
```

### Target (Multi-Tenant)

```typescript
// src/enterprise/agents/tenant-agent-config.ts
async function resolveTenantAgentConfig(
  tenantId: string,
  workspaceId: string,
  agentKey: string
): Promise<AgentConfig> {
  // 1. Check tenant database for custom config
  const custom = await db('agent_configs')
    .where({ tenant_id: tenantId, workspace_id: workspaceId, name: agentKey })
    .first();

  if (custom) return custom;

  // 2. Fall back to platform default for agent type
  const default = await db('agent_configs')
    .where({ tenant_id: null, name: agentKey })  // platform defaults
    .first();

  // 3. Merge with tenant settings
  return mergeAgentConfig(default, tenantSettings);
}
```

### Agent Types Per Tenant

| Agent Type | Default | Tenant Can Customize |
|------------|---------|---------------------|
| Lead Intake | Platform default | ✅ system prompt, model, handoff |
| Inventory Search | Platform default | ✅ inventory source, locations |
| Reminder | Platform default | ✅ schedule, tone |
| CRM Sync | Platform default | ❌ (standardized) |
| Document Processor | Platform default | ✅ file types, output format |
| Manager Dashboard | Platform default | ✅ metrics, time range |

## Skill Scoping

### Current (OpenClaw)

Skills are loaded globally from `skills/` and `extensions/*/skills/`.

### Target (Multi-Tenant)

```typescript
// src/enterprise/skills/tenant-skill-registry.ts
async function loadTenantSkills(tenantId: string): Promise<Skill[]> {
  // 1. Get tenant's enabled skills
  const enabled = await db('tenant_skills')
    .where({ tenant_id: tenantId, enabled: true })
    .select('skill_id');

  // 2. Load skill definitions
  const skills = [];
  for (const { skill_id } of enabled) {
    const skill = await loadSkillDefinition(skill_id);
    // Wrap skill execution with tenant context
    skills.push(wrapWithTenantContext(skill, tenantId));
  }

  return skills;
}

function wrapWithTenantContext(skill: Skill, tenantId: string): Skill {
  return {
    ...skill,
    execute: async (params) => {
      // Inject tenant_id into all tool calls
      return skill.execute({ ...params, tenant_id: tenantId });
    },
  };
}
```

### Tenant-Specific Skill Configuration

```sql
CREATE TABLE tenant_skills (
    tenant_id UUID REFERENCES tenants(id),
    skill_id VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    priority INT DEFAULT 50,
    PRIMARY KEY (tenant_id, skill_id)
);
```

Example: CRM sync skill configured per tenant:
```json
{
  "skill_id": "crm-sync",
  "config": {
    "provider": "zoho",
    "api_key": "encrypted...",
    "sync_interval": "15min",
    "lead_fields": ["name", "phone", "budget", "location"]
  }
}
```

## Plugin Scoping

### Challenge

Plugins run in the same Node.js process. We cannot truly isolate them per tenant without VMs/containers.

### Approach: Tenant-Aware Plugin Runtime

```typescript
// src/enterprise/plugins/tenant-plugin-runtime.ts
class TenantPluginRuntime {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async loadChannelPlugin(channelType: string) {
    const plugin = await loadPlugin(channelType);

    // Wrap plugin methods to inject tenant context
    return new Proxy(plugin, {
      get: (target, prop) => {
        if (typeof target[prop] === 'function') {
          return (...args) => {
            // Prepend tenant context to all calls
            return target[prop]({ tenant_id: this.tenantId }, ...args);
          };
        }
        return target[prop];
      },
    });
  }
}
```

### Plugin Data Isolation Rules

1. **Channel plugins** — each tenant has separate credentials, separate webhooks
2. **Provider plugins** — each tenant can configure their own API keys
3. **Tool plugins** — tools must check tenant_id before accessing data
4. **Memory plugins** — vector embeddings scoped to tenant

### Plugin Sandboxing (Future)

For untrusted third-party plugins:
- Run in separate worker process (VM2 or quickjs)
- IPC communication with main process
- Strict timeout and memory limits
- Tenant data passed explicitly, no direct DB access

## Model Provider Scoping

Each tenant can choose their own LLM provider:

```sql
CREATE TABLE tenant_model_configs (
    tenant_id UUID REFERENCES tenants(id),
    provider VARCHAR(50) NOT NULL,  -- openai, anthropic, google
    model VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INT DEFAULT 4096,
    PRIMARY KEY (tenant_id, provider)
);
```

### Fallback Strategy

```typescript
async function resolveModelForTenant(tenantId: string, requestedModel?: string) {
  // 1. Try tenant's preferred provider
  const tenantConfig = await getTenantModelConfig(tenantId);
  if (tenantConfig && await checkProviderHealth(tenantConfig.provider)) {
    return tenantConfig;
  }

  // 2. Try platform default
  const platformDefault = await getPlatformModelConfig();
  if (await checkProviderHealth(platformDefault.provider)) {
    return platformDefault;
  }

  // 3. Emergency fallback (cheapest)
  return { provider: 'openai', model: 'gpt-4o-mini', usePlatformKey: true };
}
```

## Configuration Precedence

```
Tenant-specific config (highest priority)
  -> Workspace-specific config
    -> User-specific preferences
      -> Platform default config (lowest priority)
```

Example: A tenant admin sets "always use Claude 3.5 Sonnet". A manager in that tenant can override for their workspace. An agent cannot override.
