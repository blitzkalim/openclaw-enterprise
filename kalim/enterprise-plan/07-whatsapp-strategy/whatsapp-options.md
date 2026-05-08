# WhatsApp Strategy Options

## Problem

OpenClaw's current WhatsApp extension uses Baileys (WhatsApp Web protocol via WebSocket). This requires:
- One phone with WhatsApp installed
- QR code pairing per device
- State files stored locally
- Single device = single instance

This does **not** work for multi-tenant SaaS. Each tenant needs their own WhatsApp number.

## Option A: Meta Cloud API (WhatsApp Business API)

### Architecture

```
Tenant -> Meta Developer Portal
  -> Create WhatsApp Business Account
    -> Get Phone Number ID
      -> Get Permanent Access Token
        -> Configure webhook to our platform
          -> /webhooks/whatsapp/:tenantId
            -> Verify signature
              -> process message
```

### Pros
- Official, stable, documented
- Webhook-based (no device required)
- Supports templates, buttons, flows
- Broadcast messages
- Message status (delivered, read)

### Cons
- Requires Meta Business Verification (~1-2 weeks)
- Per-message pricing ($0.005-0.05 per conversation)
- 24-hour conversation window (template needed after)
- No "personal WhatsApp" — business account only
- API rate limits

### Pricing (Meta Official)

| Region | User-initiated | Business-initiated |
|--------|---------------|-------------------|
| India | ~$0.004/conversation | ~$0.008/conversation |
| USA | ~$0.008/conversation | ~$0.014/conversation |
| UAE | ~$0.019/conversation | ~$0.038/conversation |

Conversation = 24-hour window.

### Multi-Tenant Model

Each tenant gets their own Meta Business Account, or we manage one account with multiple phone numbers.

**Model A1: Tenant brings their own Meta account**
- Tenant signs up for Meta Business
- We provide webhook URL
- They configure their own API credentials
- Pros: No cost liability for us
- Cons: Complex onboarding, tenant dropout

**Model A2: We manage one Meta account with sub-tenants**
- One verified Meta Business Account
- Multiple phone numbers added
- Our platform routes by phone number -> tenant
- Pros: Streamlined onboarding
- Cons: Single point of failure, cost centralization

## Option B: Third-Party WhatsApp Providers

### B1: Twilio

- API: REST + webhooks
- Pricing: ~$0.005-0.01 per message
- Features: Templates, media, message status
- Multi-tenant: Phone number per tenant
- Pros: Reliable, good docs, existing OpenClaw integration potential
- Cons: Higher cost than Meta direct

### B2: Gupshup (India-focused)

- API: REST + webhooks
- Pricing: ~$0.003-0.006 per message (India)
- Features: Rich media, templates, UPI flows
- Multi-tenant: App ID per tenant
- Pros: India pricing leader, great for real estate market
- Cons: Less global coverage

### B3: Interakt (India-focused)

- API: REST + webhooks
- Pricing: ~$15-99/month per number
- Features: Catalogs, catalogs, broadcasts
- Multi-tenant: One Interakt account, multiple numbers
- Pros: Fixed cost predictability
- Cons: Monthly fee even with low usage

### B4: 360dialog

- API: REST + webhooks (wrapper on Meta API)
- Pricing: ~$49/month + per-message
- Multi-tenant: Reseller program available
- Pros: Simplified Meta API management
- Cons: Middleman markup

## Option C: Shared Number Multi-Tenant (Hybrid)

### Concept

One WhatsApp Business number serves multiple tenants via AI routing.

```
Inbound message to +91-98765-43210
  -> AI reads message content
    -> "I want 2BHK in Bandra" -> route to Broker A
    -> "Book site visit at Lodha" -> route to Broker B
    -> Unknown intent -> human triage
```

### Pros
- Only one WhatsApp number needed
- Lower operational cost
- Faster tenant onboarding

### Cons
- **Very risky for business** — wrong routing destroys trust
- AI misclassification = lead to wrong broker
- Cannot use broadcast/catalog features per tenant
- No tenant branding on number
- Legal/compliance issues with data sharing

**Verdict: NOT RECOMMENDED for production. Use only for internal testing or MVP hack.**

## Comparison Matrix

| Criteria | Meta Direct | Twilio | Gupshup | Interakt | 360dialog | Shared Number |
|----------|:-----------:|:------:|:-------:|:--------:|:---------:|:-------------:|
| Setup complexity | High | Medium | Medium | Low | Medium | Low |
| India pricing | Medium | High | Low | Medium | Medium | Low |
| Global coverage | Full | Full | Limited | Limited | Full | N/A |
| Multi-tenant ease | Medium | Medium | Medium | Medium | High | Low |
| Template support | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Catalog/shop | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Message status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Broadcast | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Verification needed | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cost predictability | Variable | Variable | Variable | Fixed | Fixed | Low |

## Recommendation

| Phase | Recommendation |
|-------|---------------|
| MVP (India) | **Gupshup** or **Interakt** — fast setup, India pricing |
| Scale (India) | **Meta Cloud API** — lowest per-message cost at volume |
| Global | **Twilio** or **Meta Cloud API** — reliable, well-documented |
| Enterprise | **Meta Cloud API** with **360dialog** reseller management |
