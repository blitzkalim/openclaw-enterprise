# Blob Storage

## Purpose
How large binary objects are stored and retrieved.

## Findings

### No Object Storage Service

OpenClaw does not use S3, GCS, Azure Blob, MinIO, or any external object storage.

### Local Blob Storage

1. **File System Blob Store**
   - Path: `~/.openclaw/media/` for media blobs
   - Path: `~/.openclaw/workspace/` for workspace files
   - Raw files stored with original filenames (sanitized)
   - No content-addressable storage (no hashing)

2. **SQLite Blob Store**
   - `src/proxy-capture/store.sqlite.ts` — stores HTTP request/response bodies as BLOB
   - `src/tasks/task-registry.store.sqlite.ts` — task metadata (not large blobs)
   - SQLite BLOBs used for structured blob data

3. **LanceDB Vector Store**
   - `extensions/memory-lancedb/` — vector embeddings storage
   - Used for long-term memory / semantic search
   - Not traditional blob storage

### Media Blob Lifecycle

```
Inbound media (channel upload / agent generation)
  -> src/media/store.ts
    -> write to ~/.openclaw/media/<filename>
      -> generate access token
        -> serve via /managed-image-attachments/<token>
          -> TTL expiry check
            -> cleanup on sweeper run
```

### Blob Access Tokens

- Time-limited URLs: `/managed-image-attachments/<token>`
- Token format: HMAC-like or random (not investigated deeply)
- Expiry: configurable (default 7 days)
- No one-time use — token valid until expiry

### Workspace File Storage

- `~/.openclaw/workspace/<sessionKey>/`
- Agent read/write/edit tools operate on these paths
- Persistent across sessions
- No versioning or backup

### Generated Media

| Type | Generator | Storage |
|------|-----------|---------|
| Images | DALL-E / Stable Diffusion | `~/.openclaw/media/` |
| Audio | ElevenLabs / Azure TTS | `~/.openclaw/media/` |
| Video | Video generation providers | `~/.openclaw/media/` |

### Blob Size Limits

- No global blob size limit enforced
- Provider-specific limits apply (WhatsApp 100MB, Telegram 20MB)
- Gateway HTTP body limit: 50MB default
- Large files may cause memory issues (no streaming upload)

### No Deduplication

- Same file uploaded twice = two stored copies
- No hash-based deduplication
- No compression

## Evidence
- `src/media/store.ts` — media storage
- `src/proxy-capture/store.sqlite.ts` — SQLite blob store
- `src/gateway/managed-image-attachments.ts` — blob serving
- `extensions/memory-lancedb/` — vector store

## Notes
- All blob storage is local to the gateway machine
- NAS or network shares can be used by changing `OPENCLAW_STATE_DIR`
- No distributed blob storage
- No CDN integration
- Cleanup is manual or periodic sweeper
