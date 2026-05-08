# WhatsApp Authentication & Signature

## Authentication Method: QR Code Pairing

WhatsApp (via Baileys) uses **QR code-based pairing** — not API tokens or signatures.

## Auth Flow

```
First Connection:
  1. OpenClaw starts WhatsApp extension
  2. Baileys generates QR code (terminal output or Control UI)
  3. User opens WhatsApp mobile app → Settings → Linked Devices
  4. User scans QR code with phone camera
  5. WhatsApp servers authenticate the session
  6. Baileys receives authentication credentials
  7. Credentials saved to ~/.openclaw/plugins/whatsapp/auth_info.json
  8. Session established, no QR needed for reconnection

Reconnection:
  1. Load auth_info.json credentials
  2. Baileys reconnects to WhatsApp Web servers
  3. Session restored automatically
```

## Credential Storage

```
~/.openclaw/plugins/whatsapp/auth_info.json
```

Contains:
- `noiseKey` — Encryption key for WebSocket connection
- `signedIdentityKey` — Signed identity keypair
- `signedPreKey` — Signed pre-key for Signal protocol
- `registrationId` — Device registration ID
- `advSecretKey` — Advertisement secret key
- `me` — Own JID (WhatsApp ID)
- `accountSyncCounter` — Sync counter
- `accountSettings` — Account settings
- `platform` — Platform identifier

## Security Characteristics

| Aspect | Detail |
|--------|--------|
| No API token | Uses WhatsApp Web protocol credentials |
| No shared secret | Credentials are device-specific |
| End-to-end encryption | Messages encrypted with Signal protocol (handled by Baileys) |
| Credential storage | JSON file, no encryption at rest observed |
| Reconnection | Automatic with saved credentials |
| Expiration | Credentials valid until manually logged out from phone |

## No Webhook Signature

Since WhatsApp uses WebSocket (not HTTP webhooks), there is:
- **No HMAC signature validation**
- **No webhook secret**
- **No certificate pinning** (beyond TLS)
- Authentication is implicit via the persistent WebSocket connection and Signal protocol

## Message Integrity

WhatsApp messages are protected by:
1. **TLS** — WebSocket connection to WhatsApp servers
2. **Signal Protocol** — End-to-end encryption (handled by Baileys/phone)
3. **WhatsApp server authentication** — Servers authenticate the session

OpenClaw does not need to verify message signatures — Baileys handles this.

## Risk: Credential Theft

If `auth_info.json` is compromised:
- Attacker can impersonate the WhatsApp Web session
- Can send/receive messages as the bot
- Cannot access historical end-to-end encrypted messages (keys on phone)

**Mitigation:**
- File permissions on `~/.openclaw/` directory
- No observed encryption of credential file
- If compromised: revoke from phone (Settings → Linked Devices → Log out)

## Risk: Session Hijacking

Since Baileys simulates WhatsApp Web:
- WhatsApp allows only one primary + up to 4 linked devices
- If another device links, one may be disconnected
- OpenClaw session can be evicted by phone owner

## Configuration

```json
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      // No token or secret needed — QR code auth
    }
  }
}
```

## Key Files

- `extensions/whatsapp/src/` — Baileys integration
- `~/.openclaw/plugins/whatsapp/auth_info.json` — Credential storage

---

*Evidence: Baileys library documentation, `extensions/whatsapp/` architecture, WhatsApp Web protocol behavior.*
