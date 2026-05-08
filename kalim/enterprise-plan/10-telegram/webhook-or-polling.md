# Telegram — Webhook vs Polling

## Purpose
How Telegram bot receives updates.

## Findings

### Two Modes Supported

1. **Polling Mode** (default)
   - Grammy `bot.start()` with long polling
   - Continuously fetches updates from Telegram servers
   - No external URL needed
   - Works behind NAT/firewall
   - Offset tracked in memory (resumes on restart)

2. **Webhook Mode**
   - Gateway exposes webhook endpoint: `/hooks/telegram/*`
   - Telegram servers push updates to this URL
   - Requires public gateway URL or reverse proxy
   - Better for high-traffic bots
   - Lower latency

### Polling Flow

```
Grammy Bot API client
  -> getUpdates(offset, limit=100)
    -> Telegram servers
      <- update array (messages, callbacks, etc.)
    -> Grammy dispatcher
      -> extensions/telegram/src/channel.ts (update handler)
        -> normalize to ChannelMessageEnvelope
          -> OpenClaw agent pipeline
```

### Webhook Flow

```
Telegram server sends HTTP POST
  -> Gateway /hooks/telegram/ (plugin route)
    -> extensions/telegram/src/webhook.ts
      -> Grammy webhook adapter
        -> update dispatcher
          -> channel.ts update handler
            -> normalize to ChannelMessageEnvelope
              -> OpenClaw agent pipeline
```

### Webhook Configuration

- Webhook URL auto-configured from gateway bind address
- Telegram `setWebhook()` called on channel activation
- `drop_pending_updates` option on reconfigure
- Secret token not used (relies on gateway auth / obscurity)

### Rate Limiting

- `@grammyjs/transformer-throttler` applies per-method limits
- Telegram global limits: 30 messages/second
- Group limits: 20 messages/minute
- Flood wait errors handled gracefully

## Evidence
- `extensions/telegram/src/channel.ts` — mode selection
- `extensions/telegram/src/webhook.ts` — webhook handler
- `@grammyjs/runner` — concurrent update processing
- `@grammyjs/transformer-throttler` — rate limiting

## Notes
- Polling is default for local development
- Webhook preferred for production / Docker deployments
- Webhook requires HTTPS (Telegram requirement)
- Polling works fine for personal/low-traffic bots
- Mode auto-selected based on gateway bind configuration
