# Exact Code Change Map

## Philosophy: Overlay, Not Fork

We create `src/enterprise/` as a parallel directory. Upstream files get minimal patches via a `src/enterprise/patches/` system that applies at build time.

## New Files (No upstream edits needed)

| File | Purpose | Lines |
|------|---------|-------|
| `src/enterprise/index.ts` | Enterprise module entry point | 50 |
| `src/enterprise/auth/auth-adapter.ts` | JWT + legacy dual auth | 80 |
| `src/enterprise/auth/jwt-verify.ts` | RS256 JWT verification | 60 |
| `src/enterprise/auth/api-key-auth.ts` | API key middleware | 50 |
| `src/enterprise/rbac/roles.ts` | Role definitions | 40 |
| `src/enterprise/rbac/permissions.ts` | Permission catalog | 30 |
| `src/enterprise/rbac/middleware.ts` | RBAC enforcement | 60 |
| `src/enterprise/db/client.ts` | Knex/Postgres client | 40 |
| `src/enterprise/db/migrate.ts` | Migration runner | 30 |
| `src/enterprise/db/context.ts` | Tenant context for queries | 40 |
| `src/enterprise/tenants/tenant-resolver.ts` | Tenant lookup middleware | 50 |
| `src/enterprise/tenants/tenant-context.ts` | Tenant context type | 20 |
| `src/enterprise/channels/whatsapp-router.ts` | WhatsApp webhook router | 80 |
| `src/enterprise/channels/whatsapp-normalizer.ts` | Message normalization | 60 |
| `src/enterprise/channels/gupshup-client.ts` | Gupshup API client | 100 |
| `src/enterprise/channels/meta-client.ts` | Meta Cloud API client | 120 |
| `src/enterprise/channels/telegram-router.ts` | Telegram webhook router | 60 |
| `src/enterprise/channels/telegram-client.ts` | Telegram API wrapper | 50 |
| `src/enterprise/agents/tenant-agent-config.ts` | Tenant-scoped agent config | 80 |
| `src/enterprise/agents/agent-registry.ts` | Per-tenant agent loading | 60 |
| `src/enterprise/skills/tenant-skill-loader.ts` | Tenant skill loading | 50 |
| `src/enterprise/skills/tenant-context-wrapper.ts` | Skill context injection | 40 |
| `src/enterprise/plugins/tenant-plugin-runtime.ts` | Tenant plugin proxy | 60 |
| `src/enterprise/crm/zoho-connector.ts` | Zoho CRM sync | 120 |
| `src/enterprise/crm/hubspot-connector.ts` | HubSpot sync | 100 |
| `src/enterprise/crm/salesforce-connector.ts` | Salesforce sync | 140 |
| `src/enterprise/crm/google-sheets-connector.ts` | Sheets sync | 80 |
| `src/enterprise/crm/sync-job.ts` | Async CRM sync worker | 60 |
| `src/enterprise/memory/short-term.ts` | Redis conversation context | 50 |
| `src/enterprise/memory/long-term.ts` | Postgres vector search | 60 |
| `src/enterprise/memory/agent-learnings.ts` | Agent learning storage | 40 |
| `src/enterprise/billing/usage-meter.ts` | Usage event logging | 40 |
| `src/enterprise/billing/subscription-check.ts` | Plan limit enforcement | 50 |
| `src/enterprise/secrets/encryption.ts` | AES-256-GCM crypto | 60 |
| `src/enterprise/secrets/storage.ts` | Secret CRUD | 40 |
| `src/enterprise/audit/logger.ts` | Audit log writer | 40 |
| `src/enterprise/audit/middleware.ts` | Request audit logging | 30 |
| `src/enterprise/licensing/license-check.ts` | License verification | 60 |
| `src/enterprise/licensing/feature-gate.ts` | Feature access control | 30 |
| `src/enterprise/api/tenant-routes.ts` | Tenant REST API routes | 200 |
| `src/enterprise/api/lead-routes.ts` | Lead CRUD routes | 150 |
| `src/enterprise/api/conversation-routes.ts` | Conversation routes | 120 |
| `src/enterprise/api/message-routes.ts` | Message routes | 80 |
| `src/enterprise/api/user-routes.ts` | User management routes | 100 |
| `src/enterprise/api/channel-routes.ts` | Channel config routes | 80 |
| `src/enterprise/api/agent-routes.ts` | Agent config routes | 80 |
| `src/enterprise/api/dashboard-routes.ts` | Analytics routes | 60 |
| `src/enterprise/api/billing-routes.ts` | Billing routes | 80 |
| `src/enterprise/api/webhook-routes.ts` | Provider webhook routes | 60 |
| `src/enterprise/server/admin-server.ts` | Admin UI server (Express) | 100 |
| `src/enterprise/server/healthz.ts` | Health check endpoints | 30 |
| `src/enterprise/workers/cron-scheduler.ts` | Cron job runner | 40 |
| `src/enterprise/workers/follow-up-worker.ts` | Follow-up job processor | 60 |
| `src/enterprise/workers/crm-sync-worker.ts` | CRM sync processor | 40 |
| `src/enterprise/workers/billing-aggregator.ts` | Billing aggregation job | 40 |
| `src/enterprise/ui/` | React/Vue admin dashboard | ~3000 |

## Upstream Patches (Minimal edits)

| File | Change | Lines |
|------|--------|-------|
| `src/gateway/auth.ts` | Add `resolveAuthContext` call at top of `authorizeHttpGatewayConnect` | +20 |
| `src/gateway/server-http.ts` | Add tenant context middleware before routes | +15 |
| `src/gateway/server-ws-runtime.ts` | Inject auth context into WS connections | +15 |
| `src/config/io.ts` | Add `tenantId` parameter, route to DB if set | +25 |
| `src/sessions/session-store.ts` | Add `tenantId` parameter, route to Redis if set | +20 |
| `src/agents/agent-command.ts` | Use tenant-aware config resolver | +10 |
| `src/agents/pi-tools.ts` | Wrap tools with tenant context + permission check | +30 |
| `src/plugins/plugin-loader.ts` | Load per-tenant plugin configs | +15 |
| `package.json` | Add enterprise deps: `knex`, `pg`, `ioredis`, `bcrypt`, `jsonwebtoken`, `express`, `bullmq` | +10 |
| `Dockerfile` | Multi-stage build including enterprise overlay | +20 |

## Total Lines of Code

| Category | Files | Approx Lines |
|----------|-------|--------------|
| New enterprise modules | 50+ | ~6,000 |
| Admin UI (React) | 30+ | ~3,000 |
| Upstream patches | 10 | ~180 |
| **Total** | | **~9,200** |

## Build Integration

```typescript
// src/index.ts (patched)
import { initEnterprise } from './enterprise';

async function main() {
  // Existing OpenClaw initialization
  await initGateway();

  // Enterprise layer (only if DATABASE_URL set)
  if (process.env.DATABASE_URL) {
    await initEnterprise();
  }
}
```

## No-Touch Files (Upstream remains untouched)

These files work as-is with context injection:
- `src/agents/agent-runtime.ts` (reads config via adapter)
- `src/channels/*` (channel plugins unchanged)
- `src/skills/*` (skills unchanged, wrapped at runtime)
- `ui/` (existing UI, enterprise has separate admin UI)
- `extensions/*` (most extensions work via adapter)
- `src/gateway/protocol/*` (protocol unchanged)
