# EPIC 4 — Channel Routing (WhatsApp / Telegram)

---

## 🧾 CHAN-1: WhatsApp Webhook Handler (Verify + Enqueue)

### 🎯 Description

Implement the WhatsApp Meta Cloud API webhook handler on the Gateway Pod. It verifies the HMAC-SHA256 signature, resolves the sender to a user via `channel_identities`, handles attachment downloads, and enqueues the job to BullMQ — all within <50ms (no LLM wait).

Source: `04-channel-routing/README.md` — "WhatsApp" flow steps [1]–[5].

### ⚙️ Implementation Details

**Files to create/modify:**
- `services/gateway/src/channel-router.ts` (WhatsApp section)

**Endpoint:** `POST /webhooks/whatsapp/:wsId`

**Request shape (Meta Cloud API):**
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "messages": [{ "from": "+919876543210", "text": { "body": "..." }, "id": "wamid.xyz" }],
        "contacts": [{ "profile": { "name": "Amit" } }]
      }
    }]
  }]
}
```

**HMAC verification:**
```ts
const body = req.rawBody;  // Must read raw body BEFORE JSON parse
const expected = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
if (!timingSafeEqual(Buffer.from(req.headers['x-hub-signature-256']), Buffer.from(expected))) {
  return res.status(401).json({ error: 'signature mismatch' });
}
```

**Workspace app secret:** Fetched from Postgres `workspace_secrets`, decrypted with AES-256-GCM, cached in-memory.

**Verification endpoint (GET):** Meta also sends a GET request during setup:
```
GET /webhooks/whatsapp/:wsId?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
→ verify hub.verify_token against stored workspace token
→ Return hub.challenge as plain text
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Implement the WhatsApp webhook handler in services/gateway/src/channel-router.ts

Requirements:

Express raw body: app.use('/webhooks', express.raw({ type: 'application/json' }))
  → This ensures req.body is Buffer for HMAC verification
  → Parse JSON manually: const parsed = JSON.parse(req.body.toString())

GET /webhooks/whatsapp/:wsId (webhook verification during Meta setup):
  - Read hub.mode, hub.verify_token, hub.challenge from query params
  - Look up workspace by wsId: SELECT verify_token FROM workspace_secrets WHERE workspace_id = ?
  - If hub.mode === 'subscribe' AND timingSafeEqual(hub.verify_token, stored_verify_token):
    → res.status(200).send(hub.challenge)
  - Else: res.status(403).send('Forbidden')

POST /webhooks/whatsapp/:wsId:
  - Step 1: HMAC verification
    const appSecret = await getWorkspaceSecret(wsId, 'whatsapp_app_secret')
    const sig = req.headers['x-hub-signature-256']
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(req.body).digest('hex')
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))): return 401

  - Step 2: Parse body
    const payload = JSON.parse(req.body.toString())
    Extract messages from: payload.entry[0].changes[0].value.messages
    If no messages: return 200 (echo/status updates)

  - Step 3: For each message
    const from = message.from  // E.164 phone
    const text = message.text?.body || ''
    const messageId = message.id

  - Step 4: Resolve user
    const identity = await findChannelIdentity('whatsapp', from)
    if (!identity):
      if text.startsWith('claim '):
        → await handleClaimCode(from, 'whatsapp', text)
      elif workspace.mode === 'auto-create':
        → user = await autoCreateGuestUser({ channel: 'whatsapp', externalId: from, displayName })
      else:
        → logger.info 'unknown sender, mode B, dropping'
        → return 200
    else if user.status === 'disabled':
      → return 200  // silently drop

  - Step 5: Handle attachments
    if message.type === 'document' or 'image':
      const attachment = await downloadWhatsAppAttachment(identity.userId, mediaId, mimeType, accessToken)
      (null on failure — continue without attachment)

  - Step 6: Enqueue
    await enqueueAgentJob({
      userId: identity.userId, workspaceId: identity.workspaceId,
      channel: 'whatsapp', threadId: from,
      sessionKey: 'u:' + identity.userId + ':wa:' + from,
      text, attachments: attachment ? [attachment] : [],
      webhookMessageId: messageId,
      replyChannel: null,  // WhatsApp is async reply, not streaming
      timestamp: new Date().toISOString(),
    })

  - Step 7: return res.status(200).json({})

Constraints:
  - Raw body MUST be available for HMAC before JSON parse
  - timingSafeEqual for ALL signature and token comparisons
  - Return 200 to Meta even for unknown senders (prevent retries)
  - Return 401 only for signature failures
  - Log: { wsId, from, messageId } on enqueue — never log message text

Output: Complete channel-router.ts WhatsApp section
```

### 🧪 Testing Instructions

```
1. Webhook verification GET:
   GET /webhooks/whatsapp/ws-1?hub.mode=subscribe&hub.verify_token=test123&hub.challenge=abc
   → 200, body: 'abc'

2. Valid webhook POST:
   - Generate correct HMAC for test payload
   - POST to /webhooks/whatsapp/ws-1 with X-Hub-Signature-256 header
   → 200, job enqueued to BullMQ

3. Invalid signature:
   POST with tampered body or wrong signature
   → 401

4. Unknown sender (Mode B):
   POST with sender not in channel_identities, workspace mode B
   → 200, no job enqueued

5. Claim code (Mode A):
   POST with text: "claim OC-7K2X9Q" from unknown sender
   → 200, claim handling initiated

6. Mode C (auto-create):
   POST with unknown sender, workspace mode C
   → 200, guest user created, job enqueued

7. Document attachment:
   POST with document type message
   → 200, attachment downloaded to S3, job payload includes s3Key
```

### 📥 Example Input

```json
POST /webhooks/whatsapp/ws-1
X-Hub-Signature-256: sha256=<computed_hmac>
Content-Type: application/json

{
  "entry": [{ "changes": [{ "value": {
    "messages": [{ "from": "+919876543210", "text": { "body": "Add lead Rahul" }, "id": "wamid.abc" }],
    "contacts": [{ "profile": { "name": "Amit" } }]
  }}]}]
}
```

### 📤 Expected Output

```
HTTP 200 {}
BullMQ job enqueued: { userId: 'amit-uuid', channel: 'whatsapp', text: 'Add lead Rahul', webhookMessageId: 'wamid.abc' }
```

### ✅ Acceptance Criteria

- [ ] GET endpoint responds to Meta webhook verification challenge
- [ ] HMAC-SHA256 verified using `timingSafeEqual`
- [ ] Invalid signature returns 401
- [ ] Valid sender resolved via `channel_identities`
- [ ] Unknown sender handled per workspace mode (A/B/C)
- [ ] Document attachments downloaded and uploaded to S3
- [ ] Job enqueued to BullMQ with `webhookMessageId` as dedup key
- [ ] Returns 200 to Meta within 50ms

---

## 🧾 CHAN-2: Telegram Webhook Handler (Verify + Enqueue)

### 🎯 Description

Implement the Telegram Bot API webhook handler. Telegram uses a secret-token header (not HMAC body signing) for authentication. Otherwise, the flow is identical to WhatsApp: verify, resolve user, download attachments, enqueue.

Source: `04-channel-routing/README.md` — "Telegram" flow steps [1]–[5].

### ⚙️ Implementation Details

**Endpoint:** `POST /webhooks/telegram/:wsId`

**Verification:** `X-Telegram-Bot-Api-Secret-Token` header must match stored secret token (per workspace).

**Telegram update shape:**
```json
{
  "update_id": 12345,
  "message": {
    "message_id": 100,
    "chat": { "id": 8675309 },
    "from": { "id": 9876543, "first_name": "Rahul" },
    "text": "My pre-approval letter",
    "document": { "file_id": "BQACAgIA...", "file_name": "letter.pdf", "mime_type": "application/pdf" }
  }
}
```

**threadId for Telegram:** `String(message.chat.id)` (chat ID, not user ID)

**Attachment:** Telegram requires two API calls: `getFile(fileId)` → `download(file_path)`.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Add the Telegram webhook handler to services/gateway/src/channel-router.ts

Requirements:

POST /webhooks/telegram/:wsId:

  - Step 1: Secret token verification
    const stored = await getWorkspaceSecret(wsId, 'telegram_secret_token')
    const provided = req.headers['x-telegram-bot-api-secret-token']
    if (!provided || !timingSafeEqual(Buffer.from(provided), Buffer.from(stored))):
      logger.warn({ wsId } 'Telegram secret token mismatch')
      return res.status(401).json({ error: 'unauthorized' })

  - Step 2: Parse body (Telegram sends JSON, standard content-type)
    const update = req.body  // JSON middleware handles this
    const message = update.message
    if (!message): return res.status(200).json({})  // edited_message, callback_query etc.

  - Step 3: Extract fields
    const chatId = String(message.chat.id)
    const text = message.text || message.caption || ''
    const updateId = String(update.update_id)

  - Step 4: Resolve user (same logic as WhatsApp — call shared helper)
    const identity = await resolveChannelUser('telegram', chatId, wsId, text, message)

  - Step 5: Handle document attachment
    if (message.document):
      const attachment = await downloadTelegramAttachment(
        identity.userId, message.document.file_id,
        message.document.mime_type, botToken
      )

  - Step 6: Enqueue
    await enqueueAgentJob({
      userId: identity.userId, workspaceId: identity.workspaceId,
      channel: 'telegram', threadId: chatId,
      sessionKey: 'u:' + identity.userId + ':tg:' + chatId,
      text, attachments: attachment ? [attachment] : [],
      webhookMessageId: 'tg:' + updateId,
      replyChannel: null,
      timestamp: new Date().toISOString(),
    })

  - Step 7: return res.status(200).json({})

Also register Telegram webhook with the Telegram Bot API during Gateway startup:
  async function registerTelegramWebhook(wsId, botToken, webhookUrl):
    POST https://api.telegram.org/bot{botToken}/setWebhook
    { url: webhookUrl + '/webhooks/telegram/' + wsId, secret_token: generatedSecret }

Constraints:
  - timingSafeEqual for secret token comparison
  - Return 200 for non-message updates (Telegram sends various update types)
  - chatId (not userId) is the threadId for Telegram sessions
  - TypeScript strict mode

Output: Complete Telegram section of channel-router.ts
```

### 🧪 Testing Instructions

```
1. POST /webhooks/telegram/ws-1 with correct X-Telegram-Bot-Api-Secret-Token
   → 200, job enqueued

2. POST with wrong secret token
   → 401

3. POST with callback_query update (no message field)
   → 200, no job enqueued

4. POST with document attachment
   → Telegram getFile API called
   → File downloaded and uploaded to S3
   → Job payload includes s3Key

5. Unknown sender, Mode A (message = 'claim OC-7K2X9Q')
   → Claim code handling initiated

6. Unknown sender, Mode C (auto-create)
   → Guest user created with email 'tg:{chatId}@guest.local'

7. Verify session key format: u:{userId}:tg:{chatId}
```

### 📥 Example Input

```json
POST /webhooks/telegram/ws-1
X-Telegram-Bot-Api-Secret-Token: random-secret-here
Content-Type: application/json

{
  "update_id": 12345,
  "message": {
    "chat": { "id": 8675309 },
    "from": { "id": 9876543, "first_name": "Rahul" },
    "text": "My pre-approval letter",
    "document": { "file_id": "BQACAgIA...", "mime_type": "application/pdf" }
  }
}
```

### 📤 Expected Output

```
HTTP 200 {}
BullMQ job enqueued: { userId: 'rahul-guest-uuid', channel: 'telegram', threadId: '8675309' }
S3 object uploaded: users/user_rahul-guest-uuid/uploads/<timestamp>_BQACAgIA.pdf
```

### ✅ Acceptance Criteria

- [ ] Secret-token header verified with `timingSafeEqual`
- [ ] Invalid secret returns 401
- [ ] Non-message updates return 200 (no processing)
- [ ] chatId used as threadId (not Telegram user ID)
- [ ] Session key format: `u:{userId}:tg:{chatId}`
- [ ] Document downloaded via getFile API and uploaded to S3
- [ ] Job enqueued with dedup key `tg:{update_id}`

---

## 🧾 CHAN-3: Claim Code Flow (Mode A — Pre-Claimed Identity)

### 🎯 Description

Implement the Mode A claim code flow: user generates a code via `/team/identities`, then sends `claim OC-XXXXXX` via WhatsApp or Telegram to link their channel identity. Code is stored in both Redis (fast lookup, 10-min TTL) and Postgres (audit trail).

Source: `04-channel-routing/README.md` — "Claim Code Flow (Mode A — Pre-Claimed)" and `06-data-model/README.md` — `channel_claims` table.

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/channel-claim.ts`

**Claim code format:** `OC-` + `randomBytes(4).toString('hex').toUpperCase()` → e.g. `OC-7K2X9Q`

**Generation flow:**
```
POST /team/identities { channel: 'telegram' }
  1. Generate code: 'OC-' + randomBytes(4).hex().toUpperCase()
  2. INSERT INTO channel_claims (code, user_id, channel, expires_at = now+10min)
  3. SET claim:{code} { userId, channel } EX 600  [Redis]
  4. Return { claimCode: 'OC-7K2X9Q' }
```

**Redemption flow (called from channel-router.ts when message starts with "claim "):**
```
text = 'claim OC-7K2X9Q'  →  code = 'OC-7K2X9Q'
  1. GET claim:{code} from Redis
     fallback: SELECT FROM channel_claims WHERE code = ? AND consumed_at IS NULL AND expires_at > now
  2. Not found or expired: enqueue "claim code not found" reply
  3. Found: INSERT INTO channel_identities (user_id, channel, external_id)
  4. UPDATE channel_claims SET consumed_at = now WHERE code = ?
  5. DEL claim:{code} from Redis
  6. Enqueue "claim success" reply job: "✓ Linked! You can now message me normally."
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/channel-claim.ts

Requirements:

Import:
  - { createChannelClaim, consumeChannelClaim, findChannelClaim, insertChannelIdentity } from shared/db/queries
  - redis from shared/redis/client
  - { enqueueAgentJob } from ./queue-producer
  - crypto from 'node:crypto'

Export async function generateClaimCode(userId: string, channel: 'whatsapp' | 'telegram', workspaceId: string | null): Promise<string>:
  - const code = 'OC-' + crypto.randomBytes(4).toString('hex').toUpperCase()
  - const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  - await createChannelClaim({ code, userId, channel, expiresAt })
  - await redis.set('claim:' + code, JSON.stringify({ userId, channel }), 'EX', 600)
  - return code

Export async function redeemClaimCode(code: string, channel: 'whatsapp' | 'telegram', externalId: string, displayName?: string): Promise<'success' | 'not-found' | 'expired' | 'already-used'>:
  - Normalize code: code.toUpperCase().trim()
  - Step 1: Try Redis first (fast path)
    const cached = await redis.get('claim:' + code)
    let claimData = cached ? JSON.parse(cached) : null

  - Step 2: Fallback to Postgres
    if (!claimData):
      const row = await findChannelClaim(code)
      if (!row): return 'not-found'
      if (row.consumed_at): return 'already-used'
      if (row.expires_at < new Date()): return 'expired'
      claimData = { userId: row.user_id, channel: row.channel }

  - Step 3: Verify channel matches
    if (claimData.channel !== channel): return 'not-found'

  - Step 4: Create identity
    await insertChannelIdentity({ userId: claimData.userId, channel, externalId, displayName })

  - Step 5: Mark consumed
    await consumeChannelClaim(code)
    await redis.del('claim:' + code)

  - return 'success'

Also add to team-routes.ts:
POST /team/identities (requires authMiddleware):
  - Validate: { channel } must be 'whatsapp' or 'telegram'
  - const code = await generateClaimCode(req.team.userId, channel, req.team.workspaceId)
  - Return 200: { claimCode: code, expiresAt: new Date(Date.now() + 600000).toISOString() }

Constraints:
  - code must be compared case-insensitively: normalize to uppercase
  - One code per user per channel per 10 minutes (or allow multiple — choose: allow, revoke old if exists)
  - Redis is primary store; Postgres is fallback and audit
  - TypeScript strict mode

Output: Complete channel-claim.ts and team-routes.ts identity section
```

### 🧪 Testing Instructions

```
1. Generate claim code:
   POST /team/identities { "channel": "telegram" } with valid JWT
   → 200 { claimCode: 'OC-XXXXXX', expiresAt: '...' }
   → Check Redis: GET claim:OC-XXXXXX → JSON with userId
   → Check Postgres: channel_claims row exists

2. Redeem claim code:
   - Send message 'claim OC-XXXXXX' from Telegram chatId 8675309
   - redeemClaimCode('OC-XXXXXX', 'telegram', '8675309')
   → 'success'
   → channel_identities row: { user_id, channel='telegram', external_id='8675309' }
   → channel_claims row: consumed_at is set
   → Redis: GET claim:OC-XXXXXX → nil

3. Try to redeem again (already used):
   - redeemClaimCode('OC-XXXXXX', 'telegram', '8675309')
   → 'already-used'

4. Expired code:
   - Generate code, wait 10 min (or set Redis TTL to 1s)
   → redeemClaimCode → 'expired'

5. Wrong channel:
   - Generate code for 'whatsapp'
   - Try to redeem on 'telegram'
   → 'not-found'

6. Case insensitive:
   - Code generated: 'OC-7K2X9Q'
   - Message: 'CLAIM oc-7k2x9q' (mixed case)
   → should still work
```

### 📥 Example Input

```
POST /team/identities
{ "channel": "telegram" }
Cookie: oc_session=<valid JWT>
```

### 📤 Expected Output

```json
{ "claimCode": "OC-7K2X9Q", "expiresAt": "2026-05-02T10:40:00.000Z" }
```

### ✅ Acceptance Criteria

- [ ] Claim code generated with `OC-` prefix + 4 random hex bytes (uppercase)
- [ ] Code stored in both Redis (10-min TTL) and Postgres
- [ ] Successful redemption creates `channel_identities` row and marks claim consumed
- [ ] Redis key deleted after successful redemption
- [ ] Re-use of consumed code returns `'already-used'`
- [ ] Expired code returns `'expired'` (Redis TTL or Postgres expiry check)
- [ ] Code normalization: case-insensitive comparison

---

## 🧾 CHAN-4: Channel Reply Sender (Redis Pub/Sub → Outbound API)

### 🎯 Description

Implement the reply sender on the Gateway Pod that subscribes to `agent:reply:*` Redis Pub/Sub channels and sends the actual outbound messages via the WhatsApp and Telegram APIs. This closes the loop from "agent generates reply" to "user sees message on phone."

Source: `04-channel-routing/README.md` — "Outbound Reply", `02-service-contracts/README.md` — "Redis Pub/Sub Schemas — agent:reply".

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/channel-reply.ts`

**Subscription pattern:** `agent:reply:*` (pattern subscribe)

**WhatsApp send:**
```
POST https://graph.facebook.com/v18.0/{phoneId}/messages
Authorization: Bearer {access_token}
{
  "messaging_product": "whatsapp",
  "to": "+919876543210",
  "type": "text",
  "text": { "body": "Got it — created lead 'Rahul'..." }
}
```

**Telegram send:**
```
POST https://api.telegram.org/bot{botToken}/sendMessage
{ "chat_id": 8675309, "text": "..." }
```

**Reply message HMAC verification** (before sending): verify `_sig` field on the pub/sub message.

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/gateway/src/channel-reply.ts

Requirements:

Import:
  - redis from shared/redis/client (use redis.duplicate() for subscriber)
  - { verifyReplySignature } from ./reply-signing
  - { getWorkspaceSecret } from ./workspace-secrets

Export async function startChannelReplySender(): Promise<void>:

  - Create subscriber: const sub = redis.duplicate()
  - await sub.psubscribe('agent:reply:*')
  - sub.on('pmessage', async (pattern, channel, message) => {
      try:
        const reply = JSON.parse(message)
        
        // Verify HMAC
        verifyReplySignature(reply)

        // Route by channel
        if reply.channel === 'whatsapp':
          await sendWhatsAppMessage(reply.threadId, reply.text, reply.workspaceId)
        elif reply.channel === 'telegram':
          await sendTelegramMessage(reply.threadId, reply.text, reply.workspaceId)
        else:
          logger.warn('Unknown reply channel: ' + reply.channel)
      catch err:
        logger.error({ channel, err: err.message }, 'Failed to send reply')
    })

Async function sendWhatsAppMessage(to: string, text: string, workspaceId: string | null): Promise<void>:
  - Get credentials: phoneId, accessToken from workspace_secrets (or env)
  - POST https://graph.facebook.com/v18.0/{phoneId}/messages
    headers: { Authorization: 'Bearer ' + accessToken }
    body: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }
  - If response not 2xx: log error (don't throw — message may be delivered or not)

Async function sendTelegramMessage(chatId: string, text: string, workspaceId: string | null): Promise<void>:
  - Get botToken from workspace_secrets (or env TELEGRAM_BOT_TOKEN)
  - POST https://api.telegram.org/bot{botToken}/sendMessage
    body: { chat_id: parseInt(chatId), text }
  - If response not 2xx: log error

Constraints:
  - Pattern subscribe to 'agent:reply:*' — NOT specific channels
  - Verify HMAC on every reply message (replay/injection protection)
  - Errors in sending are logged, never crash the subscriber
  - Workspace-specific credentials looked up from Postgres workspace_secrets
  - TypeScript strict mode

Output: Complete channel-reply.ts
```

### 🧪 Testing Instructions

```
1. Start Gateway (with channel-reply sender running)
2. Mock Meta API + Telegram API (or use test bots)
3. Publish a test reply to Redis:
   redis.publish('agent:reply:whatsapp:+919876543210', JSON.stringify({
     channel: 'whatsapp', threadId: '+919876543210', userId: 'amit',
     text: 'Test reply', _sig: '<valid_sig>'
   }))
4. Check: sendWhatsAppMessage called with correct payload
   → Meta API mock receives POST /messages

5. Publish Telegram reply:
   redis.publish('agent:reply:telegram:8675309', JSON.stringify({
     channel: 'telegram', threadId: '8675309', text: 'Test reply', _sig: '<valid_sig>'
   }))
4. Check: Telegram API mock receives POST /sendMessage

6. Test invalid HMAC:
   → Publish message with wrong _sig
   → Error logged, NO message sent to channel API

7. Integration test with real Telegram bot:
   → End-to-end flow → message appears on Telegram
```

### 📥 Example Input

```ts
// Redis pub/sub message (published by agent worker)
{
  channel: 'whatsapp',
  threadId: '+919876543210',
  userId: 'amit-uuid',
  text: "Got it — created lead 'Rahul', 2BHK, Bandra. Assigned to you.",
  _sig: 'hmac_hex_here'
}
```

### 📤 Expected Output

```
// Meta API called:
POST https://graph.facebook.com/v18.0/{phoneId}/messages
{ "messaging_product": "whatsapp", "to": "+919876543210", "type": "text", "text": { "body": "Got it..." } }
```

### ✅ Acceptance Criteria

- [ ] Pattern-subscribes to `agent:reply:*` (handles both WhatsApp and Telegram)
- [ ] HMAC on reply message verified before sending
- [ ] WhatsApp: sends via Meta Cloud API with correct format
- [ ] Telegram: sends via Bot API `sendMessage`
- [ ] Workspace-specific credentials used (not global env)
- [ ] Send failure is logged, not thrown (subscriber never crashes)

---

## 🧾 CHAN-5: Redis-Backed Rate Limiter

### 🎯 Description

Implement Redis-backed rate limiting shared across all Gateway Pod replicas. Three surfaces: login (sliding window, 5/15min per IP+email), webhook (token bucket, 50 burst/10 sustained per IP), and per-sender message cooldown (simple cooldown, 1 msg/2s per externalId).

Source: `03-auth-design/README.md` — "Rate Limiting (Redis-Backed)" table.

### ⚙️ Implementation Details

**Files to create:**
- `services/gateway/src/rate-limiter.ts` (or `services/shared/src/redis/rate-limiter.ts`)

**Algorithms:**

1. **Login rate limit** — Sliding window counter:
```
Key: rl:login:{ip}:{email}
Algorithm: INCR + EXPIRE
Limit: 5 attempts / 900 seconds
Response: { allowed: boolean, remaining: number, resetAt: Date }
```

2. **Webhook rate limit** — Token bucket:
```
Key: rl:webhook:{ip}
Burst: 50, Sustained: 10/sec
Use: INCR + EXPIRE (simplified) or lua script
```

3. **Per-sender cooldown:**
```
Key: rl:msg:{externalId}
Algorithm: SET NX EX 2
Returns: true if allowed, false if cooling down
```

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
Create services/shared/src/redis/rate-limiter.ts

Requirements:

Import redis from ./client

Export async function checkLoginRateLimit(ip: string, email: string): Promise<{ allowed: boolean; remaining: number }> :
  const key = 'rl:login:' + ip + ':' + email
  const LIMIT = 5
  const WINDOW = 900  // 15 minutes in seconds

  // Sliding window using INCR + EXPIRE
  const count = await redis.incr(key)
  if (count === 1):
    await redis.expire(key, WINDOW)
  
  const remaining = Math.max(0, LIMIT - count)
  return { allowed: count <= LIMIT, remaining }

Export async function recordLoginSuccess(ip: string, email: string): Promise<void>:
  // Clear rate limit on success (optional — depends on policy)
  const key = 'rl:login:' + ip + ':' + email
  await redis.del(key)

Export async function checkWebhookRateLimit(ip: string): Promise<boolean>:
  const key = 'rl:webhook:' + ip
  const BURST = 50
  
  // Simplified: count per second with burst allowance
  const count = await redis.incr(key)
  if (count === 1):
    await redis.expire(key, 1)  // 1 second window
  
  return count <= BURST

Export async function checkSenderCooldown(externalId: string): Promise<boolean>:
  const key = 'rl:msg:' + externalId
  // SET NX EX 2 — returns 1 if key was set (allowed), 0 if already exists (cooling down)
  const result = await redis.set(key, '1', 'NX', 'EX', 2)
  return result === 'OK'  // OK = key set = allowed; null = key existed = cooling down

In auth-routes.ts, use checkLoginRateLimit before verifying password:
  const { allowed, remaining } = await checkLoginRateLimit(req.ip, email)
  if (!allowed):
    return res.status(429).json({ error: 'Too many login attempts', remaining: 0 })

In channel-router.ts, use checkSenderCooldown:
  const allowed = await checkSenderCooldown(from)
  if (!allowed):
    logger.debug('sender cooling down, dropping message')
    return res.status(200).json({})

Constraints:
  - Rate limits MUST use Redis (not in-memory) — shared across replicas
  - All keys must have TTL — never persist forever
  - checkSenderCooldown uses NX (atomic set-if-not-exists) — no race condition
  - TypeScript strict mode

Output: Complete rate-limiter.ts
```

### 🧪 Testing Instructions

```
1. checkLoginRateLimit: call 5 times with same ip+email
   → First 5: allowed=true, remaining decreasing
   → 6th call: allowed=false, remaining=0
   → Check Redis: TTL rl:login:{ip}:{email} is ~900s

2. Rate limit resets after window:
   → Set Redis TTL to 1s for testing
   → Wait 2s
   → Call again → allowed=true

3. checkSenderCooldown:
   → First call: true (message allowed)
   → Immediate second call: false (cooling down)
   → Wait 2s: call again → true

4. checkWebhookRateLimit:
   → 50 calls in 1 second → all allowed
   → 51st call → false

5. Cross-replica test:
   → Start 2 Gateway replicas
   → Rate limit from replica 1
   → Check rate limit blocked on replica 2 (shared Redis state)
```

### 📥 Example Input

```ts
const { allowed } = await checkLoginRateLimit('192.168.1.1', 'amit@test.com');
// Call 6 times → 6th returns { allowed: false, remaining: 0 }

const senderAllowed = await checkSenderCooldown('+919876543210');
// → true (first message)
// Wait <2s:
await checkSenderCooldown('+919876543210');
// → false (cooldown)
```

### 📤 Expected Output

```ts
// 5th call: { allowed: true, remaining: 0 }
// 6th call: { allowed: false, remaining: 0 }
// → HTTP 429 on login route
```

### ✅ Acceptance Criteria

- [ ] Login rate limit: 5 attempts / 15 min per IP+email
- [ ] Login rate limit stored in Redis with TTL (shared across replicas)
- [ ] Webhook rate limit: 50 burst per second per IP
- [ ] Sender cooldown: 1 message per 2 seconds per externalId (atomic NX)
- [ ] Rate limit exceeded → HTTP 429 with correct error
- [ ] All rate limits reset after TTL expiry

---

## 🧾 CHAN-6: Workspace Secret Storage (AES-256-GCM Encrypted Channel Credentials)

### 🎯 Description

Implement encrypted storage for per-workspace channel credentials (WhatsApp app secret, Telegram bot token, webhook verify tokens). Credentials are AES-256-GCM encrypted with `OPENCLAW_SECRETS_KEY` before storage in Postgres `workspace_secrets`. Gateway Pod decrypts at startup and caches in-memory.

Source: `04-channel-routing/README.md` — "Webhook Secret Storage", `06-data-model/README.md` — `workspace_secrets` table.

### ⚙️ Implementation Details

**Files to create:**
- `services/shared/src/crypto/secrets.ts`
- `services/gateway/src/workspace-secrets.ts`

**AES-256-GCM encryption:**
```ts
function encryptSecret(plaintext: string, key: Buffer): { encrypted: Buffer, iv: Buffer }
function decryptSecret(encrypted: Buffer, iv: Buffer, key: Buffer): string
```

**`OPENCLAW_SECRETS_KEY`:** 32-byte random key, stored as K8s Secret, base64-encoded in env.

**In-memory cache:** At gateway startup, load all `workspace_secrets` rows, decrypt, store in Map. Refresh on Redis pub/sub notification (`workspace:config:changed`).

### 🤖 AI CODING PROMPT

```text
You are a senior TypeScript/Node.js engineer.

Task:
1. Create services/shared/src/crypto/secrets.ts
2. Create services/gateway/src/workspace-secrets.ts

For secrets.ts:
  import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
  
  Export function encryptSecret(plaintext: string, keyBase64: string): { encryptedHex: string, ivHex: string }:
    const key = Buffer.from(keyBase64, 'base64')
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag()
    return {
      encryptedHex: encrypted + tag.toString('hex'),  // Append GCM auth tag
      ivHex: iv.toString('hex'),
    }

  Export function decryptSecret(encryptedHex: string, ivHex: string, keyBase64: string): string:
    const key = Buffer.from(keyBase64, 'base64')
    const iv = Buffer.from(ivHex, 'hex')
    const encryptedWithTag = Buffer.from(encryptedHex, 'hex')
    const authTag = encryptedWithTag.slice(-16)
    const ciphertext = encryptedWithTag.slice(0, -16)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(ciphertext, undefined, 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted

For workspace-secrets.ts:
  const cache = new Map<string, Map<string, string>>()
  // Key: workspaceId → Map<secretType, decryptedValue>

  Export async function loadWorkspaceSecrets(): Promise<void>:
    const rows = await getAllWorkspaceSecrets()  // DB query
    for each row:
      const decrypted = decryptSecret(row.encrypted_val, row.iv, process.env.OPENCLAW_SECRETS_KEY!)
      if (!cache.has(row.workspace_id)): cache.set(row.workspace_id, new Map())
      cache.get(row.workspace_id)!.set(row.secret_type, decrypted)

  Export function getWorkspaceSecret(workspaceId: string | null, secretType: string): string:
    const wsId = workspaceId || 'default'
    const val = cache.get(wsId)?.get(secretType)
    if (!val):
      // Fallback to environment variable for single-workspace setup
      const envKey = secretType.toUpperCase().replace(/-/g, '_')
      return process.env[envKey] || ''
    return val

  Export async function saveWorkspaceSecret(workspaceId: string, secretType: string, plaintext: string): Promise<void>:
    const { encryptedHex, ivHex } = encryptSecret(plaintext, process.env.OPENCLAW_SECRETS_KEY!)
    await upsertWorkspaceSecret({ workspaceId, secretType, encryptedHex, ivHex })
    if (!cache.has(workspaceId)): cache.set(workspaceId, new Map())
    cache.get(workspaceId)!.set(secretType, plaintext)

Constraints:
  - Auth tag MUST be stored with ciphertext (GCM authentication)
  - OPENCLAW_SECRETS_KEY must be 32 bytes (base64-encoded 44-char string)
  - Cache invalidation: call loadWorkspaceSecrets() on gateway startup and on config change
  - TypeScript strict mode

Output: Both complete files
```

### 🧪 Testing Instructions

```
1. Unit test encrypt/decrypt round trip:
   const key = randomBytes(32).toString('base64')
   const { encryptedHex, ivHex } = encryptSecret('test-secret', key)
   const decrypted = decryptSecret(encryptedHex, ivHex, key)
   → decrypted === 'test-secret'

2. Test authentication tag:
   Tamper with encryptedHex (flip one bit)
   → decryptSecret throws

3. Test workspace secret storage:
   await saveWorkspaceSecret('ws-1', 'whatsapp_app_secret', 'my_app_secret')
   → Postgres row has encrypted value (not plaintext)
   → getWorkspaceSecret('ws-1', 'whatsapp_app_secret') → 'my_app_secret' (from cache)

4. Test env fallback:
   No Postgres row for 'default' workspace
   Set WHATSAPP_APP_SECRET=test123
   → getWorkspaceSecret(null, 'whatsapp_app_secret') → 'test123'

5. Test gateway startup:
   await loadWorkspaceSecrets()
   → All workspace secrets decrypted and in cache
```

### 📥 Example Input

```ts
await saveWorkspaceSecret('ws-agency-1', 'whatsapp_app_secret', 'secret_abc123');
await saveWorkspaceSecret('ws-agency-1', 'telegram_bot_token', '1234567890:ABC...');
const appSecret = getWorkspaceSecret('ws-agency-1', 'whatsapp_app_secret');
```

### 📤 Expected Output

```ts
// Postgres row: { encrypted_val: <encrypted>, iv: <iv> }  (NOT 'secret_abc123')
// getWorkspaceSecret: 'secret_abc123'  (from in-memory cache)
```

### ✅ Acceptance Criteria

- [ ] AES-256-GCM encryption with random IV per secret
- [ ] GCM auth tag stored with ciphertext (tamper detection)
- [ ] Tampered ciphertext throws on decrypt
- [ ] Workspace secrets loaded from Postgres at gateway startup
- [ ] In-memory cache serves subsequent lookups (no Postgres per request)
- [ ] Env var fallback for single-workspace setups without Postgres rows
