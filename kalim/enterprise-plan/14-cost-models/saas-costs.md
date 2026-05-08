# SaaS Cost Model

## Revenue Assumptions (Month 12)

| Tier | Customers | Avg Monthly | Monthly Revenue |
|------|-----------|-------------|-----------------|
| Pro | 80 | $49 | $3,920 |
| Pro Plus | 20 | $99 | $1,980 |
| Enterprise | 5 | $500 | $2,500 |
| **Total MRR** | **105** | | **$8,400** |
| **ARR** | | | **$100,800** |

## Cost Breakdown (Monthly)

### Infrastructure
| Component | Cost |
|-----------|------|
| AWS/GCP Compute (K8s) | $1,200 |
| Postgres (RDS + replicas) | $400 |
| Redis (ElastiCache) | $200 |
| S3/Cloud Storage | $100 |
| CDN + Load Balancer | $100 |
| Monitoring (Datadog/Grafana Cloud) | $200 |
| **Infra Total** | **$2,200** |

### Third-Party Services
| Service | Cost |
|---------|------|
| LLM API (OpenAI/Anthropic) | $800 |
| WhatsApp messaging (Gupshup pass-through) | $500 |
| Stripe/Razorpay (payment processing, 2%) | $168 |
| SendGrid/Postmark (email) | $50 |
| SMS (Twilio) | $100 |
| **Services Total** | **$1,618** |

### Team (India-based)
| Role | Count | Salary/Month | Total |
|------|-------|--------------|-------|
| Full-stack Engineer | 2 | $2,500 | $5,000 |
| DevOps Engineer | 1 | $2,000 | $2,000 |
| Support/Success | 1 | $800 | $800 |
| **Team Total** | | | **$7,800** |

### Other
| Item | Cost |
|------|------|
| Office/workspace | $200 |
| Legal/accounting | $300 |
| Marketing | $500 |
| Tools (GitHub, Slack, Figma) | $100 |
| **Other Total** | **$1,100** |

## P&L (Month 12)

| Line Item | Amount |
|-----------|--------|
| MRR | $8,400 |
| **Total Monthly Cost** | **$12,718** |
| **Net Monthly** | **-$4,318** |

Break-even at ~150 customers (mix of Pro/Pro Plus/Enterprise).

## Unit Economics

### Per Customer (Blended Average)
| Metric | Value |
|--------|-------|
| ARPU (Average Revenue Per User) | $80 |
| COGS (Infra + services per customer) | $36 |
| Gross Margin | 55% |
| CAC (Customer Acquisition Cost) | $200 |
| Payback Period | 2.5 months |
| LTV (3-year, 5% monthly churn) | $4,560 |
| LTV:CAC Ratio | 22.8:1 |

## Scaling Economics

| Customers | MRR | Infra | Team | Net |
|-----------|-----|-------|------|-----|
| 50 | $3,500 | $1,500 | $7,800 | -$5,800 |
| 100 | $7,000 | $2,000 | $7,800 | -$2,800 |
| 150 | $10,500 | $2,500 | $9,800 | -$1,800 |
| 250 | $17,500 | $3,500 | $12,000 | $2,000 |
| 500 | $35,000 | $5,000 | $18,000 | $12,000 |
| 1000 | $70,000 | $7,000 | $25,000 | $38,000 |

## Cost Optimization Levers

1. **LLM costs**: Use GPT-4o-mini for 80% of conversations, GPT-4o only for complex queries. Cache common responses.
2. **Infra**: Start with Hetzner/OVH instead of AWS. Migrate to AWS only for Enterprise SLA needs.
3. **Team**: Hire in tier-2 Indian cities (Pune, Indore, Jaipur) vs Mumbai/Bangalore.
4. **WhatsApp**: Pass-through pricing with small markup (10%) vs bundling.
5. **Multi-tenancy**: Single DB instance for first 200 tenants. Shard only when query latency > 200ms.

## Self-Hosted License Revenue

| Tier | Licenses/Year | Price | Annual Revenue |
|------|---------------|-------|----------------|
| Pro self-hosted | 20 | $999 | $19,980 |
| Enterprise self-hosted | 5 | $5,000 | $25,000 |
| **Total** | | | **$44,980** |

Self-hosted has near-zero marginal cost (no infra, no support included).
