# Telegram Webhook vs Polling

## Two Update Reception Modes

Telegram Bot API offers two ways to receive updates. OpenClaw supports both, configurable per deployment.

## Webhook Mode

### Architecture

```
Telegram Servers
  |
  v
HTTPS POST to configured webhookUrl
  |
  v
OpenClaw Gateway (/webhook/telegram)
  |
  v
Telegram Extension handler
  |
  v
Normalize message → Agent → Reply
  |
  v
Telegram API (sendMessage)
  |
  v
Telegram Servers → Recipient
```

### Setup Flow

```typescript
// On channel start:
await telegramApi.setWebhook({
  url: `${config.webhookUrl}/webhook/telegram`,
  secret_token: config.webhookSecret,  // optional but recommended
  max_connections: 40,
  allowed_updates: ["message", "edited_message", "callback_query"],
});
```

### Webhook Handler

```typescript
// src/channels/webhook-router.ts → telegram handler
async function handleTelegramWebhook(req, res) {
  // 1. Verify secret token (if configured)
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (config.webhookSecret && secret !== config.webhookSecret) {
    return res.status(403).send("Invalid secret");
  }

  // 2. Parse update
  const update = req.body;

  // 3. Process update
  await processTelegramUpdate(update);

  // 4. Acknowledge quickly (Telegram expects <30s response)
  res.status(200).send("OK");
}
```

### Pros

- **Real-time** — Messages received instantly
- **Efficient** — No polling overhead
- **Scalable** — Multiple connections allowed (up to 40)
- **Webhook secret** — Can validate sender

### Cons

- **Requires public URL** — Must expose gateway to internet
- **TLS required** — Telegram only sends to HTTPS
- **Reverse proxy needed** — For domain + TLS
- **Webhook setup** — Must call setWebhook on start
- **Update loss risk** — If server down during Telegram retry window

### Configuration

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "...",
      "webhookUrl": "https://mybot.example.com",
      "webhookSecret": "{env:TELEGRAM_WEBHOOK_SECRET}",
      "maxConnections": 40
    }
  }
}
```

## Long Polling Mode

### Architecture

```
Telegram Extension
  |
  +-- Loop:
  |     getUpdates({ offset, limit: 100, timeout: 30 })
  |     |
  |     v
  |     Telegram API (HTTPS)
  |     |
  |     v
  |     Returns updates (or empty after timeout)
  |     |
  |     v
  |     Process updates
  |     |
  |     offset = last_update_id + 1
  |     |
  |     Repeat
  |
  v
Normalize message → Agent → Reply
```

### Setup Flow

```typescript
// On channel start:
await telegramApi.deleteWebhook({ drop_pending_updates: true });
// Or simply don't call setWebhook

// Start polling loop
startPollingLoop({
  offset: loadLastOffset(),  // from persistent storage
  limit: 100,
  timeout: 30,  // seconds
});
```

### Polling Loop

```typescript
async function pollingLoop() {
  while (running) {
    try {
      const updates = await telegramApi.getUpdates({
        offset: currentOffset,
        limit: 100,
        timeout: 30,
      });

      for (const update of updates) {
        currentOffset = update.update_id + 1;
        await processTelegramUpdate(update);
      }

      // Persist offset for crash recovery
      await saveLastOffset(currentOffset);
    } catch (err) {
      log.error("Polling error", err);
      await sleep(5000);  // Backoff on error
    }
  }
}
```

### Pros

- **No public URL needed** — Works behind NAT, firewall
- **Simple setup** — No reverse proxy, no TLS cert
- **Development-friendly** — Works on localhost
- **No message loss** — Offset tracking ensures all updates processed

### Cons

- **Latency** — Up to timeout seconds (default 30s)
- **Overhead** — Constant HTTP requests even when idle
- **Not scalable** — Single polling connection per bot
- **Offset management** — Must persist offset across restarts

### Configuration

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "...",
      // No webhookUrl configured → auto polling
      "pollTimeout": 30,
      "pollLimit": 100
    }
  }
}
```

## Mode Selection Logic

```typescript
// extensions/telegram/src/ startup (inferred)
async function start() {
  if (config.webhookUrl) {
    await setupWebhook();
  } else {
    await deleteWebhook();
    startPollingLoop();
  }
}
```

Auto-detection: if `webhookUrl` is configured, use webhook; otherwise polling.

## Update Types Processed

```typescript
// Common update types
interface Update {
  update_id: number;
  message?: Message;              // New message
  edited_message?: Message;       // Edited message
  channel_post?: Message;         // Channel post
  edited_channel_post?: Message;  // Edited channel post
  callback_query?: CallbackQuery; // Inline button click
  inline_query?: InlineQuery;     // Inline query (@bot query)
  poll?: Poll;                    // Poll update
  poll_answer?: PollAnswer;       // Poll answer
  my_chat_member?: ChatMemberUpdated;  // Bot membership change
  chat_member?: ChatMemberUpdated;     // Member change
}
```

OpenClaw primarily processes `message` and `edited_message`. Other types may be handled by extension or ignored.

## Concurrent Processing

| Mode | Concurrent Updates | Strategy |
|------|-------------------|----------|
| Webhook | Multiple | Async processing, quick 200 response |
| Polling | Sequential | Process all returned updates in batch |

Webhook mode should respond within 30 seconds to Telegram. Long-running agent processing should be async (respond 200 immediately, process in background).

## Failure Recovery

### Webhook

```
Server down
  |
  v
Telegram retries (exponential backoff)
  |
  v
Server back up
  |
  v
Webhook auto-resumes (Telegram resends)
  |
  v
BUT: Updates may be lost if retry window exceeded
```

### Polling

```
Server crashes
  |
  v
Restart
  |
  v
Load last persisted offset
  |
  v
Resume from last processed update
  |
  v
No updates lost (if offset persisted)
```

## Key Files

- `extensions/telegram/src/` — Telegram extension startup
- `src/channels/webhook-router.ts` — Webhook dispatch
- `src/gateway/server-channels.ts` — Channel lifecycle

---

*Evidence: Telegram Bot API documentation, `extensions/telegram/` architecture, `src/channels/webhook-router.ts`, `src/gateway/server-channels.ts`.*
