# Permissions & RBAC

## RBAC Detection Result: NOT FOUND

After comprehensive analysis of the codebase, **no Role-Based Access Control (RBAC) system exists** in OpenClaw core.

## What Was Searched

| Search Term | Technique | Result |
|-------------|-----------|--------|
| `role`, `roles` | grep across src/ | No RBAC roles found in core |
| `permission`, `permissions` | grep across src/ | No permission system in core |
| `acl` | grep across src/ | No ACL system |
| `policy`, `policies` | grep across src/ | No policy engine |
| `tenant`, `tenants` | grep across src/ | No multi-tenant isolation |
| `workspace` | grep across src/ | Present in UI/UX context, not tenant isolation |
| `organization`, `org` | grep across src/ | Not found as tenant construct |
| `team`, `teams` | grep across src/ | Not found as tenant construct |
| `account` | grep across src/ | Present in generic account contexts (e.g., API accounts) |

## Gateway Auth is Binary

The gateway authentication system (`src/gateway/auth.ts`) produces a simple result:

```typescript
type GatewayAuthResult = {
  method: "token" | "password" | "tailscale" | "trusted-proxy" | "bootstrap";
  user?: string;
  reason?: string;
  rateLimited?: boolean;
  deviceToken?: string;
};
```

- **Authenticated** = any valid method succeeds
- **Anonymous** = no auth or auth fails
- No role, group, or privilege differentiation

## Extension-Level RBAC

Some channel extensions implement their own limited access control:

### Telegram Admin Commands
- `extensions/telegram/src/` likely has admin-only commands
- Bot API has `ChatMember` roles (owner, administrator, member)
- Not RBAC in the gateway sense

### Discord Guild Permissions
- `extensions/discord/src/` uses Discord's native permission system
- Guild owner, admin, role-based channel permissions
- Not enforced by OpenClaw core

### Slack Workspace
- `extensions/slack/src/` uses Slack's workspace permissions
- Bot scopes (`chat:write`, `channels:read`) are OAuth2
- Not RBAC within OpenClaw

### No Core Enforcement

If an extension implements its own access control:
- It is **extension-owned behavior**
- Core does not enforce or validate
- Extension must handle its own authorization

## Multi-Tenant Readiness: LOW

### No Tenant Isolation

| Feature | Status | Evidence |
|---------|--------|----------|
| Tenant ID in config | No | No `tenant_id` field in `OpenClawConfig` |
| Tenant namespace in sessions | No | Session keys are flat |
| Tenant-scoped config | No | Single `openclaw.json` per instance |
| Tenant-scoped plugins | No | Plugin registry is global |
| Tenant-scoped memory | No | Memory indices are global |
| Resource-level ACL | No | No resource ownership model |

### Single-User Design

OpenClaw is explicitly designed as a **personal AI assistant**:
- One gateway per user/device
- Config is personal (`~/.openclaw/`)
- Auth is single shared secret
- Channels connect to personal accounts

### Container Multi-Instance

Multi-tenancy could be achieved at the **infrastructure level**:
- One Docker container per tenant
- Separate `OPENCLAW_STATE_DIR` per tenant
- No application-level tenant isolation needed

## Implications

1. **No data segregation** — all authenticated clients see the same data
2. **No admin dashboard** — no concept of admin vs user
3. **No team/workspace features** — not designed for organizations
4. **Channel-level isolation only** — e.g., different Telegram bots are different instances

## Recommendation

If multi-tenant or RBAC requirements emerge:
- Add `tenant_id` to config, sessions, and memory
- Implement middleware to extract and validate tenant context
- Scope all data access by tenant namespace
- Add role-based permissions per tenant

---

*Evidence: Comprehensive grep across `src/` for RBAC/multi-tenant keywords; `src/gateway/auth.ts` auth result type; `src/config/config.ts` schema; `src/sessions/session-store.ts` session key structure.*
