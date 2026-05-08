# Tool Permission Boundaries

## Problem

OpenClaw's tool system (`src/agents/pi-tools.ts`) has no permission model. In a multi-tenant platform, we must ensure:
- Agent A (Tenant X) cannot access Tenant Y's CRM
- Agent B cannot delete records it didn't create
- Staff user cannot modify system configuration

## Tool Categories

| Category | Examples | Risk Level |
|----------|----------|------------|
| Data Read | `read_lead`, `search_inventory`, `view_conversation` | Low |
| Data Write | `create_lead`, `update_lead`, `assign_lead` | Medium |
| Data Delete | `delete_lead`, `archive_conversation` | High |
| External | `send_whatsapp`, `sync_crm`, `send_email` | Medium |
| System | `update_config`, `manage_users`, `install_plugin` | Critical |
| File | `upload_file`, `read_file`, `delete_file` | Medium |

## Permission Mapping

```typescript
// src/enterprise/tools/tool-permissions.ts
const TOOL_PERMISSION_MAP: Record<string, string> = {
  'read_lead': 'leads.read',
  'create_lead': 'leads.own',
  'update_lead': 'leads.own',
  'delete_lead': 'leads.manage',
  'assign_lead': 'leads.assign',
  'search_inventory': 'agents.use',
  'view_conversation': 'conversations.read',
  'send_whatsapp': 'channels.manage',
  'sync_crm': 'crm.write',
  'update_config': 'settings.manage',
  'manage_users': 'users.manage',
  'upload_file': 'documents.upload',
  'read_file': 'documents.read',
  'delete_file': 'documents.manage',
};

export function canUseTool(userRoles: string[], toolName: string): boolean {
  const required = TOOL_PERMISSION_MAP[toolName];
  if (!required) return false; // Unknown tool = deny

  return userRoles.some(role => ROLE_PERMISSIONS[role].includes(required));
}
```

## Tool Execution Wrapper

```typescript
// src/enterprise/tools/tenant-tool-wrapper.ts
export function wrapToolForTenant(
  tool: Tool,
  tenantId: string,
  userId: string,
  roles: string[]
): Tool {
  return {
    ...tool,
    execute: async (params) => {
      // 1. Check permission
      if (!canUseTool(roles, tool.name)) {
        throw new ToolPermissionError(`User lacks permission for ${tool.name}`);
      }

      // 2. Inject tenant context
      const tenantParams = {
        ...params,
        _tenant_id: tenantId,
        _user_id: userId,
      };

      // 3. Execute with timeout
      const result = await Promise.race([
        tool.execute(tenantParams),
        new Promise((_, reject) =>
          setTimeout(() => reject(new ToolTimeoutError()), 30000)
        ),
      ]);

      // 4. Log execution
      await auditLogger.log({
        tenant_id: tenantId,
        user_id: userId,
        action: 'tool.execute',
        tool_name: tool.name,
        params: sanitizeForLog(params),
        result: sanitizeForLog(result),
      });

      return result;
    },
  };
}
```

## Data Scope Enforcement

### Read Operations

```typescript
// All reads must include tenant_id
function readLead(leadId: string, tenantId: string, userId?: string) {
  const query = db('leads')
    .where({ id: leadId, tenant_id: tenantId });

  // Agent can only read their own leads
  if (userId) {
    query.andWhere('assigned_to', userId);
  }

  return query.first();
}
```

### Write Operations

```typescript
// All writes must include tenant_id and validate ownership
function updateLead(
  leadId: string,
  tenantId: string,
  userId: string,
  role: string,
  updates: Partial<Lead>
) {
  // Verify lead exists and belongs to tenant
  const lead = await db('leads')
    .where({ id: leadId, tenant_id: tenantId })
    .first();

  if (!lead) throw new NotFoundError();

  // Agent can only update their own leads
  if (role === 'agent' && lead.assigned_to !== userId) {
    throw new PermissionError();
  }

  return db('leads')
    .where({ id: leadId, tenant_id: tenantId })
    .update(updates);
}
```

### External Tool Restrictions

| Tool | Restriction |
|------|-------------|
| `send_whatsapp` | Can only send to numbers in tenant's conversation history |
| `sync_crm` | Only to tenant's configured CRM |
| `send_email` | Only using tenant's verified sender domain |
| `web_search` | No restrictions (public data) |
| `code_execute` | Sandboxed, no network, 5 second timeout |

## Dangerous Tool Policy

```typescript
const DANGEROUS_TOOLS = [
  'delete_database',
  'drop_table',
  'execute_shell',
  'modify_system_config',
];

// These require explicit admin approval per execution
function executeDangerousTool(toolName: string, params: any) {
  // Log and require confirmation
  logger.warn(`Dangerous tool requested: ${toolName}`, { params });

  // For automated agents: deny
  throw new ToolBlockedError(`${toolName} requires manual admin approval`);
}
```

## Agent Sandbox

Default agent tool allowlist by role:

| Tool | Agent (Sales) | Manager | Admin |
|------|:-------------:|:-------:|:-----:|
| `read_lead` | ✅ (own) | ✅ (all) | ✅ |
| `create_lead` | ✅ | ✅ | ✅ |
| `update_lead` | ✅ (own) | ✅ | ✅ |
| `assign_lead` | ❌ | ✅ | ✅ |
| `delete_lead` | ❌ | ❌ | ✅ |
| `search_inventory` | ✅ | ✅ | ✅ |
| `view_conversation` | ✅ (own) | ✅ | ✅ |
| `send_whatsapp` | ❌ | ❌ | ✅ |
| `sync_crm` | ❌ | ✅ | ✅ |
| `upload_file` | ✅ | ✅ | ✅ |
| `read_file` | ✅ | ✅ | ✅ |
| `update_config` | ❌ | ❌ | ✅ |
| `manage_users` | ❌ | ❌ | ✅ |
