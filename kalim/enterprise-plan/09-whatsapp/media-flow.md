# WhatsApp — Media Flow

## Purpose
How images, videos, documents flow through WhatsApp channel.

## Findings

### Inbound Media

```
WhatsApp server sends encrypted media message
  -> Baileys decrypts and provides download URL / direct buffer
    -> extensions/whatsapp/src/channel.ts (media handler)
      -> downloadMediaMessage() [Baileys helper]
        -> media buffer (Buffer / Uint8Array)
          -> MIME type detection (from message metadata)
            -> ChannelAttachment { mimeType, buffer, filename }
              -> stored to ~/.openclaw/media/ (temporary)
                -> referenced in agent prompt
```

### Media Types Supported

| Type | Inbound | Outbound | Notes |
|------|---------|----------|-------|
| Image (JPEG/PNG) | Yes | Yes | Compressed by WhatsApp |
| Video (MP4) | Yes | Yes | Size limits apply |
| Audio (OGG/MP3) | Yes | Yes | Voice messages supported |
| Document (PDF/DOC) | Yes | Yes | Max 100MB |
| GIF | Yes | Yes | Converted to MP4 by WhatsApp |
| Sticker | Yes | No | WebP format |
| Location | Yes | No | Text representation only |
| Contact | Yes | No | VCard text |

### Outbound Media

```
Agent generates or references media
  -> src/media/store.ts (resolve media URL/path)
    -> extensions/whatsapp/src/channel.ts (sendMedia)
      -> Baileys sendMessage(jid, { image: buffer, caption: "..." })
        -> WhatsApp WebSocket upload
          -> WhatsApp servers
            -> recipient
```

### Image Processing

- `jimp` dependency for image manipulation
- Thumbnails generated for large images
- EXIF data stripped for privacy
- Images may be resized to fit WhatsApp limits

### Storage

- Inbound media: `~/.openclaw/media/` (temporary, TTL configurable)
- Outbound media: generated on-demand, not stored
- Media URLs served via gateway: `/managed-image-attachments/*`
- Cleanup via task registry sweeper

### Size Limits

- WhatsApp Web: ~100MB per file
- Images auto-compressed by WhatsApp servers
- Large files may fail silently — no retry for media

## Evidence
- `extensions/whatsapp/src/channel.ts` — media handling
- `extensions/whatsapp/package.json` — `jimp` dependency
- `src/media/store.ts` — media storage
- `src/media/mime.ts` — MIME validation
- Baileys `downloadMediaMessage()` API

## Notes
- Media download is synchronous — may block message processing
- No progress indication for large downloads
- Outbound media upload may take seconds for large files
- Sticker and location inbound are textified for agent
