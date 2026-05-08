# WhatsApp Channel — Current State

## Extension: `extensions/whatsapp/`

WhatsApp integration uses the **Baileys** library — a pure-JavaScript WhatsApp Web API implementation (no official WhatsApp Business API required).

## Technology Stack

| Component | Technology |
|-----------|------------|
| Library | Baileys (`@whiskeysockets/baileys`) |
| Protocol | WhatsApp Web multi-device |
| Auth | QR code scan (pairing) |
| Connection | WebSocket to WhatsApp servers |
| Media | Direct download from WhatsApp CDN |

## Architecture

```
OpenClaw Gateway
  |
  v
WhatsApp Extension (extensions/whatsapp/src/)
  |
  +-- Baileys socket connection
  +-- QR code generation for auth
  +-- Message event listeners
  +-- Media download handlers
  +-- Send message API
  |
  v
WhatsApp Web servers (WebSocket)
```

## Authentication Flow

```
First start:
  1. Generate QR code (terminal output or control UI)
  2. User scans QR with WhatsApp mobile app
  3. Baileys establishes authenticated session
  4. Session credentials saved to ~/.openclaw/plugins/whatsapp/
  5. Auto-reconnect on restart (no QR needed)

Reconnection:
  1. Load saved credentials
  2. Reconnect to WhatsApp servers
  3. Restore session state
```

## Session Storage

```
~/.openclaw/plugins/whatsapp/
  +-- auth_info.json        → Baileys auth credentials
  +-- store.json            → Chat store (messages, contacts)
  +-- media/                → Downloaded media cache
```

## Message Normalization

Inbound WhatsApp messages normalized to `NormalizedMessage`:

```typescript
{
  id: message.key.id,
  channelId: "whatsapp",
  platform: "WhatsApp",
  senderId: message.key.remoteJid,
  senderName: contact?.name || contact?.notify,
  chatId: message.key.remoteJid,
  chatType: isGroup ? "group" : "dm",
  threadId: undefined,          // WhatsApp has threads via reply context
  replyTo: message.message?.extendedTextMessage?.contextInfo?.stanzaId,
  timestamp: new Date(message.messageTimestamp * 1000),
  content: {
    text: message.message?.conversation ||
          message.message?.extendedTextMessage?.text,
    media: message.message?.imageMessage ? [{
      type: "image",
      url: await downloadMedia(message.message.imageMessage),
      mimeType: message.message.imageMessage.mimetype,
    }] : undefined,
  },
  commands: detectCommands(text),  // !command or .command
  raw: message,
}
```

## Group Support

- Group JID format: `123456789@g.us`
- Bot responds in groups when mentioned or when configured to
- Session binding for groups: `channel+user` or `thread` (configurable)

## Media Handling

| Media Type | Baileys Type | Download |
|------------|-------------|----------|
| Image | `imageMessage` | Yes, via CDN |
| Video | `videoMessage` | Yes, via CDN |
| Audio | `audioMessage` | Yes, via CDN |
| Document | `documentMessage` | Yes, via CDN |
| Sticker | `stickerMessage` | Yes, via CDN |
| Voice | `audioMessage` (ptt: true) | Yes, via CDN |

Media downloaded to `~/.openclaw/media/` with content-hash filename.

## Status / Presence

- Online/offline presence managed by Baileys
- Read receipts (blue ticks) not sent by default (privacy)
- Typing indicator shown while agent generates reply (optional)

## Limitations

1. **No official API** — Uses WhatsApp Web protocol, may break with WhatsApp updates
2. **Phone must stay online** — If phone disconnects, Baileys loses connection
3. **Rate limits** — WhatsApp may throttle or ban for excessive messaging
4. **Multi-device required** — Must enable multi-device on phone
5. **No business features** — No catalog, payments, templates

## Configuration

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "sessionBinding": "user",
      "autoReply": true,
      "showTyping": true,
      "maxMediaSize": 52428800,     // 50MB
      "downloadMedia": true,
      "commandPrefix": ["!", "."]
    }
  }
}
```

## Key Files

- `extensions/whatsapp/src/` — WhatsApp extension source
- `extensions/whatsapp/package.json` — Baileys dependency
- `src/channels/message-normalization.ts` — Generic normalization
- `src/channels/outbound-messaging.ts` — Generic outbound

---

*Evidence: `extensions/whatsapp/` directory, Baileys library architecture, `README.md` channel list, `src/channels/` patterns.*
