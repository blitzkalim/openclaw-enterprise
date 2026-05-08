# Supported Channels

## Purpose
Complete list of all supported channels with current state.

## Findings

### Messaging Channels (Active)

| Channel | Extension | Provider | Auth Model | Status |
|---------|-----------|----------|------------|--------|
| WhatsApp | `extensions/whatsapp/` | Baileys | QR Pairing | Active |
| Telegram | `extensions/telegram/` | Bot API | Bot Token | Active |
| Discord | `extensions/discord/` | Discord.js | Bot Token | Active |
| Slack | `extensions/slack/` | Slack SDK | Bot + App Token | Active |
| Signal | `extensions/signal/` | Signal CLI | Native device | Active |
| iMessage | `extensions/imessage/` | BlueBubbles | Bridge | Active |
| Matrix | `extensions/matrix/` | Matrix SDK | Access Token | Active |
| Microsoft Teams | `extensions/msteams/` | Bot Framework | Bot Token | Active |
| Google Chat | `extensions/googlechat/` | Google APIs | Service Account | Active |
| LINE | `extensions/line/` | LINE API | Channel Token | Active |
| Zalo | `extensions/zalo/` | Zalo OA API | OA Token | Active |
| Feishu / Lark | `extensions/feishu/` | Lark API | App Credentials | Active |
| Mattermost | `extensions/mattermost/` | REST API | Bot Token | Active |
| IRC | `extensions/irc/` | IRC Client | Nick/Password | Active |
| Nostr | `extensions/nostr/` | Nostr SDK | Private Key | Active |
| Twitch | `extensions/twitch/` | Twitch API | OAuth Token | Active |
| Nextcloud Talk | `extensions/nextcloud-talk/` | Talk API | App Token | Active |
| QQ Bot | `extensions/qqbot/` | QQ API | App Credentials | Active |
| Webhooks | `extensions/webhooks/` | HTTP | None | Active |

### Voice Channels

| Channel | Extension | Stack | Status |
|---------|-----------|-------|--------|
| VoiceClaw Realtime | `src/gateway/voiceclaw-realtime/` | WebRTC/WebSocket | Active |

### Inbound Webhooks

| Extension | Path Pattern | Auth |
|-----------|-------------|------|
| `extensions/webhooks/` | `/hooks/webhooks/*` | Configurable |

## Evidence
- `extensions/*/package.json` — channel metadata
- `extensions/*/src/channel.ts` — channel implementations
- `src/channels/plugins/index.ts` — channel registry
- `src/channels/plugins/configured-binding-compiler.ts` — channel bindings

## Notes
- Channels are optional plugins — loaded only if configured
- Each channel has its own auth model (no unified auth)
- WhatsApp uses Baileys library (unofficial Web API)
- iMessage uses BlueBubbles bridge (macOS/iOS required)
- Signal uses signal-cli (separate binary required)
- Webhooks channel allows generic HTTP inbound messages
