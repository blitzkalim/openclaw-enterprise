# Hosting: Solo User (Community Edition)

## Profile
1 user, 1 tenant (self), file-based storage, Telegram only, no database.

## Hardware
| Resource | Spec |
|----------|------|
| CPU | 1 core (any modern x86/ARM) |
| RAM | 512MB |
| Storage | 10GB SSD |
| Network | 1Mbps up/down |

## Deployment Options
- Personal laptop / Raspberry Pi 4
- VPS: AWS t3.micro, DigitalOcean $6/mo, Hetzner CX11 (3 EUR/mo)
- Fly.io free tier (256MB, 3GB storage)

## Software Stack
- Node.js 22 (single process)
- SQLite (embedded)
- No Redis
- No Postgres
- No K8s

## Docker Compose
```yaml
services:
  openclaw:
    image: openclaw-teamos:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - OPENCLAW_GATEWAY_TOKEN=secret
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
```

## Cost Estimate
| Provider | Monthly |
|----------|---------|
| Fly.io free tier | $0 |
| DigitalOcean $6 droplet | $6 |
| Hetzner CX11 | 3 EUR |
| AWS t3.micro | ~$8 |
| Self-hosted (Raspberry Pi) | $0 (electricity ~$1) |

## Capacity
- 100 conversations/month
- 1,000 messages/month
- 1 agent
- 1 channel (Telegram)
