# WhatsApp Pricing (India Real Estate Focus)

## Conversation-Based Pricing Model

WhatsApp Business API pricing is conversation-based, not per-message.

**User-initiated conversation**: Customer sends first message, 24-hour window opens.
**Business-initiated conversation**: Business sends first message using approved template.

## India Pricing (Approximate, 2024)

| Provider | User-Initiated | Business-Initiated | Monthly Fixed |
|----------|---------------|-------------------|---------------|
| Meta Cloud API | $0.004 | $0.008 | $0 |
| Twilio | $0.005 | $0.013 | $0 |
| Gupshup | $0.003 | $0.006 | $0 |
| Interakt | N/A (per-month) | N/A (per-month) | $15-99/mo |
| 360dialog | N/A (per-month) | N/A (per-month) | $49-149/mo |

## Real Estate Agency Cost Estimates

### Small Agency (1-3 agents, ~50 leads/month)

| Metric | Value |
|--------|-------|
| Incoming leads via WhatsApp | 50/month |
| Avg messages per conversation | 8 |
| Outbound follow-ups (templates) | 30/month |
| Total conversations | 80/month |
| Cost via Gupshup | ~$0.50/month |
| Cost via Meta direct | ~$0.64/month |
| Cost via Interakt | ~$15/month (fixed) |

### Mid-Size Agency (5-10 agents, ~300 leads/month)

| Metric | Value |
|--------|-------|
| Incoming leads | 300/month |
| Avg messages per conversation | 6 |
| Outbound follow-ups | 150/month |
| Total conversations | 450/month |
| Cost via Gupshup | ~$2.70/month |
| Cost via Meta direct | ~$3.60/month |
| Cost via Interakt | ~$49/month (fixed, unlimited) |

### Large Developer (50+ agents, ~2000 leads/month)

| Metric | Value |
|--------|-------|
| Incoming leads | 2,000/month |
| Avg messages per conversation | 5 |
| Outbound broadcasts | 500/month |
| Total conversations | 2,500/month |
| Cost via Gupshup | ~$12.50/month |
| Cost via Meta direct | ~$16.00/month |
| Cost via Interakt | ~$99/month (unlimited) |

## Pricing Strategy for OpenClaw TeamOS

### SaaS Model (We Charge Tenant)

Option 1: Pass-through + margin
- We pay provider at cost
- Charge tenant cost + 20% margin
- Example: Gupshup $0.50 -> Tenant billed $0.60

Option 2: Bundled in plan
- Pro plan includes 500 WhatsApp conversations/month
- Overage: $0.01 per conversation
- Enterprise: unlimited WhatsApp

Option 3: Bring-your-own-provider
- Tenant connects their own Gupshup/Twilio account
- We charge $0 (they pay provider directly)
- We only charge platform fee

### Recommended: Option 2 (Bundled)

| Plan | WhatsApp Included | Overage |
|------|------------------|---------|
| Community | 0 (Telegram only) | N/A |
| Pro ($49/mo) | 500 conversations | $0.01 |
| Pro ($99/mo) | 2,000 conversations | $0.008 |
| Enterprise | Unlimited | $0 |

## Cost Breakdown Example (Pro $99/month)

| Item | Cost |
|------|------|
| Platform fee | $99.00 |
| WhatsApp conversations (2,000 included) | $0.00 |
| LLM tokens (~50K messages, GPT-4o-mini) | ~$15.00 |
| Storage (10GB) | $0.00 |
| Total cost to us | ~$25.00 |
| Gross margin | ~75% |

## India-Specific Considerations

1. **UPI for payments**: Integrate UPI checkout for billing
2. **GST**: Add 18% GST on SaaS fees
3. **Local providers**: Gupshup, Interakt, ValueFirst for better India support
4. **Hindi/regional languages**: Template approval needed for non-English templates
5. **DND/TRAI compliance**: Respect national do-not-call registry
