# Implementation Roadmap

## Phase 0: Foundation (Weeks 1-2)

### Infrastructure
- [ ] Set up K8s cluster (dev/staging/prod)
- [ ] Deploy Postgres 15 + Redis + MinIO
- [ ] CI/CD pipeline (GitHub Actions -> Docker -> K8s)
- [ ] Monitoring: Prometheus + Grafana + Loki
- [ ] SSL/TLS via Let's Encrypt

### Database
- [ ] Design final schema (review and freeze)
- [ ] Create migrations (node-pg-migrate)
- [ ] Seed system roles and permissions
- [ ] Set up read replica (staging)

### Auth Service
- [ ] JWT generation (RS256)
- [ ] Registration/login endpoints
- [ ] Password reset flow
- [ ] OAuth (Google) integration
- [ ] API key generation

## Phase 1: Core Platform (Weeks 3-6)

### Multi-Tenant Core
- [ ] Tenant context middleware
- [ ] Tenant resolver (subdomain + slug)
- [ ] DB client with tenant scoping
- [ ] RLS policies on all tables
- [ ] Tenant onboarding API

### RBAC
- [ ] Role definitions and permissions
- [ ] Permission middleware
- [ ] Admin, Manager, Agent role enforcement
- [ ] Role assignment UI

### Channels
- [ ] Telegram webhook handler (per-tenant bot)
- [ ] Gupshup WhatsApp integration
- [ ] Message normalization layer
- [ ] Webhook signature verification
- [ ] Delivery status tracking

### Conversations
- [ ] Conversation CRUD API
- [ ] Message storage and retrieval
- [ ] Real-time updates (WebSocket or SSE)
- [ ] Conversation assignment

## Phase 2: AI & Agents (Weeks 7-10)

### Agent Runtime
- [ ] Tenant-scoped agent config loading
- [ ] System prompt injection (tenant name, bot identity)
- [ ] Tool permission boundaries
- [ ] Context window management (summarization)
- [ ] Handoff detection and triggers

### Lead Management
- [ ] Lead CRUD API
- [ ] Lead qualification logic (AI extraction)
- [ ] Lead assignment (round-robin, load-balanced)
- [ ] Lead status workflow
- [ ] Duplicate detection

### Skills
- [ ] Inventory search skill (tenant-scoped)
- [ ] CRM sync skill framework
- [ ] Document upload skill
- [ ] Follow-up scheduling skill

### Memory
- [ ] Redis short-term context
- [ ] Postgres long-term conversation history
- [ ] Vector search for relevant past conversations
- [ ] Agent learning storage

## Phase 3: Dashboard & UI (Weeks 11-14)

### Admin Dashboard
- [ ] Tenant list and management
- [ ] Tenant impersonation
- [ ] System health monitoring
- [ ] Support ticket queue
- [ ] Feature flags management

### Tenant Dashboard
- [ ] Lead list with search/filter
- [ ] Lead detail view (conversation history)
- [ ] Agent performance metrics
- [ ] Team management (invite, roles)
- [ ] Channel configuration (WhatsApp, Telegram)
- [ ] AI agent configuration (prompt, model, handoff)
- [ ] Billing and usage overview

### Agent Interface
- [ ] My leads view
- [ ] Conversation takeover
- [ ] Quick reply templates
- [ ] Lead status updates
- [ ] Follow-up scheduling

## Phase 4: CRM & Integrations (Weeks 15-17)

### CRM Connectors
- [ ] Zoho CRM OAuth + sync
- [ ] HubSpot API key + sync
- [ ] Google Sheets append
- [ ] Salesforce (Enterprise)
- [ ] Custom webhook (Enterprise)

### Billing
- [ ] Stripe/Razorpay integration
- [ ] Subscription management
- [ ] Usage metering (conversations, messages, storage)
- [ ] Invoice generation (PDF)
- [ ] Overage handling

### Email
- [ ] SendGrid/Postmark integration
- [ ] Transactional emails (signup, password reset, invoice)
- [ ] Marketing email opt-in

## Phase 5: Scale & Polish (Weeks 18-22)

### Performance
- [ ] Database query optimization
- [ ] Redis caching layer
- [ ] CDN for media assets
- [ ] Connection pooling (PgBouncer)
- [ ] Read replica routing

### Security
- [ ] Penetration testing (third-party)
- [ ] SOC 2 readiness assessment
- [ ] GDPR/DPDP compliance audit
- [ ] Bug bounty program launch

### Monitoring
- [ ] Alerting (PagerDuty/OpsGenie)
- [ ] Error tracking (Sentry)
- [ ] APM (Datadog/New Relic)
- [ ] Log aggregation and search

### Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Developer docs (self-hosted setup)
- [ ] User guides (agent, manager, admin)
- [ ] Video tutorials

## Phase 6: Launch (Weeks 23-24)

### Beta
- [ ] Invite-only beta (10 real estate agencies)
- [ ] Feedback collection and iteration
- [ ] Performance tuning based on real load
- [ ] Bug fixes and polish

### Public Launch
- [ ] Website launch
- [ ] Community edition release (GitHub)
- [ ] Pro SaaS launch ($49/mo)
- [ ] PR and marketing push
- [ ] Real estate conference presence

### Post-Launch
- [ ] Customer success onboarding
- [ ] Weekly feature releases
- [ ] Monthly customer feedback sessions
- [ ] Quarterly roadmap reviews

## Milestones

| Date | Milestone |
|------|-----------|
| Week 2 | Dev environment ready, DB schema frozen |
| Week 4 | Auth + tenant core working |
| Week 6 | Telegram + WhatsApp channels live |
| Week 8 | AI lead qualification working |
| Week 10 | Lead management + assignment working |
| Week 12 | Dashboard MVP (leads + conversations) |
| Week 14 | Team management + billing |
| Week 16 | Zoho + HubSpot CRM sync |
| Week 18 | Performance optimized |
| Week 20 | Security audit complete |
| Week 22 | Documentation complete |
| Week 23 | Beta launch |
| Week 26 | Public launch |
