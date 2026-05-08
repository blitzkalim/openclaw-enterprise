# Product Definition

## Product Name

**OpenClaw TeamOS**

Tagline: *"AI-powered team automation for every business"*

## Target Users

### 1. Owner (Platform Admin)
- Manages the entire OpenClaw TeamOS instance
- Creates/deletes tenants
- Sets global platform settings
- Views billing and usage across all tenants
- Manages enterprise integrations

### 2. Tenant Owner (Business Owner)
- Signs up their company
- Configures billing
- Invites team members
- Sets channel connections (WhatsApp, Telegram)
- Chooses AI model provider

### 3. Tenant Admin (Office Manager)
- Manages day-to-day tenant settings
- Creates/deletes agents
- Assigns leads to agents
- Views analytics dashboard
- Manages CRM connections

### 4. Manager (Team Lead)
- Views team performance
- Assigns leads to staff
- Monitors conversation queue
- Runs reports
- Has limited agent configuration access

### 5. Agent (Sales Rep / Field Staff)
- Interacts with AI via channels
- Receives lead assignments
- Updates lead status
- Uploads documents/brochures
- Views their own performance

### 6. Staff (Support / Back Office)
- Read-only or limited-write access
- Views conversations
- Runs standard reports
- Cannot modify AI agents

## Product Editions

### Community Edition (Free / OSS)

**License**: Apache 2.0

**For**: Solo developers, hobbyists, small personal use

**Includes**:
- Single tenant (one business)
- One admin user
- Telegram bot support
- Basic agents (2 pre-built)
- Local file-based storage
- Self-hosted only
- Community support (Discord/GitHub)

### Pro Edition (SaaS / Source-Available)

**License**: Source-available (self-host) or SaaS subscription

**For**: Small agencies, teams of 3-10, growing businesses

**Pricing**: $49-99/tenant/month (SaaS) or $999/year (self-hosted)

**Includes**:
- Multi-tenant (up to 5 tenants per instance self-hosted, unlimited SaaS)
- Full RBAC (Owner, Admin, Manager, Agent, Staff)
- Telegram + WhatsApp (via Twilio/Gupshup)
- CRM integrations (Zoho, HubSpot, Google Sheets)
- Real estate starter agents (5 agents)
- Usage analytics dashboard
- Email support

### Enterprise Edition (Commercial)

**License**: Commercial license + SLA

**For**: Large agencies, property developers, 50+ user teams

**Pricing**: $2,999-9,999/year (self-hosted) or custom SaaS

**Includes**:
- Unlimited tenants
- SSO (Google Workspace, Azure AD, Okta)
- Salesforce integration
- Audit logs (immutable)
- Custom agent development
- Dedicated support
- SLA: 99.9% uptime
- On-premise deployment
- White-label branding

## Channel Strategy by Edition

| Channel | Community | Pro | Enterprise |
|---------|-----------|-----|------------|
| Telegram | ✅ | ✅ | ✅ |
| WhatsApp | ❌ | ✅ | ✅ |
| Slack | ❌ | ✅ | ✅ |
| Discord | ❌ | ❌ | ✅ |
| Email | ❌ | ❌ | ✅ |
| Web Chat | ❌ | ✅ | ✅ |
| Custom API | ❌ | ❌ | ✅ |

## Real Estate Use Case Focus

### Primary Commands

1. **Lead Intake**: "Add lead Rahul wants 2BHK in Bandra"
2. **Inventory Search**: "Show 3BHK under 5cr in Andheri"
3. **Follow-up Management**: "Show pending follow-ups for Amit"
4. **Document Handling**: "Save this brochure to Lodha inventory"
5. **Assignment**: "Assign lead #1234 to Priya"
6. **Scheduling**: "Book site visit tomorrow 3pm with Sharma"
7. **Summarization**: "Summarize discussion with Mr. Mehta"
8. **CRM Sync**: "Sync all leads to Zoho"

### Target Market: India Real Estate First

- Brokerages (individual brokers, small shops)
- Developer marketing teams
- Property portals (secondary market)
- Channel partners (multi-brand brokers)

Then expand to:
- Insurance agents
- Financial advisors
- Travel agencies
- Recruitment firms
- Any service business with leads + follow-ups

## Success Metrics

- Time to first tenant signup: < 5 minutes
- Time to first AI conversation: < 10 minutes
- Channel setup time: < 3 minutes (Telegram), < 10 minutes (WhatsApp)
- Lead capture accuracy: > 90%
- User activation (sent first message): > 60% within 7 days
- Monthly churn: < 10%
