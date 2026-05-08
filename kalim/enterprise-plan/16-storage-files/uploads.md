# Uploads & File Handling

## Purpose
How file uploads are received, stored, and processed.

## Findings

### Inbound File Uploads

1. **Channel Media**
   - Images, videos, documents received via channel APIs
   - Downloaded by channel plugin (e.g., Baileys `downloadMediaMessage()`)
   - Stored temporarily in `~/.openclaw/media/`
   - MIME type validated: `src/media/mime.ts`

2. **HTTP Uploads**
   - Gateway accepts multipart/form-data for some endpoints
   - Canvas host accepts file uploads for workspace
   - Max size limits enforced per endpoint

3. **OpenAI API Compatible**
   - `/v1/chat/completions` accepts `file` parameter for vision
   - Base64-encoded images in JSON payload
   - URLs to external images (with SSRF protection)

### Storage Locations

| Type | Path | Lifecycle |
|------|------|-----------|
| Channel media | `~/.openclaw/media/` | TTL (default 7 days) |
| Session attachments | `~/.openclaw/media/` | TTL |
| Generated images | `~/.openclaw/media/` | TTL |
| Workspace files | `~/.openclaw/workspace/<session>/` | Persistent |
| Config | `~/.openclaw/openclaw.json` | Persistent |
| Logs | `~/.openclaw/logs/` | Rotated |
| Auth state | `~/.openclaw/<channel>-auth/` | Persistent |

### Media Store

- File: `src/media/store.ts`
- Generates time-limited URLs: `/managed-image-attachments/<token>`
- Token-based access (no auth required for valid token)
- Tokens expire after configurable TTL
- Cleanup via sweeper task

### File Size Limits

- Gateway HTTP: 50MB default (configurable)
- WhatsApp: ~100MB per file
- Telegram: 20MB (bot API), 2GB (via local server)
- Discord: 25MB (free), 100MB (boosted)

### Security

- `src/security/ssrf.ts` — blocks internal URLs in image links
- `src/media/mime.ts` — MIME type validation
- File extension validation for uploads
- No virus scanning detected

### Processing

- Images: EXIF stripped, thumbnails generated
- PDFs: text extraction for agent context
- Code files: syntax-highlighted in responses
- Large files: truncated or summarized for agent

## Evidence
- `src/media/store.ts` — media storage
- `src/media/mime.ts` — MIME validation
- `src/security/ssrf.ts` — SSRF protection
- `src/gateway/managed-image-attachments.ts` — attachment serving
- `~/.openclaw/media/` — storage location

## Notes
- No cloud storage integration (S3, GCS, etc.)
- All files local to gateway machine
- Media tokens are time-limited but not one-time
- Cleanup is lazy (on access check + periodic sweeper)
