# Telegram Strategy Recommendation

## Verdict: Model A (One Bot Per Tenant) for All Tiers

### Why Not Model B (Shared Bot)?

1. **Rate limits** — 30 messages/sec globally shared across all tenants. A viral tenant could throttle everyone.
2. **Branding** — Real estate agencies want `@BandraEliteBot`, not `@OpenClawTeamBot`.
3. **Bot commands** — `/start`, `/help`, `/menu` are per-bot. Shared bot cannot have tenant-specific commands.
4. **Data isolation** — Routing by chat_id mapping has bug risk. Wrong tenant = leaked lead data.
5. **Operational complexity** — Two models is more code, more tests, more docs.

### Why Model A Works

1. **Setup is 5 minutes** — @BotFather is familiar to anyone who uses Telegram
2. **Tenant owns bot** — they can customize name, avatar, description
3. **Zero shared infrastructure risk** — one tenant's issues don't affect others
4. **Simple code path** — webhook URL contains tenant_id directly
5. **Migration is easy** — tenant takes their bot token if they leave

## Implementation

### Week 1: Basic Webhook

```
- Webhook endpoint: POST /webhooks/telegram/:tenantId
- Validate secret token
- Normalize Telegram update
- Store in messages table
- Route to agent
- Send reply
```

### Week 2: Bot Personality

```
- Tenant-configured welcome message
- Custom bot name in replies
- Office hours check
- Handoff to human keywords
```

### Week 3: Rich Features

```
- Inline keyboards (property listings, appointment slots)
- Reply keyboards (quick actions)
- Media handling (brochure PDFs, site photos)
- Location sharing (property map)
```

### Week 4: Advanced

```
- Broadcast messages (with tenant admin approval)
- Message templates
- Conversation tagging
- Analytics per bot
```

## File Structure

```
src/enterprise/channels/telegram/
  router.ts              # Webhook routing
  normalizer.ts          # Telegram -> internal format
  sender.ts              # Send messages via API
  client.ts              # Telegram API wrapper
  template-manager.ts    # Template registration
  polling-fallback.ts    # Polling mode for dev
```

## Cost

| Item | Cost |
|------|------|
| Telegram Bot API | Free |
| Webhook hosting | $0 (included in platform) |
| Bot creation | Free (@BotFather) |
| Messaging | Free (no limits from Telegram) |

Telegram is the cheapest channel to operate. Perfect for Community tier and testing.

## Migration from OpenClaw Telegram Extension

OpenClaw's `extensions/telegram/` uses `grammy` library. We can reuse:
- Message normalization logic
- Rate limiting (transformer-throttler)
- Markdown/HTML formatting
- Media download/upload

Changes needed:
- Remove global singleton bot
- Create per-tenant bot instances
- Add tenant_id to all storage calls
- Add webhook secret verification
