# WhatsApp Webhook Flow

## Finding: No HTTP Webhook

WhatsApp (via Baileys) does **not** use HTTP webhooks. Instead, it uses a **persistent WebSocket connection** to WhatsApp Web servers.

## Inbound Message Flow (WebSocket)

```
WhatsApp Server
  |
  v
WebSocket connection (Baileys)
  |
  v
Baileys event: "messages.upsert"
  |
  v
WhatsApp Extension handler
  |
  +-- Validate message (not from self, not status update)
  +-- Normalize to NormalizedMessage
  +-- Download media if present
  +-- Detect commands
  |
  v
Gateway message router
  |
  v
Auto-reply dispatcher
  |
  +-- Deduplication check
  +-- Rate limit check
  |
  v
Agent runtime
  |
  v
Session store update
  |
  v
Reply generation
  |
  v
Outbound messaging → Baileys sendMessage
  |
  v
WhatsApp server → recipient
```

## Baileys Event Types

```typescript
// Baileys events listened by extension
sock.ev.on("messages.upsert", ({ messages, type }) => {
  // type: "append" (new) or "notify" (history)
  // messages: Array<proto.IWebMessageInfo>
});

sock.ev.on("connection.update", (update) => {
  // connection, qr, lastDisconnect, isNewLogin
});

sock.ev.on("creds.update", (creds) => {
  // Save credentials for reconnection
});

sock.ev.on("presence.update", ({ id, presences }) => {
  // Contact presence updates
});
```

## Connection Lifecycle

```
Start
  |
  v
Load credentials from ~/.openclaw/plugins/whatsapp/auth_info.json
  |
  v
Create Baileys socket
  |
  v
If no credentials:
  +-- Generate QR code
  +-- Display in terminal or Control UI
  +-- Wait for mobile scan
  +-- Save credentials
  |
  v
Connection established
  |
  v
Sync chat history (if configured)
  |
  v
Listen for messages.upsert events
  |
  v
On disconnect:
  +-- Attempt reconnect (exponential backoff)
  +-- If credentials invalid: regenerate QR
```

## Deduplication

From `src/auto-reply/` pattern applied to WhatsApp:

```typescript
// Message deduplication prevents double-processing
const dedupeKey = `${message.key.id}:${message.key.remoteJid}`;
if (dedupeRegistry.has(dedupeKey)) {
  return; // Already processed
}
dedupeRegistry.set(dedupeKey, Date.now());
```

Dedupe registry cleaned up periodically to prevent memory growth.

## Command Detection

WhatsApp command prefixes (configurable):

```typescript
const prefixes = config.channels.whatsapp.commandPrefix ?? ["!", "."];
// "!help" → { name: "help", args: [], botCommand: true }
// ".status" → { name: "status", args: [], botCommand: true }
```

Commands bypass agent runtime and execute directly.

## Reply Context

WhatsApp reply chains:

```typescript
// Original message has contextInfo
const replyTo = message.message?.extendedTextMessage?.contextInfo?.stanzaId;
const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
```

Quoted message content included in agent context for continuity.

## Group Handling

```typescript
const isGroup = message.key.remoteJid.endsWith("@g.us");
const groupId = message.key.remoteJid;
const senderId = message.key.participant || message.key.remoteJid;

// In groups:
// - bot may only respond when mentioned or replied to
// - session binding depends on config (user vs thread vs channel+user)
```

## Key Files

- `extensions/whatsapp/src/` — Baileys integration
- `src/auto-reply/` — Deduplication and auto-reply
- `src/channels/message-normalization.ts` — Generic normalization
- `src/channels/outbound-messaging.ts` — Generic outbound

---

*Evidence: Baileys library architecture, `extensions/whatsapp/` directory, `src/auto-reply/` patterns, `src/channels/`.*
