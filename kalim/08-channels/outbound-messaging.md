# Outbound Messaging

## Architecture

Outbound messages flow from the agent runtime back to the originating channel (or other channels). The gateway's channel manager dispatches replies through the appropriate channel extension.

```
Agent generates reply
  |
  v
Outbound messaging system
  |
  +-- Determine target channel (same as inbound, or cross-post)
  +-- Format content for channel
  +-- Handle media (upload if needed)
  +-- Apply rate limiting
  +-- Send via channel API
  |
  v
Channel extension API call
```

## Outbound Message Format

From `src/channels/outbound-messaging.ts` (inferred):

```typescript
type OutboundMessage = {
  // Target
  channelId: string;
  chatId: string;
  threadId?: string;
  replyTo?: string;             // Reply to specific message ID

  // Content
  text?: string;
  html?: string;
  markdown?: string;

  // Media
  media?: Array<{
    type: "image" | "audio" | "video" | "file" | "sticker";
    path: string;               // Local file path
    mimeType?: string;
    caption?: string;
  }>;

  // Formatting
  parseMode?: "plain" | "markdown" | "html";
  buttons?: Array<{
    text: string;
    url?: string;
    callbackData?: string;
  }>;

  // Metadata
  typing?: boolean;             // Show typing indicator before sending
  silent?: boolean;             // Send without notification sound
  pin?: boolean;                // Pin the message
  ttl?: number;                 // Time-to-live in seconds
};
```

## Channel-Specific Formatting

Each channel extension denormalizes the outbound message:

### Telegram

```typescript
// Bot API sendMessage / sendPhoto / sendDocument
telegramApi.sendMessage({
  chat_id: outbound.chatId,
  text: outbound.text,
  reply_to_message_id: outbound.replyTo,
  parse_mode: outbound.parseMode === "markdown" ? "MarkdownV2" : undefined,
  // ...
});
```

### WhatsApp (Baileys)

```typescript
// Baileys sendMessage
sock.sendMessage(outbound.chatId, {
  text: outbound.text,
  // Media via buffer upload
});
```

### Discord

```typescript
// Discord.js send
channel.send({
  content: outbound.text,
  embeds: [...],
  files: outbound.media?.map(m => m.path),
  reply: { messageReference: outbound.replyTo },
});
```

### Slack

```typescript
// Slack Web API
slackClient.chat.postMessage({
  channel: outbound.chatId,
  text: outbound.text,
  thread_ts: outbound.threadId,
  blocks: [...],  // Block Kit formatting
});
```

## Media Upload Flow

```
Agent generates image (DALL-E, etc.)
  |
  v
Save to ~/.openclaw/media/{hash}.png
  |
  v
Outbound message includes local path
  |
  v
Channel extension uploads media
  +-- Telegram: multipart/form-data to Bot API
  +-- Discord: attach files to message
  +-- Slack: files.upload API
  +-- WhatsApp: buffer via Baileys
  |
  v
Message sent with media reference
```

## Rate Limiting

Outbound rate limits are channel-specific:

| Channel | Rate Limit | Source |
|---------|-----------|--------|
| Telegram | ~30 msg/sec per bot | Bot API docs |
| Discord | 5 msg/sec per channel | Discord API |
| Slack | Tier-based | Slack API tiers |
| WhatsApp | No hard limit | Baileys (server-side may throttle) |

OpenClaw may implement per-channel outbound queues to respect limits.

## Cross-Channel Messaging

Agents can send messages to channels different from the inbound channel:

```typescript
// Agent tool call: send_message
{
  channel: "telegram",
  chatId: "123456789",
  text: "Alert from your agent!"
}
```

This requires the target channel to be enabled and configured.

## Typing Indicators

Some channels support typing indicators:

| Channel | Typing Indicator | API |
|---------|-----------------|-----|
| Telegram | Yes | `sendChatAction` (typing) |
| Discord | Yes | `channel.sendTyping()` |
| Slack | No | — |
| WhatsApp | Yes | Presence update |

OpenClaw may show typing while the agent is generating a response.

## Message Splitting

Long messages are split for channels with length limits:

| Channel | Max Length | Split Strategy |
|---------|-----------|---------------|
| Telegram | 4096 chars | Split by paragraph, add continuation marker |
| Discord | 2000 chars | Split by paragraph |
| WhatsApp | ~65,536 chars | Usually no split needed |
| Slack | 40,000 chars | Usually no split needed |

## Error Handling

```
Send attempt
  |
  v
Success → done
  |
  v
Failure → retry (exponential backoff)
  |
  v
Max retries exceeded → log error, notify admin
```

Errors logged to diagnostic system. Some channels support message edit to fix.

## Key Files

- `src/channels/outbound-messaging.ts` — Core outbound dispatch
- `src/channels/message-normalization.ts` — Format conversion
- `src/gateway/server-channels.ts` — Channel manager routing
- `extensions/*/src/` — Per-channel send implementation
- `src/media/` — Media upload helpers

---

*Evidence: `src/channels/outbound-messaging.ts`, `src/channels/message-normalization.ts`, `src/gateway/server-channels.ts`, `src/media/`, extension architecture inference.*
