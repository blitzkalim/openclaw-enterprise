# WhatsApp — Current State

## Purpose
Deep audit of the WhatsApp channel extension.

## Findings

### Extension Info
- **Path**: `extensions/whatsapp/`
- **Package**: `@openclaw/whatsapp`
- **Version**: 2026.4.25
- **Channel ID**: `whatsapp`
- **Label**: WhatsApp (QR link)
- **Detail Label**: WhatsApp Web

### Dependencies
- `@whiskeysockets/baileys`: 7.0.0-rc.9 (unofficial WhatsApp Web API)
- `https-proxy-agent`: ^9.0.0 (proxy support)
- `jimp`: ^1.6.1 (image processing)
- `undici`: 8.1.0 (HTTP client)

### Authentication Model
- **No bot token** — uses WhatsApp Web QR code pairing
- `auth-dir` CLI option for custom auth directory
- Baileys persists auth state to files
- `extensions/whatsapp/src/auth-presence.ts` — `hasAnyWhatsAppAuth()`
- QR code displayed in terminal on first start
- Phone must scan QR to pair

### Features
- Text messages (send & receive)
- Image/video/document attachments
- Group messages
- Read receipts
- Typing indicators (limited)
- Message reactions
- Status/Story messages (optional)
- Location messages
- Contact cards

### Configuration
```json5
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      "accounts": ["primary"],
      "allowFrom": ["*"],
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist"
    }
  }
}
```

### State Management
- Auth state stored in `~/.openclaw/whatsapp-auth/` (or custom `auth-dir`)
- Baileys `authInfo` files: `creds.json`, pre-keys
- Group metadata cached locally
- Contact list cached locally

### Known Limitations
- Requires phone to stay connected to internet
- Rate limits apply (Ban risk for spam)
- No official API — uses reverse-engineered Web protocol
- Multi-device mode required (phone can be offline after pairing)
- Message history not automatically synced

## Evidence
- `extensions/whatsapp/package.json` — metadata
- `extensions/whatsapp/src/channel.ts` — channel implementation
- `extensions/whatsapp/src/auth-presence.ts` — auth state
- `extensions/whatsapp/index.ts` — entry point

## Notes
- Baileys is an unofficial library — may break with WhatsApp updates
- Recommend separate phone + eSIM for production use
- Group chats require explicit allowlist configuration
- DM policy defaults to `pairing` (unknown senders get pairing request)
