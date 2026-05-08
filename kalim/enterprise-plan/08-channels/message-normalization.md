# Message Normalization

## Purpose
How different channel formats are normalized into a unified internal format.

## Findings

### Internal Envelope Format

All inbound messages are normalized to a common envelope before agent processing:

```typescript
interface ChannelMessageEnvelope {
  provider: ChannelId;
  accountId: string;
  senderId: string;
  senderName?: string;
  channelType: "dm" | "group" | "thread";
  messageId: string;
  timestamp: number;
  text?: string;
  attachments?: ChannelAttachment[];
  replyToMessageId?: string;
  mentions?: string[];
  command?: string; // e.g., "/status"
}
```

### Normalization Pipeline

```
Channel Raw Message
  -> channel plugin specific parser
    -> src/channels/plugins/types.adapters.ts (type adapters)
      -> src/channels/plugins/account-helpers.ts (account resolution)
        -> src/auto-reply/reply/dispatcher-registry.ts (dispatch queue)
```

### Normalization Logic

1. **Text Normalization**
   - Markdown support varies by channel (`markdownCapable` flag in manifest)
   - HTML stripped for non-markdown channels
   - Emoji handled natively

2. **Media Normalization**
   - Images, audio, video converted to internal `ChannelAttachment` format
   - MIME type validation: `src/media/mime.ts`
   - Temporary download for external URLs
   - Base64 encoding for small inline media

3. **Sender Normalization**
   - `senderId` mapped to channel-specific ID
   - `senderName` extracted from display name
   - Anonymous senders handled with placeholder IDs

4. **Group vs DM Detection**
   - `channelType` inferred from message context
   - Group policy applied: `src/security/dm-policy-shared.ts`
   - Thread support varies by channel

5. **Command Extraction**
   - `/command` prefix detected: `src/channels/command-gating.ts`
   - Commands routed to CLI-equivalent handlers
   - Unknown commands treated as regular text

### Reply Threading

- `replyToMessageId` preserved where channel supports threading
- Session key includes thread ID if applicable
- `src/channels/thread-bindings-policy.ts` — thread binding rules

### Attachment Handling

- `ChannelAttachment`:
  - `mimeType`: validated MIME
  - `url`: temporary or permanent URL
  - `filename`: original filename
  - `size`: byte size
  - `inline`: whether to include in prompt

## Evidence
- `src/channels/plugins/types.adapters.ts` — type adapters
- `src/channels/plugins/account-helpers.ts` — account resolution
- `src/channels/command-gating.ts` — command gating
- `src/channels/thread-bindings-policy.ts` — thread bindings
- `src/media/mime.ts` — MIME validation
- `src/auto-reply/reply/dispatcher-registry.ts` — dispatch

## Notes
- Not all channels support all features (markdown, threads, attachments)
- Channels declare capabilities in `openclaw.channel` manifest block
- Media download is synchronous during normalization (may delay response)
- Large media may be rejected or truncated based on provider limits
