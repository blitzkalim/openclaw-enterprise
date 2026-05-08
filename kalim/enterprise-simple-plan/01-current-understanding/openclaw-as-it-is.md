# 01 — Current Understanding (Compact)

This is the OpenClaw reality, condensed from `/kalim/enterprise-plan/01-current-openclaw-reality/`, `04-auth-security/`, `08-channels/`, `11-agents/`, and `13-plugins/`. Only what matters for the simple-plan.

## How OpenClaw Currently Works

OpenClaw is a **single Node.js 22+ process** (modular monolith) that hosts:

- **HTTP gateway** — `src/gateway/server-http.ts`
- **WebSocket runtime** — `src/gateway/server-ws-runtime.ts`
- **Method registry** (RPC over HTTP/WS) — `src/gateway/server-methods-list.ts`
- **Agent runtime** — `src/agents/agent-command.ts` (the LLM orchestrator)
- **Channel layer** — `src/channels/` + each `extensions/<channel>/` plugin
- **Static UI** — `ui/` (React) bundled and served by the same process
- **State on disk** — `~/.openclaw/` (JSON5 config, JSON sessions, SQLite tasks, LanceDB vectors, files)

One process, one disk, one user. That is the design today.

## How the Gateway Token Works

There is **one shared bearer token**: `OPENCLAW_GATEWAY_TOKEN`.

```
Client request
  → Authorization: Bearer <token>     (HTTP)
     or ?token=<token>                (WebSocket)
  → src/gateway/auth.ts
     → safeEqualSecret(token, configured)
        → pass / fail
```

Resolution order (from `src/gateway/startup-auth.ts` and `auth-resolve.ts`):

1. `OPENCLAW_GATEWAY_TOKEN` env var
2. Config file value
3. Tailscale header (if trusted)
4. Trusted proxy IP allowlist
5. Device-token (paired control UI)

There is **no concept** of a user, a session, an account, or a role. Every authenticated caller has full access. Rate limiting on failed auth (`auth-rate-limit.ts`) and weak-secret detection at startup are the only hardening.

## How Channels Work

Channels live in `extensions/<name>/` (e.g. `extensions/telegram/`, `extensions/whatsapp/`, `extensions/signal/`). Each is a plugin with:

- a manifest (`openclaw.plugin.json`)
- a runtime entry (`setup-entry.ts`, `runtime-api.ts`)
- a config-API surface for the gateway

At startup, `src/channels/plugins/configured-binding-compiler.ts` reads channel configs and binds each one into the runtime. Inbound messages arrive via:

- **Telegram**: long-poll or webhook (Grammy library)
- **WhatsApp**: Baileys library, **QR-paired to one device per process**
- **Signal**: signal-cli bridge, also one device per process

Each channel emits a normalized message envelope into `src/channels/` plumbing, which routes to the agent runtime via configured bindings. The whole chain assumes **one identity**: the OpenClaw operator.

For multi-user we don't need to rewrite any of this — we add a webhook layer in front that maps an incoming `from` (phone / telegram_user_id) to one of *our* users, then hands off to the existing channel/agent path.

## How Agents / Skills / Plugins Work

- **Agents** are declarative configs (`agents/<name>/`, plus `src/agents/agent-command.ts` runtime). Each agent has a model, a system prompt, and a tool allowlist.
- **Skills** are declarative tool bundles in `skills/` and `extensions/*/skills/`.
- **Plugins** are extensions loaded into the same Node process from `extensions/*/`. They register channels, tools, providers.
- **Execution** is in-process, no VM or container isolation. `agent-command.ts` calls the LLM, dispatches tools, streams output back.

Configs are read once at startup and reloaded via the gateway methods. Per-agent state (sessions, memory) keys off a session id, not a user id.

## DB / Storage Model

| Data | Format | Location |
|---|---|---|
| Config | JSON5 | `~/.openclaw/openclaw.json` |
| Sessions | JSON files | `~/.openclaw/sessions/*.json` |
| Tasks | SQLite | `~/.openclaw/tasks.sqlite` |
| Cron | JSON | `~/.openclaw/cron.json` |
| Media | Files | `~/.openclaw/media/` |
| Vector memory | LanceDB | `~/.openclaw/memory/` |

Single-writer, file-locked-ish. **Good enough for a small team on one machine.** We will not replace it. We will add a **tiny SQLite database** alongside it for users, sessions, and channel-identity mappings.

## What This Means for the Simple Plan

**Reuse, don't rewrite.** Everything OpenClaw already does — agents, skills, plugins, channels, vector memory — keeps working. We add three things:

1. **A user table + login** in front of the gateway token.
2. **Webhook endpoints for WhatsApp/Telegram** that map an incoming sender to a user.
3. **A `user_id` tag on session keys and agent calls** so memory and conversations stay separate.

That's it. Anything else is Phase 2 territory and lives in the full enterprise plan.

## Source Map

| Concern | File |
|---|---|
| Gateway HTTP server | `src/gateway/server-http.ts` |
| Gateway WS runtime | `src/gateway/server-ws-runtime.ts` |
| Gateway auth | `src/gateway/auth.ts` |
| Token resolution | `src/gateway/startup-auth.ts`, `auth-resolve.ts` |
| Method registry | `src/gateway/server-methods-list.ts` |
| Sessions | `src/sessions/session-id.ts`, `session-key-utils.ts` |
| Agent runtime | `src/agents/agent-command.ts`, `agent-runtime-config.ts` |
| Channel binding | `src/channels/plugins/configured-binding-compiler.ts` |
| Telegram plugin | `extensions/telegram/` |
| WhatsApp plugin | `extensions/whatsapp/` |
| Config IO | `src/config/` |
| Memory | `src/memory/` |

Everything else is unchanged. We do not touch `ui/`, `src/agents/agent-command.ts` internals, `src/channels/*` core, or any plugin code.
