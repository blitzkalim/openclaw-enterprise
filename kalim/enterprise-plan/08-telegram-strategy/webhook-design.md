# Telegram Webhook Design

## Webhook Endpoint

```
POST /webhooks/telegram/:tenantId

For shared bot model:
POST /webhooks/telegram/shared
  -> route by chat_id -> tenant_id
```

## Security

### Bot Token Verification

Telegram webhooks don't have signatures. We verify by:
1. Webhook URL is secret (contains tenant UUID)
2. IP allowlist (Telegram API IPs)
3. Rate limiting per endpoint

```typescript
const TELEGRAM_IP_RANGES = [
  '149.154.160.0/20',
  '91.108.4.0/22',
];

function isTelegramIp(ip: string): boolean {
  return TELEGRAM_IP_RANGES.some(range => ipInCidr(ip, range));
}
```

### Shared Bot Additional Protection

```typescript
// For shared bot: validate update comes from known chat
async function validateSharedWebhook(update: TelegramUpdate) {
  const chatId = update.message?.chat.id || update.callback_query?.from.id;
  if (!chatId) throw new ValidationError();

  const tenantId = await redis.get(`telegram:chat:${chatId}:tenant`);
  if (!tenantId) {
    // New chat — only allow /start command
    if (!update.message?.text?.startsWith('/start')) {
      throw new UnauthorizedError();
    }
  }
}
```

## Webhook Registration

### Per-Tenant Bot (Model A)

```typescript
async function registerWebhook(tenantId: string, token: string) {
  const webhookUrl = `${process.env.PLATFORM_URL}/webhooks/telegram/${tenantId}`;

  await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query', 'edited_message'],
      secret_token: generateWebhookSecret(),
    }),
  });
}
```

### Shared Bot (Model B)

```typescript
// One-time setup
async function registerSharedWebhook() {
  await fetch(`https://api.telegram.org/bot${SHARED_TOKEN}/setWebhook`, {
    method: 'POST',
    body: JSON.stringify({
      url: `${process.env.PLATFORM_URL}/webhooks/telegram/shared`,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
}
```

## Message Processing Pipeline

```
Webhook received
  -> validate source (IP, rate limit)
    -> normalize Telegram update to internal message format
      -> resolve tenant (from URL path or chat mapping)
        -> store raw update (for replay/debug)
          -> enrich with contact profile
            -> apply tenant-specific bot config (personality, office hours)
              -> check if during office hours
                -> if after hours -> send auto-reply
                  -> if office hours -> queue for agent processing
                    -> agent generates response
                      -> format reply for Telegram (Markdown V2)
                        -> send via Telegram API
                          -> log delivery status
                            -> update conversation in dashboard
```

## Update Types Handled

| Type | Action |
|------|--------|
| `message` | Process as new message |
| `edited_message` | Update existing message, re-process if needed |
| `callback_query` | Handle button clicks (inline keyboards) |
| `channel_post` | Optional: support channel announcements |

## Rate Limiting

| Action | Limit | Strategy |
|--------|-------|----------|
| Incoming webhooks | 100/sec per tenant | Queue, don't drop |
| Outgoing messages | 30/sec per bot | Token bucket per bot |
| Bulk sends | 30/sec global | Queue with backoff |
| Media uploads | 20MB max | Reject with clear error |

## Webhook Secret Token

Telegram supports `secret_token` in webhook config. We should use it:

```typescript
// In webhook handler
const secret = req.headers['x-telegram-bot-api-secret-token'];
if (secret !== expectedSecret) {
  return res.status(403).send('Invalid secret');
}
```

## Fallback: Polling Mode

If webhooks fail (firewall, local dev), support polling:

```typescript
// For development or when webhooks unavailable
async function startPolling(tenantId: string, token: string) {
  let offset = 0;
  while (true) {
    const updates = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}`);
    for (const update of updates.result) {
      await processUpdate(tenantId, update);
      offset = update.update_id + 1;
    }
    await sleep(1000);
  }
}
```

Polling should only be used for:
- Local development
- Single-tenant Community edition
- Emergency fallback if webhooks down

## Error Handling

```typescript
async function handleTelegramWebhook(req, res) {
  try {
    const update = req.body;
    await processUpdate(req.params.tenantId, update);
    res.status(200).send('OK');
  } catch (error) {
    // Always return 200 to Telegram, or they'll retry
    logger.error('Telegram webhook error', { error, tenantId: req.params.tenantId });
    res.status(200).send('OK');

    // Alert tenant admin if persistent errors
    await alertTenantAdmin(req.params.tenantId, 'Telegram bot error');
  }
}
```
