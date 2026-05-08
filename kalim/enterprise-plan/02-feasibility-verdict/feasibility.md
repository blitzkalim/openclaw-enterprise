# Feasibility Verdict

## Options Considered

| Option | Description | Effort | Risk |
|--------|-------------|--------|------|
| **A. Extension Only** | Build multi-tenant layer as OpenClaw plugin | Low | **Very High** — plugin cannot override auth/storage |
| **B. Maintained Fork** | Fork OpenClaw, add multi-tenant features upstream | Medium | **High** — merge conflicts on every upstream release |
| **C. Modular Overlay** | Keep OpenClaw core, add enterprise services around it | Medium | **Medium** — cleanest architecture, preserves upstream |
| **D. Wrong Foundation** | Abandon OpenClaw, build from scratch | Very High | **Low** — but loses 100+ extensions and 2+ years of dev |

## Verdict: C — Modular Overlay with Selective Fork

We build **OpenClaw TeamOS** as a **modular overlay** that:
1. Keeps OpenClaw core gateway **mostly untouched**
2. Adds a **thin enterprise service layer** (auth, tenant DB, RBAC)
3. Replaces file-based storage with **Postgres + Redis**
4. Injects tenant context via **middleware and runtime hooks**
5. Forks only the files we **must** modify (auth, storage adapters)

## Why Not A (Extension Only)?

- OpenClaw plugins run **in-process** with same privileges as core
- Plugin **cannot intercept auth** before gateway auth runs
- Plugin **cannot replace storage layer** — config/session APIs are internal
- Plugin **cannot add HTTP middleware** — gateway routes are hardcoded
- The plugin SDK is designed for **channels/tools**, not platform overrides

## Why Not B (Maintained Fork)?

- Upstream releases ~2x/month with bug fixes and new channels
- Fork would **diverge rapidly** on `src/gateway/auth.ts`, `src/config/`, `src/agents/`
- Merge conflicts on every upstream pull → engineering overhead
- Community contributions to upstream don't flow to fork
- **Exception**: We maintain a **shallow fork** of 5–10 critical files only, not full repo

## Why C Wins

### Architecture

```
┌──────────────────────────────────────────────┐
│  Ingress (Nginx / Traefik / Cloud LB)        │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Tenant   │  │ Auth     │  │ Rate Limit │  │
│  │ Router   │  │ Service  │  │ Middleware │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       └─────────────┴──────────────┘        │
│                   │                          │
│  ┌────────────────▼────────────────────────┐  │
│  │      OpenClaw Gateway (Modified)         │  │
│  │  - Auth replaced with JWT check        │  │
│  │  - Config replaced with Postgres       │  │
│  │  - Session store replaced with Redis     │  │
│  │  - Channel routing by tenant_id        │  │
│  │  - Agent config scoped to tenant       │  │
│  └────────────────┬─────────────────────────┘  │
│                   │                          │
│  ┌────────────────▼────────────────────────┐  │
│  │         Data Layer                      │  │
│  │  Postgres (tenant, user, config, logs) │  │
│  │  Redis (sessions, queues, caching)     │  │
│  │  Object Storage (media, documents)   │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### Modified Files (Shallow Fork)

| File | Current | Change |
|------|---------|--------|
| `src/gateway/auth.ts` | Compares `OPENCLAW_GATEWAY_TOKEN` | Validates JWT, extracts tenant/user |
| `src/config/io.ts` | Reads/writes JSON5 file | Reads/writes Postgres `tenant_config` table |
| `src/sessions/session-store.ts` | JSON files in `~/.openclaw/sessions/` | Redis hash per session |
| `src/gateway/server-http.ts` | Static route matching | Inject tenant middleware early |
| `src/gateway/server-methods-list.ts` | Method registry | Wrap methods with permission check |
| `src/agents/agent-command.ts` | `resolveAgentRuntimeConfig()` | Load agent config from tenant-scoped store |
| `src/channels/plugins/configured-binding-compiler.ts` | Channel binding by global config | Channel binding filtered by `tenant_id` |

### New Files (Overlay)

| File | Purpose |
|------|---------|
| `src/enterprise/tenant-context.ts` | Tenant resolution from hostname / header / path |
| `src/enterprise/auth-service.ts` | JWT issue/validate, refresh, MFA ready |
| `src/enterprise/rbac-service.ts` | Role/permission resolution |
| `src/enterprise/db-client.ts` | Postgres connection pool with tenant filtering |
| `src/enterprise/redis-client.ts` | Redis connection for sessions/queues |
| `src/enterprise/audit-logger.ts` | Immutable audit log to Postgres |
| `src/enterprise/billing-meter.ts` | LLM token usage tracking |
| `src/enterprise/channel-router.ts` | Route inbound messages to correct tenant |

## Time to MVP

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Auth + Tenant DB | 2 weeks | JWT auth, tenant schema, user invites |
| Phase 2: Gateway Integration | 2 weeks | Auth replacement, config adapter, session Redis |
| Phase 3: Channels + RBAC | 2 weeks | Telegram per-tenant, role middleware, admin UI |
| Phase 4: Real Estate Agents | 2 weeks | Lead intake, inventory search, CRM sync |
| Phase 5: K8s + Billing | 2 weeks | Helm chart, Stripe integration, usage metering |
| **Total MVP** | **10 weeks** | Deployable multi-tenant platform |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Upstream breaking change | Medium | High | Shallow fork only; abstract adapters |
| Postgres migration complexity | Medium | Medium | Adapters with fallback to file-based |
| WhatsApp multi-tenant | High | High | Use provider bridge (Twilio/Gupshup) |
| Plugin compatibility | Medium | Medium | Test all bundled extensions in CI |
| Performance regression | Low | Medium | Benchmark before/after; Redis for hot paths |
| Security vulnerability | Low | **Critical** | Security audit at Phase 1 gate; pen-test at Phase 5 |

## Upstream Merge Complexity

- **Weekly**: Rebase our shallow fork onto upstream main
- **Process**: `git pull upstream main`, resolve 5–10 file conflicts
- **CI**: Run full test suite on rebase before merge to our main
- **Goal**: Never more than 2 weeks behind upstream

## Final Verdict

**Modular Overlay (Option C) is the only viable path.** It preserves the massive value of OpenClaw's plugin ecosystem and agent runtime while adding the minimal enterprise scaffolding needed for multi-tenancy. The shallow fork of 5–10 files is a manageable maintenance burden compared to the 2+ years of development we'd lose building from scratch.
