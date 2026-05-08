# Hosting: Mid-Size Agency (Pro Plus SaaS or Self-Hosted)

## Profile
15 users, 1 tenant, all channels, unlimited agents, CRM + analytics.

## Hardware (Self-Hosted)
| Resource | Spec |
|----------|------|
| CPU | 4 cores |
| RAM | 8GB |
| Storage | 200GB SSD |
| Network | 50Mbps |

## Deployment
- Dedicated VM: AWS t3.large ($60/mo), DigitalOcean $48/mo, Hetzner CPX31 (14 EUR/mo)
- Or 3-node K8s cluster for resilience

## Software Stack
- Node.js 22 (2 gateway pods + 2 workers)
- Postgres 15 (2 CPU, 4GB RAM dedicated)
- Redis (1GB dedicated)
- MinIO (50GB)
- Nginx reverse proxy
- Let's Encrypt SSL

## K8s (Minimal)
```yaml
# 1 master + 2 worker nodes
nodes:
  - 2vCPU, 4GB (master + gateway)
  - 2vCPU, 4GB (worker + postgres)
  - 2vCPU, 4GB (redis + minio)
```

## Cost Estimate (Self-Hosted)
| Provider | Monthly |
|----------|---------|
| Hetzner (3x CPX21) | 21 EUR (~$22) |
| DigitalOcean (3x $24) | $72 |
| AWS (t3.large + t3.medium x2) | ~$120 |
| Managed DB (RDS/Railway) | +$50-100 |

Total: ~$70-220/month

## SaaS Equivalent
Pro Plus plan: $99/month (we handle infra, backups, support)

## Capacity
- 2,000 conversations/month
- 50,000 messages/month
- 15 users
- All channels
- Unlimited agents
- 200GB storage
- 99.5% uptime
