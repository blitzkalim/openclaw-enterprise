# Permissions Matrix

## Permission Naming Convention

`{resource}.{action}` where action is one of: `create`, `read`, `update`, `delete`, `manage` (implies CRUD), `own` (own records only).

## Full Permission Catalog

| Permission | Resource | Description | Default Roles |
|------------|----------|-------------|---------------|
| `users.manage` | Users | Invite, remove, edit users | owner, admin |
| `users.read` | Users | View user list | manager, admin |
| `users.own` | Users | Edit own profile | all |
| `channels.manage` | Channels | Add/remove WhatsApp, Telegram | owner, admin |
| `channels.read` | Channels | View channel status | manager, admin |
| `agents.manage` | Agents | Create, edit, delete agents | owner, admin |
| `agents.read` | Agents | View agent configs | manager |
| `agents.use` | Agents | Interact with agents | all |
| `leads.manage` | Leads | CRUD all leads | manager, admin |
| `leads.own` | Leads | CRUD own assigned leads | agent |
| `leads.read` | Leads | View leads | support, manager |
| `leads.assign` | Leads | Assign leads to agents | manager |
| `conversations.manage` | Conversations | Access all conversations | admin, manager |
| `conversations.read` | Conversations | View conversations | support |
| `conversations.own` | Conversations | View assigned conversations | agent |
| `documents.manage` | Documents | Access all documents | admin |
| `documents.upload` | Documents | Upload files | agent |
| `documents.read` | Documents | View documents | support |
| `reports.view` | Reports | Access all reports | admin, manager |
| `reports.standard` | Reports | Run standard reports | support |
| `reports.own` | Reports | View own reports | agent |
| `dashboard.view` | Dashboard | View full dashboard | admin, manager |
| `dashboard.own` | Dashboard | View own metrics | agent |
| `dashboard.read` | Dashboard | Read-only dashboard | read_only |
| `settings.manage` | Settings | Tenant configuration | admin, owner |
| `settings.read` | Settings | View settings | manager |
| `billing.view` | Billing | View invoices, usage | billing, owner |
| `billing.manage` | Billing | Change plan, payment | owner |
| `plugins.manage` | Plugins | Install/uninstall plugins | admin |
| `plugins.read` | Plugins | View installed plugins | manager |
| `crm.write` | CRM | Sync data to CRM | admin |
| `crm.read` | CRM | View CRM data | manager |
| `export_data` | Data | Export tenant data | admin |
| `analytics.view` | Analytics | View usage analytics | admin, manager |
| `system.impersonate` | System | Impersonate users | platform_super_admin |

## Permission Scopes

| Scope | Description |
|-------|-------------|
| `tenant` | All records in tenant |
| `workspace` | Records in assigned workspaces |
| `own` | Records owned by user |
| `none` | No access |

## Matrix by Role

| Permission | Owner | Admin | Manager | Agent | Support | Billing | Read Only |
|------------|:-----:|:-----:|:---------:|:-----:|:-------:|:-------:|:---------:|
| users.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| users.read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| channels.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| channels.read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| agents.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| agents.read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| leads.manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| leads.own | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| leads.read | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| leads.assign | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| conversations.manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| conversations.read | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| conversations.own | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| documents.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| documents.upload | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| reports.view | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| reports.standard | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| reports.own | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| dashboard.view | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| dashboard.own | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| dashboard.read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| settings.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| billing.view | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| billing.manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| plugins.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| crm.write | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| crm.read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| export_data | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| analytics.view | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
