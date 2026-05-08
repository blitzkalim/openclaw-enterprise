# Flow F: Admin & Platform Management

## Scenario
Platform admin manages tenant accounts, system health, and support.

## Super Admin Dashboard

### 1. Tenant Overview
```
Platform Health: 99.9% uptime (last 30 days)

Active Tenants: 247
  - Community: 180
  - Pro: 52
  - Pro Plus: 12
  - Enterprise: 3

Growth:
  - New this month: 34
  - Churned: 8 (3.2% monthly churn)
  - MRR: $4,247
  - ARR: $50,964

Recent Signups:
  - Today: 3
  - This week: 12
  - This month: 34
```

### 2. Tenant List
```
Filter: All | Active | Suspended | Trial | Expired
Sort: Name | Plan | Signup Date | MRR | Last Activity

Search: "bandra" -> 2 results

Columns:
  - Tenant | Plan | Users | Leads | Channels | MRR | Health | Actions

Example:
  "Bandra Elite" | Pro | 5 | 127 | WhatsApp, Telegram | $49 | Healthy | [View] [Support] [Suspend]
  "Andheri Prop" | Pro Plus | 12 | 340 | All | $99 | Warning | [View] [Support] [Suspend]
```

### 3. Tenant Detail View
```
Bandra Elite Properties (bandra-elite)

Overview:
  - Status: Active
  - Plan: Pro (since Mar 15, 2024)
  - Next billing: Jun 15, 2024
  - Payment method: UPI (active)
  - Users: 5/5 (100%)
  - Storage: 8.2GB/10GB (82%)
  - WhatsApp: 423/500 (85%)

Activity:
  - Messages today: 45
  - Leads this week: 12
  - AI accuracy: 94%
  - Avg response time: 2.1 min

Channels:
  - WhatsApp (Gupshup): Active
  - Telegram: Active
  - Email: Not configured

Health Checks:
  - WhatsApp delivery rate: 98%
  - AI response rate: 99.5%
  - CRM sync (Zoho): Healthy
  - Last error: 2 days ago (webhook timeout)

Actions:
  [Impersonate Tenant] [Edit Plan] [Add Credits] 
  [Send Message] [Suspend] [Delete]
```

### 4. Impersonate Tenant
```
Super admin clicks "Impersonate"
  -> Opens dashboard as tenant owner
  -> Visual indicator: "Viewing as: Bandra Elite (impersonation)"
  -> Can see all data, make changes
  -> All actions logged in audit trail
  -> One-click "End Impersonation"
```

### 5. Support Tickets
```
Open Tickets: 7

Priority Queue:
  [P1] "WhatsApp not delivering since 2 hours" | Bandra Elite | 2h ago | [Assign]
  [P2] "AI giving wrong property prices" | Andheri Prop | 5h ago | [Assign]
  [P3] "Can't connect Zoho CRM" | Juhu Homes | 1d ago | Assigned: Ravi

Resolved Today: 12
Average Resolution: 4.2 hours
```

### 6. System Alerts
```
Active Alerts:
  [WARNING] WhatsApp provider rate limit (Gupshup) - 85% capacity
  [INFO] Redis memory at 60%
  [WARNING] Postgres slow query detected (> 2s) - idx_messages_conversation
  [INFO] 3 tenants approaching storage limit

Auto-Actions:
  - Scale gateway pods if CPU > 70% for 5 min
  - Alert on-call if error rate > 5% for 10 min
  - Page P1 if any tenant completely down
```

### 7. Feature Flags
```
Feature Toggles (per tenant or global):

Global:
  [ON]  New AI model (GPT-5)
  [OFF] Beta CRM: Salesforce integration
  [ON]  Enhanced analytics
  [50%] A/B: New onboarding wizard

Tenant-specific (Bandra Elite):
  [ON]  WhatsApp templates
  [ON]  Multi-language support
  [OFF] Custom agent builder (Enterprise only)
```

### 8. Audit Log Viewer
```
Filter: Date range | Tenant | User | Action | Resource

Example:
  2024-06-01 09:23:14 | Bandra Elite | amit@... | lead.update | lead_123 | {status: "closed"}
  2024-06-01 09:25:33 | Bandra Elite | system | agent.execute | lead_intake | {tokens: 450}
  2024-06-01 10:15:00 | Andheri Prop | rajesh@... | user.invite | membership_456 | {role: "agent"}
  2024-06-01 11:00:00 | Platform | admin@... | tenant.suspend | tenant_789 | {reason: "payment_failed"}

Export: [CSV] [JSON] [SIEM]
```

### 9. Maintenance Mode
```
[Enable Maintenance Mode]
  -> Scheduled: [Date picker]
  -> Duration: 30 minutes
  -> Affected services: [Gateway] [AI] [Dashboard]
  -> Message to tenants: "Scheduled maintenance at 2 AM IST. Service will be back in 30 minutes."
  -> Auto-postpone if active conversations > 10

Emergency Maintenance:
  -> One-click "Emergency Mode"
  -> All AI responses: "Service temporarily unavailable. Please try again in a few minutes."
  -> Human agents can still access dashboard
  -> Slack alert to on-call engineer
```

## Security Operations

### Suspicious Activity Detection
```
Auto-detect:
  - Login from new country (alert + 2FA required)
  - Bulk data export (alert admin)
  - Multiple failed logins (rate limit + alert)
  - API key usage from unusual IP (alert + revoke option)
  - Cross-tenant access attempt (block + alert)

Response:
  - Low: Log only
  - Medium: Alert tenant admin
  - High: Alert platform admin + temporary suspension
  - Critical: Immediate suspension + notification
```

### Data Purge
```
For cancelled tenants after 30 days:
  1. Export data to cold storage (encrypted, 7-year retention for audit)
  2. Delete from production database
  3. Delete files from object storage
  4. Delete from vector store
  5. Remove from Redis
  6. Soft-delete tenant record (maintain slug reservation 1 year)
  7. Log purge in audit trail
```
