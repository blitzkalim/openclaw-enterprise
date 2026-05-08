# Telegram Multi-Tenant Models

## Current State (OpenClaw)

- Single bot token (`TELEGRAM_BOT_TOKEN`)
- Bot handles all incoming messages
- `allowFrom` config controls who can chat
- No concept of tenant or workspace

## Model A: One Bot Per Tenant (Recommended)

### Architecture

Each tenant creates their own Telegram bot via @BotFather and connects it.

```
Tenant A (Bandra Brokers)
  -> Bot: @BandraBrokersBot (token: 123:ABC)
    -> webhook: /webhooks/telegram/tenant-a-uuid
      -> handles all Tenant A messages

Tenant B (Andheri Properties)
  -> Bot: @AndheriPropBot (token: 456:DEF)
    -> webhook: /webhooks/telegram/tenant-b-uuid
      -> handles all Tenant B messages
```

### Pros
- Natural isolation — bots are independent
- Tenant owns their bot identity
- No shared rate limits between tenants
- Each bot has its own name/avatar/personality
- Easy to migrate (tenant takes bot with them)

### Cons
- Tenant must create bot via @BotFather (manual step)
- Each bot needs webhook registration
- More webhook URLs to manage
- Cannot easily share infrastructure costs

### Onboarding Flow

```
Tenant Admin opens Settings -> Channels -> Telegram
  -> sees: "Create a bot with @BotFather"
    -> instructions with screenshots
      -> paste bot token
        -> platform validates token with getMe()
          -> registers webhook automatically
            -> "Bot connected! Test it now."
```

## Model B: Shared Bot (Single Bot, Multi-Tenant)

### Architecture

One platform bot handles all tenants. Messages routed by command or context.

```
@OpenClawTeamBot (single bot)
  -> User sends: "/start bandra-brokers"
    -> Bot maps "bandra-brokers" -> tenant_id
      -> all future messages from this chat_id -> tenant A

  -> OR: User starts with tenant-specific deep link
    -> https://t.me/OpenClawTeamBot?start=tenant_a_uuid
```

### Pros
- Zero setup for tenant (we manage bot)
- Unified brand (@OpenClawTeamBot)
- Single webhook endpoint
- Easier for tenants who don't understand bots

### Cons
- **Rate limits shared** across all tenants (30 msgs/sec globally)
- Bot personality is generic, not branded
- If bot banned, all tenants affected
- Complex routing logic required
- Cannot use per-tenant bot features (commands, menus)
- Data isolation risk if routing bug

### Routing Logic

```typescript
// src/enterprise/channels/telegram-shared-router.ts
async function routeMessage(update: TelegramUpdate): Promise<TenantContext> {
  const chatId = update.message.chat.id;

  // Check if chat is already mapped
  const mapping = await redis.get(`telegram:chat:${chatId}:tenant`);
  if (mapping) {
    return { tenantId: mapping };
  }

  // New chat — check for /start command with tenant parameter
  if (update.message.text?.startsWith('/start ')) {
    const tenantSlug = update.message.text.split(' ')[1];
    const tenant = await db('tenants').where('slug', tenantSlug).first();
    if (tenant) {
      await redis.setex(`telegram:chat:${chatId}:tenant`, 86400 * 30, tenant.id);
      return { tenantId: tenant.id };
    }
  }

  // Unknown — send help message
  await sendMessage(chatId, "Please start with /start <your-agency-name>");
  throw new UnknownTenantError();
}
```

## Model C: Hybrid (Default Shared + Premium Dedicated)

### Architecture

- Free/Pro tenants: Shared bot (Model B)
- Enterprise tenants: Dedicated bot (Model A)

### Implementation

```typescript
async function getBotConfig(tenantId: string) {
  const tenant = await db('tenants').where('id', tenantId).first();

  if (tenant.plan === 'enterprise') {
    // Dedicated bot
    const connection = await db('channel_connections')
      .where({ tenant_id: tenantId, channel_type: 'telegram' })
      .first();
    return { token: decrypt(connection.credentials.token), dedicated: true };
  }

  // Shared bot
  return { token: process.env.SHARED_TELEGRAM_BOT_TOKEN, dedicated: false };
}
```

### Pros
- Free tier has zero friction
- Premium tier gets branded experience
- Revenue aligns with infrastructure cost
- Natural upgrade path

### Cons
- Two code paths to maintain
- Shared bot rate limits still constrain free tier
- More complex to explain to users

## Comparison

| Criteria | Model A (Per-Tenant) | Model B (Shared) | Model C (Hybrid) |
|----------|:--------------------:|:----------------:|:----------------:|
| Setup friction | Medium | Low | Low for free, Medium for paid |
| Tenant branding | ✅ | ❌ | ✅ for paid |
| Rate limit isolation | ✅ | ❌ | Partial |
| Operational complexity | Medium | Low | High |
| Migration ease | ✅ | ❌ | Partial |
| Cost per tenant | $0 | Shared | $0 / $0 |
| Data isolation risk | Low | Medium | Medium |
| Best for | Pro/Enterprise | Community | All tiers |

## Recommendation: Model A for Pro/Enterprise, Model C overall

### Phase 1 (MVP)
- Implement Model A (one bot per tenant)
- Simple, safe, clean
- Real estate agencies want their own branded bot anyway

### Phase 2 (Scale)
- Add Model B for Community tier
- Reduce operational overhead for free users
- Or skip Community Telegram entirely (Community = file-based single user)

### Phase 3 (Optimize)
- Hybrid Model C
- Enterprise gets dedicated bot
- Pro/Starter can choose (dedicated bot = +$10/month)
