# Message Normalization

## Purpose

OpenClaw normalizes inbound messages from all channels into a **common internal format**. This allows the agent runtime to work with channels without knowing channel-specific APIs.

## Normalized Message Format

From `src/channels/message-normalization.ts` (inferred from architecture):

```typescript
type NormalizedMessage = {
  // Identity
  id: string;                    // Unique message ID (channel-specific)
  channelId: string;             // telegram, whatsapp, slack, etc.
  platform: string;              // Human-readable platform name

  // Sender
  senderId: string;              // Channel-native user ID
  senderName?: string;           // Display name (cached)
  senderUsername?: string;        // Username/handle
  isBot?: boolean;               // Is the sender a bot

  // Conversation context
  chatId: string;               // Channel-native chat/channel ID
  chatName?: string;            // Chat/channel display name
  chatType?: "dm" | "group" | "channel" | "thread"; // Conversation type
  threadId?: string;            // Thread ID (for threaded channels)
  replyTo?: string;             // Parent message ID (if reply)

  // Content
  timestamp: Date;
  content: {
    text?: string;               // Plain text content
    html?: string;               // HTML formatted content (if available)
    markdown?: string;           // Markdown content (if available)

    media?: Array<{
      type: "image" | "audio" | "video" | "file" | "sticker";
      url?: string;              // Remote URL or local path
      mimeType?: string;
      size?: number;             // Bytes
      width?: number;            // For images/videos
      height?: number;
      duration?: number;         // For audio/video (seconds)
      caption?: string;          // Media caption
    }>;

    location?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      name?: string;             // Venue name
      address?: string;
    };

    contact?: {
      name: string;
      phone?: string;
      email?: string;
      vcard?: string;
    };

    poll?: {
      question: string;
      options: string[];
      isAnonymous?: boolean;
      allowsMultiple?: boolean;
    };
  };

  // Commands
  commands?: Array<{
    name: string;                // Without leading /
    args: string[];             // Split by space
    botCommand: boolean;         // Was detected as bot command
    fullText: string;           // Full command line
  }>;

  // Metadata
  isForwarded?: boolean;
  isEdited?: boolean;
  editTimestamp?: Date;
  isPinned?: boolean;

  // Raw (for extension access)
  raw: any;                     // Original channel-specific payload
};
```

## Normalization Pipeline

```
Channel-specific payload
  |
  v
Channel Extension Parser
  |
  +-- Extract sender info
  +-- Extract chat/thread context
  +-- Extract content (text, media, etc.)
  +-- Detect commands (starts with /)
  +-- Extract reply context
  +-- Flag forwarded/edited
  |
  v
NormalizedMessage
  |
  v
Agent Runtime
  |
  v
Reply generated
  |
  v
Outbound denormalization → Channel API
```

## Command Detection

Bot commands are detected during normalization:

```typescript
// Telegram: "/start arg1 arg2" → { name: "start", args: ["arg1", "arg2"] }
// Discord: "!help topic" → { name: "help", args: ["topic"] }
// Slack: "@bot help topic" → { name: "help", args: ["topic"] }
```

Command prefix varies by channel:
- Telegram: `/` prefix
- Discord: `!` or `@bot` prefix
- Slack: `@bot` prefix
- WhatsApp: `!` or `.` prefix (configurable)

## Media Handling

Media files are downloaded and stored locally:

```
Inbound media URL
  |
  v
Download to ~/.openclaw/media/{hash}.{ext}
  |
  v
Update NormalizedMessage.media[].url to local path
  |
  v
Agent can reference local file
```

Media types supported:
- Images: JPEG, PNG, GIF, WebP, HEIC
- Audio: MP3, OGG, WAV, M4A
- Video: MP4, MOV, WebM
- Files: Any MIME type
- Stickers: WebP, TGS (animated)

## Session Key Resolution

From `src/config/sessions.ts`:

```typescript
function resolveSessionKey(message: NormalizedMessage): string {
  const binding = config.channels[message.channelId]?.sessionBinding ?? "user";

  switch (binding) {
    case "channel":
      return `${message.channelId}:${message.chatId}`;
    case "user":
      return `${message.channelId}:${message.senderId}`;
    case "thread":
      return `${message.channelId}:${message.chatId}:${message.threadId ?? "main"}`;
    case "channel+user":
      return `${message.channelId}:${message.chatId}:${message.senderId}`;
    default:
      return `${message.channelId}:${message.senderId}`;
  }
}
```

## Thread-Aware Channels

| Channel | Thread Support | Thread ID Source |
|---------|---------------|------------------|
| Telegram | Yes | Message thread_id |
| Slack | Yes | Thread ts |
| Discord | Yes | Thread ID |
| WhatsApp | Partial | Group JID / Reply context |
| MS Teams | Yes | Conversation ID |
| Matrix | Yes | Thread/event relation |
| Others | No | N/A |

## Reply Context

Reply chains are preserved:

```typescript
type ReplyChain = {
  current: NormalizedMessage;
  parent?: ReplyChain;          // Recursive reply chain
};
```

The agent runtime may include reply context in the conversation history.

## Forward Detection

Forwarded messages flagged to prevent:
- Loop detection (don't reply to own forwarded messages)
- Attribution confusion (note original sender in context)

## Edit Handling

When a message is edited:
1. Original message ID preserved
2. `isEdited: true` set
3. `editTimestamp` recorded
4. New content replaces old in session (or appended as edit note)

## Key Files

- `src/channels/message-normalization.ts` — Core normalization logic
- `src/channels/outbound-messaging.ts` — Outbound denormalization
- `src/channels/webhook-router.ts` — Webhook payload parsing
- `src/config/sessions.ts` — Session key resolution
- `extensions/*/src/` — Per-channel normalization

---

*Evidence: `src/channels/message-normalization.ts`, `src/channels/outbound-messaging.ts`, `src/channels/webhook-router.ts`, `src/config/sessions.ts`, `src/media/`.*
