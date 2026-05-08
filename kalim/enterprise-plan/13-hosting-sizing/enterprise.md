# Hosting: Enterprise (SaaS Multi-Tenant)

## Profile
Multiple tenants (100-1000), thousands of users, high availability, compliance.

## Hardware (Per Region)
| Resource | Spec | Count |
|----------|------|-------|
| Gateway pods | 1 CPU, 2GB RAM | 2-20 (auto-scale) |
| Worker pods | 1 CPU, 2GB RAM | 2-10 (auto-scale) |
| Postgres primary | 4 CPU, 16GB RAM | 1 |
| Postgres replicas | 4 CPU, 16GB RAM | 2 |
| Redis cluster | 1 CPU, 2GB RAM | 6 (3 master + 3 replica) |
| MinIO nodes | 2 CPU, 4GB RAM | 4 (distributed) |
| PgBouncer | 1 CPU, 1GB RAM | 2 |
| Nginx ingress | 1 CPU, 1GB RAM | 2 |
| Monitoring | 2 CPU, 4GB RAM | 1 stack |

## Deployment
Full Kubernetes cluster with:
- 3+ worker nodes (8 CPU, 32GB each)
- Separate data nodes (DB + Redis)
- Object storage cluster
- Load balancer (cloud provider or MetalLB)
- CDN for static assets (CloudFlare / AWS CloudFront)

## Cloud Cost Estimate (Monthly)
| Component | AWS | GCP | Azure |
|-----------|-----|-----|-------|
| Compute (E2/GKE/AKS) | $800 | $700 | $900 |
| RDS/Cloud SQL | $400 | $350 | $450 |
| ElastiCache/Memorystore | $200 | $180 | $220 |
| S3/Cloud Storage | $100 | $80 | $120 |
| Load Balancer | $50 | $40 | $60 |
| CDN | $50 | $40 | $50 |
| Monitoring | $100 | $80 | $100 |
| **Total per region** | **$1,700** | **$1,470** | **$1,900** |

With 2 regions: ~$3,000-4,000/month base infrastructure.

## At Scale (1000+ Tenants)
- Shard tenants across multiple DB clusters
- Add read replicas (5-10)
- Gateway pods: 50-100
- Worker pods: 20-50
- CDN + edge caching for dashboard assets
- Separate analytics pipeline (ClickHouse / BigQuery)

## Cost per Tenant
| Tenants | Infra/Month | Cost/Tenant |
|---------|-------------|-------------|
| 10 | $2,000 | $200 |
| 50 | $2,500 | $50 |
| 100 | $3,000 | $30 |
| 500 | $5,000 | $10 |
| 1,000 | $7,000 | $7 |
| 5,000 | $15,000 | $3 |

At 1000 tenants paying average $60/month = $60K MRR.
Infrastructure = $7K/month.
Gross margin = ~88%.

## Capacity
- 50,000+ conversations/month
- 1M+ messages/month
- 1000+ tenants
- 10,000+ users
- 10TB+ storage
- 99.9% uptime (with SLA)
