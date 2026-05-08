# 00 — Summary

## What We Are Building

A **minimal multi-user + channel-routing extension** for OpenClaw. Not a SaaS platform. Not a fork. A small overlay that lets one OpenClaw process serve:

- 1 solo user (today's behavior — unchanged)
- A small team (3–10 users sharing one install)
- Optionally a couple of teams on the same machine

…and lets those users send/receive messages through **WhatsApp** and **Telegram** so AI agents can act on real-world conversations.

## How It Extends OpenClaw (Not Replaces It)

We **do not redesign** OpenClaw core. We add:

1. A thin **identity layer** — users, sessions, API tokens — sitting in front of the existing gateway auth.
2. A **channel-router layer** — webhook endpoints that take a message from WhatsApp/Telegram, identify which OpenClaw user it belongs to, and call into existing agent runtime.
3. A **tiny relational store** (SQLite by default, Postgres optional) for users, sessions, and channel-identity mappings. Everything else stays where OpenClaw already keeps it: `~/.openclaw/` files, in-process plugin registry, vector memory, etc.

The existing `OPENCLAW_GATEWAY_TOKEN` keeps working unchanged. Existing channel extensions (`extensions/telegram`, `extensions/whatsapp`) keep working unchanged. We layer on top of them.

## Who Will Use It

| Persona | Use Case |
|---|---|
| **Solo operator** | Same as today — one token, one set of agents, optional WhatsApp/Telegram for personal use |
| **Small agency / team (3–10)** | Each teammate logs in with email + password, uses the same agent fleet, has their own WhatsApp/Telegram-mapped identity, sees their own conversations |
| **Two cooperating teams** | Optional `workspace` row groups users; one OpenClaw install hosts both. No tenant-router, no domain routing, no SSO. |

## What We Are Explicitly NOT Building

- ❌ Multi-tenant SaaS, tenant-router middleware, per-tenant schemas
- ❌ RBAC matrices, role hierarchies, custom roles, permission catalogs
- ❌ Postgres + Redis + BullMQ + MinIO stack
- ❌ Kubernetes, Helm charts, horizontal scaling, HPA
- ❌ JWT + JWKS + RS256 + refresh-token rotation + device fingerprint
- ❌ Audit logs, billing meter, usage events, license gates
- ❌ Admin React dashboard
- ❌ WhatsApp Cloud API multi-provider abstraction (Gupshup vs Meta vs Twilio)

The full enterprise plan (`/kalim/enterprise-plan/`) covers all of that. This plan is the **minimum viable subset** that delivers multi-user + WhatsApp/Telegram on a single machine for an OSS hobbyist or small team — the 80/20.

## Output Layout

```
/kalim/enterprise-simple-plan/
  00-summary/                    ← this file
  01-current-understanding/      ← what OpenClaw already gives us
  02-extension-strategy/         ← where we add code, where we don't
  03-user-model/                 ← User + optional Workspace
  04-auth-design/                ← email/password + API token; legacy token preserved
  05-channel-routing/            ← WhatsApp + Telegram webhook → user → agent
  06-agent-usage/                ← reuse existing agents, attach user context
  07-minimal-db-changes/         ← 3–4 tables, nothing else
  08-code-change-plan/           ← exact files, line-counts, risk
  09-deployment-model/           ← Docker Compose on one EC2; K8s optional
  10-user-flows/                 ← lead capture, PDF upload, two users
  11-security-basics/            ← user isolation, webhook verify, rate limit
  12-final-recommendation/       ← what to build first
```

## One-Sentence Pitch

> **OpenClaw + a 600-line "team mode" overlay that adds users, WhatsApp, and Telegram — runs on one EC2, falls back to single-user mode when you turn it off.**
