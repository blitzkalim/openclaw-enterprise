# WhatsApp — Auth & Signature Verification

## Purpose
How WhatsApp auth works and any signature verification.

## Findings

### Auth Model: QR Pairing (No Token)

1. **Initial Setup**
   - User runs `openclaw` or `openclaw gateway`
   - WhatsApp extension loads via plugin system
   - Baileys `makeWASocket()` creates WebSocket connection
   - If no auth state found, Baileys generates QR code
   - QR code displayed in terminal / logs
   - User scans QR with phone WhatsApp app
   - Phone authenticates to WhatsApp Web
   - Auth state persisted to `auth-dir` files

2. **Reconnection**
   - On restart, Baileys reads `creds.json` from auth directory
   - Re-establishes session without new QR
   - Works in multi-device mode (phone can be offline)

### Signature Verification

- **No webhook signature** — WebSocket protocol, not HTTP webhooks
- Baileys handles WhatsApp protocol-level encryption (E2EE)
- Messages decrypted by Baileys before reaching OpenClaw
- OpenClaw receives plaintext — E2EE handled at Baileys layer

### Auth State Files

```
~/.openclaw/whatsapp-auth/
  creds.json          # Main credentials
  pre-key-*.json      # Pre-keys for E2EE
  sender-key-*.json   # Sender keys for groups
  session-*.json        # Session keys
  app-state-sync-*.json # App state sync
```

### Security Considerations

1. **Auth directory permissions**
   - Should be readable only by OpenClaw process owner
   - `openclaw doctor` checks permissions
   - No encryption at rest for auth state

2. **QR Code exposure**
   - QR displayed in terminal logs
   - Anyone with access to logs could pair
   - QR valid for limited time (~30 seconds)

3. **Multi-device mode**
   - Phone can be offline after initial pairing
   - Auth state independent of phone connectivity
   - Revoke from phone WhatsApp settings if needed

### No API Key / Webhook Secret

- Unlike Telegram/Discord/Slack, no static token or webhook secret
- Security relies on:
  - Physical QR scan (something you have)
  - Auth directory file permissions
  - WhatsApp server-side session validation

## Evidence
- `extensions/whatsapp/src/channel.ts` — Baileys socket setup
- `extensions/whatsapp/src/auth-presence.ts` — auth state check
- `extensions/whatsapp/package.json` — Baileys dependency
- Baileys documentation (external)

## Notes
- Baileys is unofficial — WhatsApp may change protocol
- Rate limiting and banning possible for high-volume usage
- Auth state backup recommended for disaster recovery
- No automatic re-pairing on auth state corruption
