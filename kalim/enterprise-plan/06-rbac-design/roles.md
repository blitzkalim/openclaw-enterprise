# Roles Design

## System Roles

These roles are seeded into every tenant and cannot be deleted.

### Platform Super Admin
- Scope: Platform-wide
- Manages all tenants
- Can impersonate any tenant
- Billing oversight
- System configuration

### Tenant Owner
- Scope: Tenant
- Full control of their tenant
- Cannot access other tenants
- Manages billing and plan
- Can delete tenant

### Tenant Admin
- Scope: Tenant
- Day-to-day administration
- User management (invite, remove)
- Channel configuration
- Agent configuration
- Cannot delete tenant
- Cannot change plan

### Manager
- Scope: Tenant
- Team oversight
- Lead assignment
- View analytics
- Run reports
- Cannot modify global agents
- Cannot invite users

### Agent (Sales Rep / Field Staff)
- Scope: Tenant
- Interacts with AI via channels
- Manages assigned leads
- Updates lead status
- Uploads documents
- Views own performance
- Cannot see others' data (unless shared)

### Support (Back Office)
- Scope: Tenant
- Read conversations
- Run standard reports
- Help customers
- Cannot modify AI agents
- Cannot access billing

### Billing User
- Scope: Tenant
- View billing only
- Download invoices
- Cannot access operational data

### Read Only
- Scope: Tenant
- View-only access to dashboards
- No write operations

## Custom Roles (Enterprise)

Tenants can create custom roles combining any permissions.

```sql
-- System roles (read-only for tenant)
INSERT INTO roles (tenant_id, name, is_system, permissions) VALUES
(NULL, 'platform_super_admin', true, ARRAY['*']),
(NULL, 'tenant_owner', true, ARRAY['*']),
(NULL, 'tenant_admin', true, ARRAY['users.manage','channels.manage','agents.manage','leads.manage','reports.view','settings.manage']),
(NULL, 'manager', true, ARRAY['leads.manage','reports.view','dashboard.view','agents.read']),
(NULL, 'agent', true, ARRAY['leads.own','conversations.own','documents.upload','dashboard.own']),
(NULL, 'support', true, ARRAY['conversations.read','reports.standard']),
(NULL, 'billing', true, ARRAY['billing.view']),
(NULL, 'read_only', true, ARRAY['dashboard.read']);
```

## Role Hierarchy

```
Platform Super Admin
  └── Tenant Owner
        └── Tenant Admin
              ├── Manager
              │     ├── Agent
              │     └── Support
              └── Billing User
                    └── Read Only
```

A higher role implicitly has all permissions of lower roles, unless explicitly restricted.

## Tenant-Specific Role Assignment

Users can have multiple memberships across different tenants (for platform staff), but only one role per tenant.

```sql
-- Amit is a tenant owner of Agency A
INSERT INTO memberships (user_id, tenant_id, role) VALUES
('amit-uuid', 'agency-a-uuid', 'tenant_owner');

-- Amit is also a manager at Agency B
INSERT INTO memberships (user_id, tenant_id, role) VALUES
('amit-uuid', 'agency-b-uuid', 'manager');
```
