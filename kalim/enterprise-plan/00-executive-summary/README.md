# OpenClaw Enterprise — Executive Summary

## What We Are Building

A **multi-tenant AI automation platform** built on top of OpenClaw that lets real estate agencies (and any SMB) deploy their own AI assistant across WhatsApp, Telegram, and future channels. Tenants get scoped agents, team RBAC, CRM integrations, and usage-based billing — while the platform remains open-source and self-hostable.

## Working Name

**OpenClaw TeamOS** — signaling team/multi-tenant orientation while keeping OpenClaw brand lineage.

Alternative: **OpenClaw Enterprise Edition** (formal) / **OpenClaw Pro** (commercial tier).

## Why OpenClaw Is Suitable

| Strength | Why It Matters |
|----------|---------------|
| 100+ channel/provider extensions | WhatsApp, Telegram, Slack, Discord, and 15+ more — no build from scratch |
| Agent + skill + plugin model | Natural extension point for tenant-scoped agents |
| OpenAI-compatible API surface | Existing integrations "just work" |
| File-based + SQLite foundation | Easy to overlay Postgres without massive rewrite |
| Modern TS/React codebase | Team can onboard fast |
| Active OSS community | Distribution via GitHub + word of mouth |
| Docker-first deployment | Kubernetes overlay is straightforward |

## Why OpenClaw Is NOT Ready Out-of-the-Box

| Gap | Business Impact |
|-----|----------------|
| Single user / single token | Cannot serve multiple agencies from one install |
| No RBAC | Cannot have manager/agent/staff permissions |
| File-based state | No concurrent multi-tenant access, no backups/HA |
| No audit logging | Enterprise compliance impossible |
| No cost tracking | Cannot bill tenants for LLM usage |
| No multi-tenant WhatsApp | Baileys QR pairing is per-device, not per-tenant |
| No encryption at rest | Customer data security concern |

## Fastest Path to Launch (MVP in 30 days)

1. **Auth + Tenant schema** (Week 1) — Postgres + Redis overlay, JWT auth, tenant middleware
2. **Tenant-scoped channels** (Week 2) — Telegram bot-per-tenant first (easiest), WhatsApp via provider bridge
3. **RBAC + user invites** (Week 3) — roles, permissions, admin UI
4. **Real estate starter agents** (Week 4) — lead intake, inventory search, reminders
5. **Deploy to K8s** (Week 4) — Helm chart, one-command install

## OSS Strategy

| Edition | License | What's Included |
|---------|---------|----------------|
| **Community** | Apache 2.0 | Single-tenant OpenClaw + all upstream features |
| **Pro** (SaaS) | Proprietary / source-available | Multi-tenant, RBAC, billing dashboard, priority channels |
| **Enterprise** | Commercial | SSO, audit logs, private cloud, SLA, custom integrations |

**Why not AGPL?** AGPL scares enterprise legal teams and makes cloud-hosting startups nervous. Apache 2.0 + paid features (dual-license style) maximizes adoption while protecting revenue.

## Revenue Path

| Stream | Model | Target |
|--------|-------|--------|
| SaaS hosted | $29–99/tenant/month | Small agencies, solo brokers |
| Self-hosted Pro license | $499–2,999/year | Mid-size firms wanting data control |
| Enterprise implementation | $10K–50K setup + annual | Large developers, property portals |
| WhatsApp messaging fees | Pass-through + 5–10% margin | Usage-based |
| LLM usage markup | Cost + 20–30% | Token usage billing |

## Key Metrics for Success

- 100 tenants in 6 months (SaaS)
- 50 self-hosted Pro licenses in 12 months
- 5 enterprise deals in 12 months
- Break-even at 40 paid tenants

## Immediate Next Step

Begin **Phase 1** (Auth + Tenant Schema) using the modular overlay approach: keep OpenClaw core intact, inject tenant context via middleware and Postgres, maintain backward compatibility for single-user mode.
