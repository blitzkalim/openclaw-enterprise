# Supported Channels

## Official Channels (from README.md and extensions/)

| Channel | Extension | Protocol | Inbound | Outbound | Webhook | Notes |
|---------|-----------|----------|---------|----------|---------|-------|
| WhatsApp | `extensions/whatsapp/` | Baileys (WebSocket) | Yes | Yes | No | End-to-end encrypted, group support |
| Telegram | `extensions/telegram/` | Bot API (HTTP/WS) | Yes | Yes | Yes | Bot API, supergroup support |
| Discord | `extensions/discord/` | Discord Gateway (WS) | Yes | Yes | No | Bot token, guild/channel/role |
| Slack | `extensions/slack/` | Events API (HTTP) | Yes | Yes | Yes | Socket Mode alternative |
| Signal | `extensions/signal/` | signald / CLI | Yes | Yes | No | Desktop bridge required |
| iMessage | `extensions/imessage/` | macOS private API | Yes | Yes | No | macOS only, BlueBubbles bridge |
| Google Chat | `extensions/googlechat/` | Bot API (HTTP) | Yes | Yes | Yes | Workspace/Google Chat |
| MS Teams | `extensions/msteams/` | Bot Framework (HTTP) | Yes | Yes | Yes | Azure AD auth |
| Matrix | `extensions/matrix/` | Matrix Client-Server API | Yes | Yes | No | Homeserver, encryption optional |
| LINE | `extensions/line/` | Messaging API (HTTP) | Yes | Yes | Yes | LINE official account |
| Zalo | `extensions/zalo/` | Zalo OA API (HTTP) | Yes | Yes | Yes | Zalo Official Account |
| Feishu / Lark | `extensions/feishu/` | Bot API (HTTP) | Yes | Yes | Yes | ByteDance enterprise |
| Mattermost | `extensions/mattermost/` | API + WebSocket | Yes | Yes | Yes | Self-hosted or cloud |
| IRC | `extensions/irc/` | IRC protocol (TCP) | Yes | Yes | No | Traditional IRC |
| Nostr | `extensions/nostr/` | Nostr protocol (WS) | Yes | Yes | No | Decentralized, relay-based |
| Twitch | `extensions/twitch/` | IRC + EventSub (WS/HTTP) | Yes | Yes | Yes | Chat + channel events |
| Nextcloud Talk | `extensions/nextcloud-talk/` | Talk API (HTTP) | Yes | Yes | Yes | Self-hosted Nextcloud |
| QQ Bot | `extensions/qqbot/` | QQ Bot API (HTTP/WS) | Yes | Yes | Yes | Tencent QQ |
| Webhooks | `extensions/webhooks/` | Generic HTTP POST | Yes | Yes | Yes | User-configurable endpoints |

## Inferred Additional Channels (from extension directory listing)

| Channel | Extension | Protocol | Notes |
|---------|-----------|----------|-------|
| BlueBubbles | `extensions/bluebubbles/` | HTTP | iMessage bridge for non-macOS |
| WeChat | Inferred from ecosystem | — | Common request, may exist or be planned |
| Facebook Messenger | Inferred from ecosystem | — | Common request |
| Instagram | Inferred from ecosystem | — | Common request |
| Twitter/X DM | Inferred from ecosystem | — | Common request |
| SMS | `extensions/sms/` or native | — | Android via system API |
| Email (IMAP/SMTP) | Inferred from ecosystem | — | Common request |
| RSS/Atom | Inferred | — | Feed ingestion |

## Channel Architecture

All channels follow a common pattern:

```
Channel Extension
  |
  +-- Channel Runtime (implements ChannelRuntime interface)
  |     +-- start(): Connect to channel API
  |     +-- stop(): Disconnect, cleanup
  |     +-- sendMessage(): Outbound message dispatch
  |     +-- onMessage(): Inbound message handler
  |
  +-- Message Normalization (to internal format)
  +-- Webhook Handler (for HTTP-based channels)
  +-- Session Binding (how sessions map to conversations)
```

## Channel Activation

Channels are activated by:
1. Installing the extension (built-in or npm install)
2. Enabling in config: `channels.{id}.enabled: true`
3. Providing required credentials (bot token, API key, etc.)
4. Gateway auto-detects and starts on startup (or via `channel_start` method)

## Session Binding Modes

From `src/channels/message-normalization.ts` and `src/config/sessions.ts`:

| Mode | Description | Best For |
|------|-------------|----------|
| `channel` | One session per channel | Broadcast channels, simple bots |
| `user` | One session per user | DM-only bots, personal assistant |
| `thread` | One session per thread | Group chats, threaded channels |
| `channel+user` | One session per channel+user combo | Multi-user group bots |

Per-channel configuration:
```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "sessionBinding": "user"
    },
    "slack": {
      "enabled": true,
      "sessionBinding": "thread"
    }
  }
}
```

## Channel Health

From `src/gateway/server-channels.ts`:

Each channel reports readiness:
```
channel.ready → true/false
channel.error → last error message
channel.lastActivity → timestamp
```

Gateway readiness (`/readiness`) aggregates all channel readiness states.

## Channel Auto-Reply

From `src/auto-reply/`:

```
Inbound message
  |
  v
Auto-reply dispatcher
  |
  +-- Deduplication (prevent double-reply)
  +-- Rate limiting (per-channel)
  +-- Command routing (if message starts with /)
  +-- Agent dispatch (if not a command)
```

## Key Files

- `src/channels/plugins/index.ts` — Channel plugin registry
- `src/channels/message-normalization.ts` — Inbound normalization
- `src/channels/outbound-messaging.ts` — Outbound dispatch
- `src/channels/webhook-router.ts` — Webhook routing
- `src/gateway/server-channels.ts` — Channel manager
- `src/auto-reply/` — Auto-reply system
- `src/config/sessions.ts` — Session binding resolution
- `extensions/*/src/` — Per-channel implementation

---

*Evidence: `README.md`, `extensions/` directory listing, `src/channels/`, `src/gateway/server-channels.ts`, `src/auto-reply/`.*
