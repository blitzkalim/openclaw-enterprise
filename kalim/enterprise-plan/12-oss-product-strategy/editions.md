# Product Editions

## Three Edition Strategy

### Community (Open Source)
**Target**: Individual developers, hobbyists, small agencies
**License**: Apache 2.0
**Price**: Free
**Deployment**: Self-hosted only
**Features**: Full OpenClaw base + enterprise overlay, single tenant, file/SQLite storage, Telegram + basic WhatsApp (Baileys), single AI agent, basic leads, CLI only, community Discord support
**Limitations**: No multi-tenant, no SaaS dashboard, no billing, no managed WhatsApp API, no CRM integrations, no SLA

### Pro (SaaS + Self-Hosted)
**Target**: Small to mid-size agencies, teams 3-15
**License**: Source-available
**Price**: $49-99/month SaaS OR $999/year self-hosted
**Features**: Multi-tenant, web dashboard, WhatsApp Business API, Email, 6 starter agents, Zoho/HubSpot sync, Google Sheets, team roles, basic analytics, email support 48h

### Enterprise
**Target**: Large agencies, developers, franchises
**License**: Commercial
**Price**: Custom ($500+/month SaaS OR $5K+/year self-hosted)
**Features**: Unlimited users/channels/agents, Salesforce + custom CRM, custom agent builder, dedicated infra option, white-label, SSO, advanced RBAC, audit logs 7yr, SLA 99.9%, phone support, onboarding, data residency

## Feature Matrix
| Feature | Community | Pro | Enterprise |
|---------|:---------:|:---:|:----------:|
| Open source | Yes | Source | Source* |
| Self-hosted | Yes | Yes | Yes |
| SaaS hosted | No | Yes | Yes |
| Users | 1 | 5-15 | Unlimited |
| Channels | Telegram | All | All+custom |
| AI Agents | 1 | 6 | Unlimited |
| CRM Sync | DIY | Zoho,HubSpot | All+custom |
| Dashboard | CLI | Full Web | Full+custom |
| Roles | Owner | Standard | Custom |
| Analytics | Basic | Standard | Advanced+BI |
| Support | Community | Email 48h | Phone+SLA |
| White-label | No | No | Yes |
| SSO | No | No | Yes |
| SLA | No | No | 99.9% |
| Data residency | No | No | Yes |
| Audit retention | No | 1 year | 7 years |

*Enterprise source available under commercial license with NDA.

## Transition Paths
Developer tries Community (free) -> Upgrades to Pro SaaS ($49/mo) -> Needs dedicated infra -> Upgrades to Enterprise ($500+/mo) -> Needs full control + compliance -> Enterprise Self-Hosted ($5K/yr + support)

Agency starts with Pro ($99/mo) -> Grows to 20 agents -> Hits user limit -> Upgrade to Enterprise -> Negotiates custom pricing

## Why Open Source the Core?
1. Adoption: Developers try before buying
2. Trust: Auditable code for security-conscious buyers
3. Ecosystem: Community builds plugins
4. Hiring: Developers know the stack
5. Marketing: GitHub stars = credibility
6. Sustainability: OSS base with commercial add-ons is proven model (GitLab, Mattermost, n8n)
