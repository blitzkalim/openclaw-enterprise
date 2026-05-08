# Current OpenClaw Reality

## Architecture (From Audit Evidence)

OpenClaw is a **modular monolith**: a single Node.js 22+ gateway process that hosts HTTP/WebSocket server, agent runtime, channel plugins, cron scheduler, and UI static files all in one process.

```
┌─────────────────────────────────────────────┐
│            OpenClaw Gateway                  │
│  ┌─────────┐  ┌─────────┐  ┌───────────┐  │
│  │ HTTP    │  │ WS      │  │ Control   │  │
│  │ Server  │  │ Runtime │  │ UI (React)│  │
│  └────┬────┘  └────┬────┘  └─────┬─────┘  │
│       │            │              │       │
│  ┌────▼────────────▼──────────────▼─────┐  │
│  │         Gateway Methods (RPC)          │  │
│  │  channels | cron | sessions | tools   │  │
│  └──────────────────────────────────────┘  │
│       │            │              │       │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼─────┐  │
│  │ Agents   │  │ Plugins │  │ Config   │  │
│  │ Runtime  │  │ Runtime │  │ JSON5    │  │
│  └──────────┘  └─────────┘  └──────────┘  │
│       │            │              │       │
│  ┌────▼────────────▼──────────────▼─────┐  │
│  │        Storage Layer                  │  │
│  │  ~/.openclaw/ (JSON + SQLite + Files) │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Current Auth Model

- **Single `OPENCLAW_GATEWAY_TOKEN`** — one bearer token for all access
- Alternative: password, Tailscale headers, trusted proxy IP, device token
- No user accounts, no sessions, no roles
- Token compared with constant-time equality (`safeEqualSecret`)
- Rate limiting on failed auth attempts
- Weak secret detection at startup

### Gateway Token Model

```
OPENCLAW_GATEWAY_TOKEN (env var or config)
  -> src/gateway/startup-auth.ts (resolve at startup)
    -> src/gateway/auth.ts (constant-time compare)
      -> HTTP header "Authorization: Bearer <token>"
        -> WebSocket query param "?token=<token>"
```

### Channel Support (Evidence from `08-channels/`)

| Channel | Auth | Multi-Tenant Ready? |
|---------|------|---------------------|
| WhatsApp | QR pairing (Baileys) | **No** — one device per instance |
| Telegram | Bot token (Grammy) | **Yes** — bot-per-tenant |
| Discord | Bot token | **Yes** — bot-per-tenant |
| Slack | Bot + App token | **Yes** — app-per-tenant |
| Signal | signal-cli bridge | **No** — one device |
| Webhooks | None / configurable | **Yes** — path-based routing |

### Agent/Skill/Plugin Model

- **Agents**: Defined in config, each has model, system prompt, tool allowlist
- **Skills**: Declarative toolsets in `skills/` and `extensions/*/skills/`
- **Plugins**: Extensions with manifest, loaded into same Node.js process
- **Runtime**: `src/agents/agent-command.ts` (1,218 lines) orchestrates LLM calls
- **Execution**: In-process, no VM/container isolation by default

### DB/Storage Model

| Data | Format | Location | Concurrent Safe? |
|------|--------|----------|-----------------|
| Config | JSON5 | `~/.openclaw/openclaw.json` | No |
| Sessions | JSON | `~/.openclaw/sessions/*.json` | No |
| Tasks | SQLite | `~/.openclaw/tasks.sqlite` | Partial |
| Cron | JSON | `~/.openclaw/cron.json` | No |
| Media | Files | `~/.openclaw/media/` | No |
| Vector memory | LanceDB | `~/.openclaw/memory/` | Partial |

**Verdict**: File-based storage works for single-user desktop use. It **cannot serve multiple concurrent tenants** without file-locking race conditions and data leakage risk.

### Deployment Model

- Docker Compose: single container
- Fly.io / Render: single VM with volume
- No Kubernetes manifests
- No horizontal scaling
- Volume is single point of failure

### Strengths (Preserve)

1. Plugin ecosystem — 100+ extensions, massive time saver
2. Agent runtime — battle-tested LLM orchestration
3. Channel normalization — unified message envelope
4. OpenAI-compatible API — ecosystem compatibility
5. Modern codebase — TypeScript ESM, React 19, Vitest
6. Skill system — declarative tool definitions
7. Subagent / node invocation — complex workflow support

### Weaknesses (Address)

1. **Single user** — no concept of accounts, tenants, or teams
2. **No RBAC** — all-or-nothing access via gateway token
3. **File-based state** — no ACID, no concurrent access, no HA
4. **No audit logging** — compliance impossible
5. **Plugin isolation** — same-process execution, crash risk
6. **No cost tracking** — cannot meter LLM usage
7. **No encryption at rest** — raw JSON files on disk
8. **No backup/restore** — manual file copy only
9. **WhatsApp per-instance** — cannot share one number across tenants
10. **No webhook multi-tenancy** — single endpoint, no tenant routing

## Evidence Sources

- `04-auth-security/auth-overview.md` — auth methods
- `05-gateway/gateway-architecture.md` — server design
- `07-db-models/db-stack.md` — storage architecture
- `08-channels/supported-channels.md` — channel inventory
- `09-whatsapp/whatsapp-current-state.md` — WhatsApp limits
- `11-agents/agent-architecture.md` — agent runtime
- `13-plugins/plugin-system.md` — plugin loading
- `22-risks-gaps/feature-gaps.md` — all gaps cataloged
- `24-executive-summary/audit-summary.md` — overall verdict
