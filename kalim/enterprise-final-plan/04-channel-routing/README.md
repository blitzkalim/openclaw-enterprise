# 04 — Channel Routing

## Principle: Verify + Enqueue, Don't Execute

In the simple plan, the channel router verifies the webhook, resolves the user, and **directly calls** the agent runtime in the same process. In the final plan, the gateway Pod **verifies + enqueues** — the agent worker Pod dequeues and executes.

This decoupling is the single most important architectural change. It means:
- Webhook endpoints respond in <50ms (no LLM latency)
- Meta/Telegram never timeout waiting for a response
- Agent workers process at their own pace with backpressure
- Gateway scales independently from agent workers

---

## Preserved from Simple Plan (100%)

| Feature | Simple Plan | Final Plan | Change |
|---|---|---|---|
| WhatsApp Meta Cloud webhook | `POST /webhooks/whatsapp/:wsId` | Same endpoint, same path | None |
| Telegram webhook | `POST /webhooks/telegram/:wsId` | Same endpoint, same path | None |
| WhatsApp signature verification | HMAC-SHA256 of raw body | Identical | None |
| Telegram secret-token check | Header match | Identical | None |
| `channel_identities` lookup | SQLite query | Postgres query | Storage backend only |
| Claim Mode A (pre-claimed) | Claim code flow | Identical | None |
| Claim Mode B (admin-assigns) | Admin UI | Identical | None |
| Claim Mode C (auto-create guest) | Guest user creation | Identical | None |
| Session key format | `u:<userId>:<channel>:<threadId>` | Identical | None |

---

## Webhook Processing Flow

### WhatsApp (Meta Cloud API)

```
[1] Meta Cloud API → POST /webhooks/whatsapp/:wsId
       Headers: X-Hub-Signature-256: sha256=<hex>
       Body: { entry: [{ changes: [{ value: { messages, contacts } }] }] }

[2] Gateway Pod — channel-router handler:
       a. Read raw body BEFORE JSON parsing (for HMAC)
       b. Compute HMAC-SHA256(rawBody, workspace_app_secret)
       c. crypto.timingSafeEqual(computed, header_value)
       d. If mismatch → 401, log, drop
       e. Parse JSON body
       f. Extract: from = "+919876543210", text, attachments

[3] Gateway Pod — user resolution:
       a. SELECT user_id, workspace_id FROM channel_identities
          WHERE channel = 'whatsapp' AND external_id = '+919876543210'
       b. Found → userId resolved
       c. Not found → check claim / auto-create / drop (per mode)

[4] Gateway Pod — attachment handling:
       a. If message has document/image:
          → Download from Meta Cloud API (GET file URL)
          → Upload to S3: users/user_{userId}/uploads/{timestamp}_{fileId}.pdf
          → Record S3 key as attachment reference
       b. All S3 writes go through validateS3WriteKey(userId, key)

[5] Gateway Pod — enqueue:
       a. Build job payload:
          {
            userId, workspaceId, channel: 'whatsapp',
            threadId: '+919876543210',
            sessionKey: 'u:amit-uuid:wa:+919876543210',
            text: 'Add lead Rahul wants 2BHK',
            attachments: [{ s3Key: 'users/user_amit/uploads/...', mimeType: '...' }],
            webhookMessageId: message.id,  // for dedup
            replyChannel: 'agent:reply:whatsapp:+919876543210'
          }
       b. Enqueue to BullMQ queue 'agent-jobs' via Redis
       c. Return 200 to Meta (async — agent processes later)
```

### Telegram

```
[1] Telegram → POST /webhooks/telegram/:wsId
       Headers: X-Telegram-Bot-Api-Secret-Token: <secret>
       Body: { message: { chat: { id }, from: { id }, text, document? } }

[2] Gateway Pod:
       a. Compare header to stored per-workspace secret (crypto.timingSafeEqual)
       b. If mismatch → 401, log, drop
       c. Extract: chatId = message.chat.id, text = message.text

[3] User resolution:
       a. SELECT ... FROM channel_identities WHERE channel = 'telegram'
          AND external_id = String(chatId)
       b. Same claim/auto-create/drop logic as WhatsApp

[4] Attachment handling (if document present):
       a. Call Telegram getFile API → download file
       b. Upload to S3: users/user_{userId}/uploads/{timestamp}_{fileId}.pdf
       c. Path validated via validateS3WriteKey()

[5] Enqueue job to BullMQ (same schema as WhatsApp)
       → Return 200 to Telegram
```

---

## Claim Code Flow (Mode A — Pre-Claimed)

### Step 1: User generates claim code (from `/team` page)

```
POST /team/identities { channel: 'telegram' }

Gateway Pod:
  1. Generate code: "OC-" + randomBytes(4).hex().toUpperCase()  → "OC-7K2X9Q"
  2. INSERT INTO channel_claims (code, user_id, channel, expires_at)
     VALUES ('OC-7K2X9Q', userId, 'telegram', now + 10 minutes)
  3. Also cache in Redis: SET claim:OC-7K2X9Q { userId, channel } EX 600
  4. Return { claimCode: 'OC-7K2X9Q' }
```

### Step 2: User messages the bot with `claim OC-7K2X9Q`

```
Webhook arrives → Gateway Pod:
  1. Signature verified
  2. channel_identities lookup → NOT FOUND
  3. Message text starts with "claim " → extract code
  4. Look up Redis: GET claim:OC-7K2X9Q → { userId, channel }
     (fallback: SELECT FROM channel_claims WHERE code = ? AND consumed_at IS NULL AND expires_at > now)
  5. INSERT INTO channel_identities (user_id, channel, external_id, ...)
  6. UPDATE channel_claims SET consumed_at = now WHERE code = ?
  7. DEL claim:OC-7K2X9Q from Redis
  8. Enqueue a "claim success" reply job:
     → Agent worker sends: "Linked. You can now message me normally."
```

---

## Failure Modes (Preserved from Simple Plan)

| Failure | Behavior | Response to provider |
|---|---|---|
| Signature mismatch | Log + drop | 401 |
| Unknown sender, Mode A | Reply with claim instructions if message is `claim …`; else ignore | 200 |
| Unknown sender, Mode B | Log + drop (admin sees in `/team`) | 200 |
| Unknown sender, Mode C | Auto-create guest user, proceed | 200 |
| User disabled (`status='disabled'`) | Drop message internally | 200 (prevent retry) |
| Workspace bot misconfigured | Log error | 503 (provider retries) |
| Redis / BullMQ down | Return 503 to provider (they retry) | 503 |
| S3 upload fails | Log error, enqueue job without attachment, note in job metadata | 200 |

---

## Outbound Reply (Agent → User)

After agent execution, the agent worker publishes the reply to Redis:

```ts
// Agent Worker — after LLM generates response
await redis.publish(`agent:reply:${channel}:${threadId}`, JSON.stringify({
  channel: 'whatsapp',
  threadId: '+919876543210',
  userId: 'amit-uuid',
  text: "Got it — created lead 'Rahul', 2BHK, Bandra. Assigned to you.",
}));
```

The Gateway Pod subscribes to `agent:reply:*` channels and dispatches:

| Channel | Send mechanism |
|---|---|
| WhatsApp | POST `https://graph.facebook.com/v17.0/{phoneId}/messages` |
| Telegram | POST `https://api.telegram.org/bot{token}/sendMessage` |

This preserves the existing channel extension send path but moves it to the Gateway Pod (which has outbound network access and channel API credentials).

---

## Webhook Secret Storage

| Secret | Storage | Encryption |
|---|---|---|
| WhatsApp app secret (per workspace) | Postgres `workspace_secrets` table | AES-256-GCM encrypted with `OPENCLAW_SECRETS_KEY` |
| Telegram bot token (per workspace) | Same table | Same encryption |
| Per-workspace webhook verify token | Same table | Same encryption |

Decrypted at Gateway Pod startup and cached in-memory. Re-read on workspace config change (Redis pub/sub notification).

---

## Code Footprint

| Component | Simple Plan Location | Final Plan Location | Lines Changed |
|---|---|---|---|
| Webhook handlers | `src/team/channel-router.ts` (~150 lines) | Gateway Pod: `services/gateway/src/channel-router.ts` | Same logic + enqueue instead of direct call |
| Claim code handler | `src/team/channel-claim.ts` (~60 lines) | Gateway Pod: `services/gateway/src/channel-claim.ts` | Same logic + Redis cache |
| Signature verifiers | Inline in channel-router | Same | Identical |
| Outbound reply sender | Reused existing extension send path | Gateway Pod: `services/gateway/src/channel-reply.ts` (~80 lines) | New: listens to Redis pub/sub, calls channel APIs |
