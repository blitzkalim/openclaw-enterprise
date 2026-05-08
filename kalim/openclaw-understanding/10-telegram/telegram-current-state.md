# Telegram Channel — Current State

## Extension: `extensions/telegram/`

Telegram integration uses the **Telegram Bot API** — official HTTP-based API for bot development.

## Technology Stack

| Component | Technology |
|-----------|------------|
| API | Telegram Bot API (https://api.telegram.org) |
| Library | Likely `node-telegram-bot-api` or custom fetch |
| Protocol | HTTPS (REST) |
| Auth | Bot Token (`TELEGRAM_BOT_TOKEN` or `channels.telegram.botToken`) |
| Update Mode | Webhook or Long Polling |
| Media | Download via `getFile` API |

## Architecture

```
OpenClaw Gateway
  |
  v
Telegram Extension (extensions/telegram/src/)
  |
  +-- Bot API HTTP client
  +-- Webhook handler OR polling loop
  +-- Message event processing
  +-- Media download via getFile
  +-- Send message API
  |
  v
Telegram Bot API (HTTPS)
```

## Authentication

### Bot Token

```
Format: {numbers}:{alphanumeric_string}
Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

- Obtained from @BotFather on Telegram
- Stored in config: `channels.telegram.botToken` or env: `TELEGRAM_BOT_TOKEN`
- Passed as query parameter in all API requests: `?bot_token=...`

### Configuration

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "{env:TELEGRAM_BOT_TOKEN}",
      "webhookUrl": "https://mydomain.com/webhook/telegram",
      "sessionBinding": "user",
      "autoReply": true,
      "showTyping": true,
      "commandPrefix": "/",
      "allowedChats": [],
      "blockedChats": []
    }
  }
}
```

## Update Modes

### 1. Webhook Mode (Production)

```
Telegram Server
  |
  v
POST https://mydomain.com/webhook/telegram
  (with X-Telegram-Bot-Api-Secret-Token header)
  |
  v
OpenClaw Gateway webhook handler
  |
  v
Telegram Extension
```

Setup:
```
1. Configure webhookUrl in config
2. Gateway starts, webhook route registered
3. Extension calls setWebhook({ url, secret_token })
4. Telegram sends updates to webhook URL
```

### 2. Long Polling Mode (Development / No Public URL)

```
Telegram Extension
  |
  +-- Every N seconds: getUpdates({ offset, limit, timeout })
  +-- Process returned updates
  +-- Increment offset
  +-- Repeat
```

Setup:
```
1. No webhookUrl configured (or empty)
2. Extension starts polling loop
3. getUpdates returns new messages
4. Process and acknowledge
```

## Message Normalization

Inbound Telegram messages normalized to `NormalizedMessage`:

```typescript
{
  id: String(update.message.message_id),
  channelId: "telegram",
  platform: "Telegram",
  senderId: String(update.message.from.id),
  senderName: [update.message.from.first_name, update.message.from.last_name].filter(Boolean).join(" "),
  senderUsername: update.message.from.username,
  chatId: String(update.message.chat.id),
  chatName: update.message.chat.title || update.message.from.first_name,
  chatType: mapChatType(update.message.chat.type), // private, group, supergroup, channel
  threadId: update.message.message_thread_id ? String(update.message.message_thread_id) : undefined,
  replyTo: update.message.reply_to_message ? String(update.message.reply_to_message.message_id) : undefined,
  timestamp: new Date(update.message.date * 1000),
  content: {
    text: update.message.text || update.message.caption,
    media: update.message.photo ? [{
      type: "image",
      url: await downloadTelegramFile(update.message.photo.pop().file_id),
      mimeType: "image/jpeg",
    }] : undefined,
  },
  commands: update.message.entities
    ?.filter(e => e.type === "bot_command")
    .map(e => ({
      name: update.message.text.slice(e.offset + 1, e.offset + e.length).split("@")[0],
      args: update.message.text.slice(e.offset + e.length).trim().split(/\s+/),
      botCommand: true,
      fullText: update.message.text.slice(e.offset),
    })),
  raw: update,
}
```

## Chat Type Mapping

| Telegram Type | OpenClaw chatType |
|--------------|-------------------|
| `private` | `dm` |
| `group` | `group` |
| `supergroup` | `group` |
| `channel` | `channel` |

## Command Detection

Telegram bot commands are detected via `message.entities`:

```typescript
// "/start arg1 arg2"
// entity: { type: "bot_command", offset: 0, length: 6 }
// name: "start"
// args: ["arg1", "arg2"]
// fullText: "/start arg1 arg2"
```

Commands with bot username (e.g., `/start@mybot`) are stripped:
```typescript
name = commandText.split("@")[0]; // "start"
```

## Media Handling

### Inbound Media Download

```typescript
// Telegram getFile → download
const fileResponse = await telegramApi.getFile({ file_id: photo.file_id });
const fileUrl = `https://api.telegram.org/file/bot${token}/${fileResponse.file_path}`;
const buffer = await fetch(fileUrl).then(r => r.arrayBuffer());
await fs.writeFile(`~/.openclaw/media/${hash}.jpg`, buffer);
```

### Supported Media Types

| Telegram Type | Bot API Field | Download | Agent Use |
|--------------|---------------|----------|-----------|
| Photo | `photo` array | getFile | Vision models |
| Video | `video` | getFile | Video understanding |
| Audio | `audio` | getFile | STT, music |
| Voice | `voice` | getFile | STT (primary use) |
| Document | `document` | getFile | File read, text extraction |
| Sticker | `sticker` | getFile | Image processing |
| Location | `location` | N/A | Location context |
| Contact | `contact` | N/A | Contact card |
| Animation (GIF) | `animation` | getFile | Video/GIF understanding |

## Outbound Messaging

```typescript
// Text message
telegramApi.sendMessage({
  chat_id: chatId,
  text: text,
  reply_to_message_id: replyTo,
  parse_mode: parseMode, // MarkdownV2, HTML, or undefined
  reply_markup: buttons,  // Inline keyboard
});

// Media message
telegramApi.sendPhoto({
  chat_id: chatId,
  photo: fs.createReadStream(imagePath),
  caption: text,
  reply_to_message_id: replyTo,
});
```

## Message Splitting

Telegram message limit: 4096 characters

```typescript
function splitTelegramMessage(text: string): string[] {
  if (text.length <= 4096) return [text];

  const chunks = [];
  let current = "";
  for (const paragraph of text.split("\n\n")) {
    if (current.length + paragraph.length + 2 > 4096) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
```

Chunks sent as separate messages with continuation markers (e.g., "... (1/3)").

## Typing Indicator

```typescript
// Show typing while agent generates response
telegramApi.sendChatAction({
  chat_id: chatId,
  action: "typing",
});
```

Sent before processing. Auto-stops when message is sent.

## Group / Supergroup Behavior

- Bot must be added to group by admin
- In groups, bot only responds when:
  - Mentioned (`@botname`)
  - Reply to bot's message
  - Message starts with command (`/command`)
  - Configured to respond to all messages (not recommended)
- Session binding in groups: `user` (DM-like per user) or `thread` or `channel+user`

## Channel Support

- Bot can be added to channels as admin
- Receives messages posted in channel
- Can post messages to channel
- Cannot see channel members

## Inline Mode (Optional)

Telegram bots can support inline mode (typing `@botname query` in any chat):
- Not observed in core
- Extension-specific feature if implemented

## Webhook Security

```typescript
// Telegram webhook handler verifies:
if (req.headers["x-telegram-bot-api-secret-token"] !== configSecretToken) {
  return 403;
}
```

- Optional secret token configured in setWebhook call
- Prevents spoofed webhook requests
- If not configured: webhook open to anyone who knows URL (risk)

## Key Files

- `extensions/telegram/src/` — Telegram extension source
- `extensions/telegram/package.json` — Dependencies
- `src/channels/webhook-router.ts` — Webhook dispatch
- `src/channels/message-normalization.ts` — Generic normalization
- `src/channels/outbound-messaging.ts` — Generic outbound

---

*Evidence: Telegram Bot API documentation, `extensions/telegram/` architecture, `src/channels/` patterns, `.env.example` (TELEGRAM_BOT_TOKEN).*
