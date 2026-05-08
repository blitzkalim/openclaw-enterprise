# WhatsApp Recommendation

## Final Recommendation

### For India Real Estate Market (MVP -> Scale)

**Phase 1 (MVP, 0-3 months): Gupshup**

**Why Gupshup:**
- Lowest per-message cost in India
- No monthly minimum (pure usage-based)
- Fast API approval (hours, not weeks)
- Good documentation for Indian developers
- Supports all WhatsApp Business features

**Setup for tenants:**
1. Tenant signs up on Gupshup separately
2. Provides API key + app ID in our UI
3. We configure webhook automatically
4. Live in under 10 minutes

### Phase 2 (Scale, 3-12 months): Meta Cloud API

**Why Meta Cloud API:**
- Lowest cost at high volume (>10K conversations/month)
- No middleman markup
- Full feature set (templates, catalogs, flows)
- Direct relationship with Meta

**Migration path:**
1. Help tenants create Meta Business accounts
2. Assist with verification process
3. Migrate Gupshup numbers to Meta (if possible)
4. Maintain Gupshup as fallback option

### Phase 3 (Enterprise, 12+ months): Hybrid

**Why hybrid:**
- Enterprise tenants get Meta Cloud API (lowest cost, full control)
- SMB tenants stay on Gupshup (simplicity)
- Some tenants bring their own Twilio/360dialog
- Platform supports multiple providers per tenant

## Implementation Priority

1. **Week 1**: Gupshup webhook handler + credential storage
2. **Week 2**: Template message support for follow-ups
3. **Week 3**: Message status tracking (sent/delivered/read)
4. **Week 4**: Media support (brochures, site visit photos)

## Technical Architecture

```
Inbound webhook (Gupshup/Meta)
  -> /webhooks/whatsapp/:tenantId
    -> verify signature
      -> normalize to internal message format
        -> store in messages table
          -> trigger agent processing
            -> agent generates response
              -> send via provider API
                -> log delivery status
```

## Key Implementation Files

| File | Purpose |
|------|---------|
| `src/enterprise/channels/whatsapp-router.ts` | Route webhooks by tenant |
| `src/enterprise/channels/gupshup-client.ts` | Gupshup API client |
| `src/enterprise/channels/meta-client.ts` | Meta Cloud API client |
| `src/enterprise/channels/whatsapp-normalizer.ts` | Normalize provider formats |
| `src/enterprise/channels/template-manager.ts` | Template registration/send |

## Risk: Meta Policy Changes

WhatsApp Business API policies change frequently. Mitigations:
- Abstract provider behind interface
- Support multiple providers from day one
- Monitor Meta developer blog for changes
- Maintain fallback to Telegram for critical communications

## Risk: Phone Number Portability

Tenants may want to keep their WhatsApp number if they leave. Plan:
- Document that tenant owns their phone number
- Support number migration between providers
- Allow tenant to export conversation history
