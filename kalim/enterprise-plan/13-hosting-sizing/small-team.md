# Hosting: Small Team (Pro Edition, Self-Hosted)

## Profile
5 users, 1 tenant, Postgres + Redis, WhatsApp + Telegram, 6 agents, Zoho sync.

## Hardware
| Resource | Spec |
|----------|------|
| CPU | 2 cores |
| RAM | 4GB |
| Storage | 50GB SSD |
| Network | 10Mbps |

## Deployment
- VPS: AWS t3.medium ($30/mo), DigitalOcean $24/mo, Hetzner CPX21 (7 EUR/mo)
- Or single VM on existing infrastructure

## Software Stack
- Node.js 22 (single gateway process + 1 worker)
- Postgres 15 (shared, 1GB RAM)
- Redis (shared, 512MB)
- MinIO or S3-compatible (optional, can use local disk)
- Docker Compose or single K8s node

## Docker Compose
```yaml
services:
  gateway:
    image: openclaw-teamos:latest
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, redis]
  worker:
    image: openclaw-teamos:latest
    command: pnpm run worker
    env_file: .env
    depends_on: [postgres, redis]
  postgres:
    image: postgres:15-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: openclaw
      POSTGRES_USER: openclaw
      POSTGRES_PASSWORD: ${DB_PASSWORD}
  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
  minio:
    image: minio/minio
    command: server /data --console-address :9001
    volumes: ["miniodata:/data"]
```

## Cost Estimate
| Provider | Monthly |
|----------|---------|
| Hetzner CPX21 (2vCPU, 4GB) | 7 EUR (~$7.50) |
| DigitalOcean $24 droplet | $24 |
| AWS t3.medium | ~$30 |
| Self-hosted VM | $0 |

Total with backup storage: ~$15-35/month

## Capacity
- 500 conversations/month
- 10,000 messages/month
- 5 users
- 2 channels
- 6 agents
- 50GB storage
