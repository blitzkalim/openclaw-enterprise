# WhatsApp Media Flow

## Inbound Media

```
WhatsApp Server (CDN)
  |
  v
Baileys receives encrypted media message
  |
  +-- message.message.imageMessage / videoMessage / audioMessage / documentMessage
  +-- Contains: url (encrypted), mediaKey, fileLength, mimetype
  |
  v
Baileys decryptMedia() — uses mediaKey + algorithm
  |
  v
Download decrypted buffer from WhatsApp CDN
  |
  v
Save to ~/.openclaw/media/{hash}.{ext}
  |
  v
Update NormalizedMessage.media[].url = local path
  |
  v
Agent runtime processes media (vision models, transcription, etc.)
```

## Baileys Media Decryption

```typescript
// Baileys media decryption (conceptual)
async function downloadMedia(message: proto.IWebMessageInfo) {
  const mediaMessage = message.message?.imageMessage ||
                       message.message?.videoMessage ||
                       message.message?.audioMessage ||
                       message.message?.documentMessage;

  if (!mediaMessage) return null;

  const stream = await downloadContentFromMessage(
    mediaMessage,
    mediaType,         // 'image', 'video', 'audio', 'document'
    { mediaKey: mediaMessage.mediaKey }
  );

  // Stream is decrypted by Baileys using Signal protocol media keys
  const buffer = await streamToBuffer(stream);
  return buffer;
}
```

## Media Types Supported

| WhatsApp Type | Baileys Key | Extension | Agent Use |
|--------------|-------------|-----------|-----------|
| Image | `imageMessage` | .jpg, .png | Vision models (GPT-4V, Gemini) |
| Video | `videoMessage` | .mp4 | Video understanding, transcription |
| Audio | `audioMessage` | .mp3, .ogg | Speech-to-text (Deepgram, Whisper) |
| Voice Note | `audioMessage` (ptt: true) | .ogg, .opus | STT, voice conversation |
| Document | `documentMessage` | .pdf, .doc, etc. | File read, text extraction |
| Sticker | `stickerMessage` | .webp | Image processing |
| Contact | `contactMessage` | — | Contact card parsing |
| Location | `locationMessage` | — | Location context |

## Outbound Media

```
Agent generates media (image, audio, document)
  |
  v
Save to ~/.openclaw/media/{hash}.{ext}
  |
  v
Outbound message includes media path
  |
  v
Baileys uploadMedia()
  |
  +-- Encrypt media with Signal protocol
  +-- Upload to WhatsApp CDN
  +-- Get media URL + mediaKey
  |
  v
Construct message with media attachment
  |
  v
Send via Baileys sendMessage()
  |
  v
WhatsApp server delivers to recipient
```

## Media Storage

```
~/.openclaw/media/
  +-- {content-hash}.jpg       → Images
  +-- {content-hash}.mp4       → Videos
  +-- {content-hash}.mp3       → Audio
  +-- {content-hash}.pdf       → Documents
  +-- ...
```

- Files named by content hash (deduplication)
- No expiration observed (may grow indefinitely)
- Periodic cleanup may be implemented (not observed)

## Media Size Limits

| Direction | Limit | Source |
|-----------|-------|--------|
| Inbound | ~100MB | WhatsApp server limit |
| Outbound | ~100MB | WhatsApp server limit |
| Configurable | `channels.whatsapp.maxMediaSize` | OpenClaw config |

## Media Processing Pipeline

```
Inbound media received
  |
  v
Save to disk
  |
  v
MIME type detection
  |
  v
Content type routing:
  +-- Image → vision model (if agent has vision capability)
  +-- Audio → STT transcription
  +-- Video → frame extraction + vision / audio extraction + STT
  +-- Document → text extraction (PDF, DOC, etc.)
  +-- Location → context injection
  |
  v
Processed content appended to message context
  |
  v
Agent sees: "[User sent an image: {description}]" or "[Audio transcript: {text}]"
```

## Vision Model Integration

```typescript
// If agent has vision capability and receives image:
const imageMessage = {
  role: "user",
  content: [
    { type: "text", text: "What do you see in this image?" },
    { type: "image_url", image_url: { url: `file://${mediaPath}` } }
  ]
};
```

OpenClaw converts local file path to base64 or direct file reference for LLM vision APIs.

## Audio Transcription

```typescript
// Voice message → STT
const audioPath = message.content.media[0].url;
const transcript = await sttProvider.transcribe(audioPath);
message.content.text = `[Voice message]: ${transcript}`;
```

STT providers: Deepgram (`extensions/deepgram/`), OpenAI Whisper, Azure Speech.

## Media Cleanup

From `src/gateway/server-startup.ts` (inferred):

```typescript
// Periodic media cleanup timer
setInterval(() => {
  cleanupOldMedia({ maxAge: config.mediaMaxAge ?? '7d' });
}, 3600000); // hourly
```

May delete media files older than configured age to prevent disk growth.

## Key Files

- `extensions/whatsapp/src/` — Baileys media handling
- `src/media/` — Generic media utilities
- `src/media-understanding/` — Vision model integration
- `src/realtime-transcription/` — STT integration
- `src/channels/message-normalization.ts` — Media in normalization
- `src/channels/outbound-messaging.ts` — Media in outbound

---

*Evidence: Baileys library media handling, `src/media/`, `src/media-understanding/`, `src/realtime-transcription/`, `src/channels/` patterns.*
