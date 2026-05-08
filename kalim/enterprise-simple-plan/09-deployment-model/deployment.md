# 09 — Deployment Model

## Two Modes Only

| Mode | Target | Stack |
|---|---|---|
| **Simple (Primary)** | Solo / small team | Single EC2 + Docker Compose |
| **Optional Scale** | Multi-team or HA | Kubernetes (Helm) — only if/when needed |

We design for Mode 1. Mode 2 is described but not required, not built into v1, and not the recommendation.

---

## Mode 1 — Simple (Primary)

### Hardware

| Spec | Recommended | Minimum |
|---|---|---|
| CPU | 2–4 vCPU | 2 vCPU |
| RAM | 4–8 GB | 4 GB |
| Disk | 50 GB SSD | 20 GB SSD |
| Network | Public IP, ports 80/443 reachable | same |

A `t3.medium` on AWS (~$30/mo), an Hetzner CX22 (~€5/mo), or a $20 DigitalOcean droplet are all fine. The whole reason to pick this design is so a hobbyist or small agency can run it on a single machine.

### Topology

```
                ┌─────────────────────────────────────────┐
                │   Public Internet                       │
                └─────────────────┬───────────────────────┘
                                  │  HTTPS :443
                                  ▼
                ┌─────────────────────────────────────────┐
                │   Caddy / nginx (TLS terminator)        │  ← single static config
                │   - autotls via Let's Encrypt           │
                │   - proxies / → openclaw:8080           │
                │   - proxies /webhooks/ → openclaw:8080  │
                └─────────────────┬───────────────────────┘
                                  │  HTTP :8080
                                  ▼
                ┌─────────────────────────────────────────┐
                │   openclaw                              │
                │   - Node 22                             │
                │   - team mode on (OPENCLAW_TEAM_MODE=1) │
                │   - mounts: /data → ~/.openclaw         │
                └─────────────────────────────────────────┘
                                  │
                                  ▼
                ┌─────────────────────────────────────────┐
                │   /data volume (SQLite + JSON + LanceDB)│
                └─────────────────────────────────────────┘
```

That's it. **One container for OpenClaw, one for the TLS proxy.** No Postgres, no Redis, no MinIO, no worker pods, no message queue.

### `docker-compose.yml`

```yaml
version: '3.8'
services:
  caddy:
    image: caddy:2
    ports: ['80:80', '443:443']
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    restart: unless-stopped

  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    environment:
      OPENCLAW_TEAM_MODE: '1'
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN}
      OPENCLAW_TEAM_ADMIN_EMAIL: ${OPENCLAW_TEAM_ADMIN_EMAIL}
      OPENCLAW_TEAM_ADMIN_PASSWORD: ${OPENCLAW_TEAM_ADMIN_PASSWORD}
      OPENCLAW_PUBLIC_BASE_URL: https://oc.example.com
    volumes:
      - openclaw-data:/root/.openclaw
    expose: ['8080']
    restart: unless-stopped

volumes:
  caddy-data:
  openclaw-data:
```

### `Caddyfile`

```
oc.example.com {
  reverse_proxy openclaw:8080
}
```

Caddy auto-issues TLS. The webhooks at `/webhooks/whatsapp/...` and `/webhooks/telegram/...` are reachable on the public domain and verified via HMAC / secret-token (§05).

### Env Vars (Complete List)

| Var | Purpose | Required |
|---|---|---|
| `OPENCLAW_TEAM_MODE` | Set to `1` to enable team mode | yes (Mode 1) |
| `OPENCLAW_GATEWAY_TOKEN` | Existing OpenClaw bearer token | yes |
| `OPENCLAW_TEAM_ADMIN_EMAIL` | Bootstrap admin login | first run |
| `OPENCLAW_TEAM_ADMIN_PASSWORD` | Bootstrap admin password | first run |
| `OPENCLAW_PUBLIC_BASE_URL` | For building webhook URLs and OAuth redirects | yes (for WhatsApp/Telegram) |
| `OPENCLAW_TEAM_ALLOW_SIGNUP` | `1` to allow self-signup | optional, default off |
| `OPENCLAW_COOKIE_SECRET` | HMAC secret for cookie signing | recommended |
| `OPENCLAW_TEAM_DATABASE_URL` | If set, swap SQLite for Postgres | optional |

Existing OpenClaw env vars (`TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, etc.) keep working unchanged.

### First-Run Bootstrap

```
1. docker compose up -d
2. Visit https://oc.example.com/login
3. Log in with OPENCLAW_TEAM_ADMIN_EMAIL / OPENCLAW_TEAM_ADMIN_PASSWORD
4. /team → invite teammates (links shared manually)
5. /team → create per-workspace WhatsApp + Telegram bot configs
6. Configure webhooks at Telegram BotFather and Meta Cloud API console
   pointing to https://oc.example.com/webhooks/{telegram,whatsapp}/<workspace_id>
7. Each user clicks "Link my Telegram" and "Link my WhatsApp" in /team
   → claim code → message the bot → linked
```

End-to-end: ~15 minutes from `docker compose up` to first message.

### Backups

```
0 3 * * * docker exec openclaw \
  cp /root/.openclaw/team.sqlite /root/.openclaw/backups/team-$(date +\%F).sqlite
0 4 * * * aws s3 sync /var/lib/docker/volumes/openclaw-data /backups/openclaw/
```

Or whatever the operator's existing backup tooling is. A nightly volume snapshot covers everything (config, sessions, vectors, team DB) since it all lives in `~/.openclaw/`.

### Updates

```
docker compose pull && docker compose up -d
```

No migrations to run by hand: `migrate()` runs at process start and bumps `user_version` if needed.

---

## Mode 2 — Optional Scale (K8s)

Only adopt this when:

- More than ~10 users / one process can no longer keep up
- HA / zero-downtime deploys become a hard requirement
- Two operators want to share ops responsibility
- A second OpenClaw instance is needed (e.g. staging)

The path is **not** in scope for v1 of the simple plan. When you reach it, you've outgrown this plan and should adopt the full enterprise plan (`/kalim/enterprise-plan/13-hosting-sizing/`, `18-roadmap/`, `04-multi-tenant-architecture/`).

The minimum changes when you do migrate:

1. Switch SQLite → Postgres via `OPENCLAW_TEAM_DATABASE_URL`. Schema is portable (§07).
2. Add Redis only if you genuinely need session sharing across replicas. For 2 replicas + sticky sessions, you don't.
3. Helm chart with values: image tag, env, persistent volume claim, ingress.
4. **Don't** retrofit RBAC, billing, audit logging in this step. Move those one at a time as you actually need them.

A bare-bones Helm chart for the simple plan would have **one Deployment, one Service, one Ingress, one PVC**. Total ~80 lines. We do not ship it in v1.

---

## What This Saves Us

| Big Plan deployment | This plan |
|---|---|
| Postgres (managed RDS) | none |
| Redis (Elasticache) | none |
| Object storage (S3 / MinIO) | none |
| BullMQ workers | none |
| K8s cluster (3+ nodes) | one VM |
| Auth Service (separate process) | inline in OpenClaw |
| Admin UI build pipeline | server-rendered HTML |
| TLS / cert-manager | Caddy autotls |
| Monitoring (Prometheus + Grafana) | OpenClaw's existing logger + `journalctl` |
| **Monthly infra cost** | **$5–$30** vs. $300–$2,000 |

The whole point: **a teenager with a $5 droplet can run this for their study group.** The business-grade stack waits until there's a business.
