# OpenClaw Enterprise — Complete Fix & Implementation Prompt

You are implementing fixes and missing features for the OpenClaw Enterprise project.
The project root is the repository root. All paths below are relative to repo root.

Work through every numbered task in order. Each task specifies the exact file, what to
change, and the complete correct code to write. Do not skip any task. Do not change
anything not listed. When a task says "replace the entire file", write the complete new
content exactly as given.

---

## TASK 1 — Fix JWT Audience Bug
**File:** `src/services/gateway/src/auth/auth-middleware.ts`

On **line 45**, the `verifyJwt` function passes `audience: JWT_ALGORITHM` (value `'RS256'`)
instead of `audience: JWT_AUDIENCE` (value `'openclaw-team'`).

Replace the entire `verifyJwt` function (lines 41–49) with:

```typescript
async function verifyJwt(token: string): Promise<Record<string, unknown>> {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    clockTolerance: 60,
  });
  return payload as Record<string, unknown>;
}
```

Also fix the legacy token comparison on **line 148** to use timing-safe compare.
Replace:
```typescript
    if (expected && legacyToken === expected) {
```
With:
```typescript
    if (expected && timingSafeEqual(Buffer.from(legacyToken, 'utf8'), Buffer.from(expected, 'utf8'))) {
```

Also add `timingSafeEqual` to the existing `import { createHash, randomBytes } from 'node:crypto';`
line at the top so it becomes:
```typescript
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
```

---

## TASK 2 — Fix WhatsApp HMAC Signature Verification
**File:** `src/services/gateway/src/channel-router.ts`

Replace the entire file with:

```typescript
import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { enqueueAgentJob } from './queue-producer.js';
import { downloadWhatsAppAttachment, downloadTelegramAttachment } from './attachment-handler.js';
import type { AttachmentRef, AgentJobPayload } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { findChannelIdentity } from '@openclaw/enterprise-shared/db/queries.js';
import { checkWebhookRateLimit, checkSenderCooldown } from './rate-limit/rate-limit-middleware.js';
import pino from 'pino';

const logger = pino({ name: 'channel-router' });

const router = new Hono();

/**
 * Verify WhatsApp X-Hub-Signature-256 header using HMAC-SHA256.
 * Returns true if valid, false if invalid.
 * MUST be called before trusting any webhook payload.
 */
function verifyWhatsAppSignature(rawBody: string, signatureHeader: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.error('WHATSAPP_APP_SECRET is not set — cannot verify WhatsApp webhook');
    return false;
  }
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

/**
 * WhatsApp webhook handler.
 * POST /webhooks/whatsapp/:webhookId
 */
router.post('/webhooks/whatsapp/:webhookId', async (c) => {
  const webhookId = c.req.param('webhookId')!;

  // Rate-limit by IP
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  const rateResult = await checkWebhookRateLimit(ip);
  if (!rateResult.allowed) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  const rawBody = await c.req.text();

  // Verify Meta signature — REQUIRED before trusting payload
  const signature = c.req.header('x-hub-signature-256');
  if (!signature) {
    logger.warn({ webhookId }, 'WhatsApp webhook missing signature header');
    return c.json({ error: 'Missing signature' }, 401);
  }
  if (!verifyWhatsAppSignature(rawBody, signature)) {
    logger.warn({ webhookId }, 'WhatsApp webhook signature verification failed');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const payload = JSON.parse(rawBody);

    if (payload.entry && payload.entry[0]?.changes && payload.entry[0].changes[0]?.value) {
      const value = payload.entry[0].changes[0].value;

      if (value.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const phone = message.from as string;
        const text = (message.text?.body as string) || '';

        // Per-sender cooldown
        const cooldown = await checkSenderCooldown(`wa:${phone}`);
        if (!cooldown.allowed) {
          return c.json({ status: 'rate_limited' }, 429);
        }

        const identity = await findChannelIdentity('whatsapp', phone);
        if (!identity) {
          logger.warn({ phone, webhookId }, 'WhatsApp message from unknown identity');
          return c.json({ error: 'Identity not linked' }, 404);
        }

        const attachments: AttachmentRef[] = [];
        if (message.type === 'image' || message.type === 'document' || message.type === 'audio') {
          const mediaId = message[message.type]?.id as string | undefined;
          const mimeType = (message[message.type]?.mime_type as string) || 'application/octet-stream';
          if (mediaId) {
            const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
            if (accessToken) {
              const attachment = await downloadWhatsAppAttachment(identity.userId, mediaId, mimeType, accessToken);
              if (attachment) attachments.push(attachment);
            }
          }
        }

        const jobPayload: AgentJobPayload = {
          userId: identity.userId,
          workspaceId: null,
          isAdmin: false,
          source: 'webhook',
          channel: 'whatsapp',
          threadId: phone,
          sessionKey: `wa:${phone}:${message.id as string}`,
          text,
          attachments,
          webhookMessageId: message.id as string,
          timestamp: new Date().toISOString(),
        };

        await enqueueAgentJob(jobPayload);
        return c.json({ status: 'queued' }, 200);
      }
    }

    return c.json({ status: 'ok' }, 200);
  } catch (err) {
    logger.error({ err: (err as Error).message, webhookId }, 'WhatsApp webhook error');
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * WhatsApp webhook verification (GET challenge).
 * GET /webhooks/whatsapp/:webhookId
 */
router.get('/webhooks/whatsapp/:webhookId', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    return c.text(challenge ?? '', 200);
  }
  return c.json({ error: 'Forbidden' }, 403);
});

/**
 * Telegram webhook handler.
 * POST /webhooks/telegram/:webhookId
 */
router.post('/webhooks/telegram/:webhookId', async (c) => {
  const webhookId = c.req.param('webhookId')!;

  // Rate-limit by IP
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  const rateResult = await checkWebhookRateLimit(ip);
  if (!rateResult.allowed) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  const rawBody = await c.req.text();

  // Verify Telegram secret token using timing-safe compare
  const secretToken = c.req.header('x-telegram-bot-api-secret-token');
  const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken || !expectedToken) {
    logger.warn({ webhookId }, 'Telegram webhook missing secret token');
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const sBuf = Buffer.from(secretToken, 'utf8');
  const eBuf = Buffer.from(expectedToken, 'utf8');
  if (sBuf.length !== eBuf.length || !timingSafeEqual(sBuf, eBuf)) {
    logger.warn({ webhookId }, 'Telegram webhook secret token verification failed');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = JSON.parse(rawBody);

    if (payload.message) {
      const message = payload.message;
      const chatId = String(message.chat.id);
      const text = (message.text as string) || '';

      // Per-sender cooldown
      const cooldown = await checkSenderCooldown(`tg:${chatId}`);
      if (!cooldown.allowed) {
        return c.json({ status: 'rate_limited' }, 429);
      }

      const identity = await findChannelIdentity('telegram', chatId);
      if (!identity) {
        logger.warn({ chatId, webhookId }, 'Telegram message from unknown identity');
        return c.json({ error: 'Identity not linked' }, 404);
      }

      const attachments: AttachmentRef[] = [];
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (message.photo && botToken) {
        const photo = message.photo[message.photo.length - 1];
        const attachment = await downloadTelegramAttachment(identity.userId, photo.file_id, 'image/jpeg', botToken);
        if (attachment) attachments.push(attachment);
      } else if (message.document && botToken) {
        const attachment = await downloadTelegramAttachment(identity.userId, message.document.file_id, message.document.mime_type, botToken);
        if (attachment) attachments.push(attachment);
      } else if (message.voice && botToken) {
        const attachment = await downloadTelegramAttachment(identity.userId, message.voice.file_id, 'audio/ogg', botToken);
        if (attachment) attachments.push(attachment);
      }

      const jobPayload: AgentJobPayload = {
        userId: identity.userId,
        workspaceId: null,
        isAdmin: false,
        source: 'webhook',
        channel: 'telegram',
        threadId: chatId,
        sessionKey: `tg:${chatId}:${message.message_id as number}`,
        text,
        attachments,
        webhookMessageId: String(message.message_id),
        timestamp: new Date().toISOString(),
      };

      await enqueueAgentJob(jobPayload);
      return c.json({ status: 'queued' }, 200);
    }

    return c.json({ status: 'ok' }, 200);
  } catch (err) {
    logger.error({ err: (err as Error).message, webhookId }, 'Telegram webhook error');
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;
```

---

## TASK 3 — Fix Redis Pattern Subscribe (Critical: Broken Reply Delivery)
**File:** `src/services/gateway/src/channel-reply.ts`

The `subscriber.subscribe('agent:reply:*')` on line 17 does NOT work for pattern matching
in ioredis — it subscribes to a literal channel named `agent:reply:*`.
You must use `psubscribe` and the corresponding `pmessage` event.

Also fix the HMAC verification: `verifyJobPayload(reply as any, reply._sig)` is wrong —
it uses the job signing function on a reply message. Create and use a dedicated
`verifyReplyMessage` function instead.

Replace the entire file with:

```typescript
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { findChannelIdentity } from '@openclaw/enterprise-shared/db/queries.js';
import type { AgentReplyMessage } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pino from 'pino';

const logger = pino({ name: 'channel-reply' });

const QUEUE_SECRET = process.env.OPENCLAW_QUEUE_SECRET || '';

/**
 * Verify HMAC signature on a reply message.
 * The signature is computed over the message WITHOUT the _sig field.
 */
function verifyReplyMessage(reply: AgentReplyMessage & { _sig?: string }): boolean {
  if (!QUEUE_SECRET) return false;
  const { _sig, ...rest } = reply;
  if (!_sig) return false;
  const expected = createHmac('sha256', QUEUE_SECRET).update(JSON.stringify(rest)).digest('hex');
  const eBuf = Buffer.from(expected, 'hex');
  const sBuf = Buffer.from(_sig, 'hex');
  if (eBuf.length !== sBuf.length) return false;
  return timingSafeEqual(eBuf, sBuf);
}

/**
 * Start the channel reply sender subscriber.
 * Uses psubscribe for pattern matching on agent:reply:* channels.
 */
export async function startChannelReplySender(): Promise<void> {
  const redis = getRedis();
  const subscriber = redis.duplicate();

  // MUST use psubscribe (pattern subscribe) for glob patterns
  await subscriber.psubscribe('agent:reply:*');

  subscriber.on('pmessage', async (_pattern: string, channel: string, message: string) => {
    try {
      const reply = JSON.parse(message) as AgentReplyMessage & { _sig?: string };

      // Verify HMAC signature
      if (!verifyReplyMessage(reply)) {
        logger.warn({ channel }, 'Invalid or missing HMAC signature on reply — dropping');
        return;
      }

      await sendChannelReply(reply);
    } catch (err) {
      logger.error({ err: (err as Error).message, channel }, 'Error processing reply');
    }
  });

  logger.info('Channel reply sender started (psubscribe agent:reply:*)');
}

/**
 * Send a reply to the appropriate channel.
 */
async function sendChannelReply(reply: AgentReplyMessage): Promise<void> {
  const identity = await findChannelIdentity(reply.channel, reply.threadId);

  if (!identity) {
    logger.warn({ channel: reply.channel, threadId: reply.threadId }, 'Channel identity not found');
    return;
  }

  if (reply.channel === 'whatsapp') {
    await sendWhatsAppReply(identity.userId, reply.threadId, reply.text);
  } else if (reply.channel === 'telegram') {
    await sendTelegramReply(identity.userId, reply.threadId, reply.text);
  }
}

/**
 * Send reply via WhatsApp Meta API.
 */
async function sendWhatsAppReply(userId: string, phone: string, text: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    logger.warn('WHATSAPP_ACCESS_TOKEN not set, skipping WhatsApp reply');
    return;
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    logger.warn('WHATSAPP_PHONE_NUMBER_ID not set, skipping WhatsApp reply');
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      logger.error({ userId, phone, status: response.status }, 'WhatsApp API error');
      return;
    }

    logger.info({ userId, phone }, 'WhatsApp reply sent');
  } catch (err) {
    logger.error({ err: (err as Error).message, userId, phone }, 'WhatsApp send error');
  }
}

/**
 * Send reply via Telegram Bot API.
 */
async function sendTelegramReply(userId: string, chatId: string, text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, skipping Telegram reply');
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      logger.error({ userId, chatId, status: response.status }, 'Telegram API error');
      return;
    }

    logger.info({ userId, chatId }, 'Telegram reply sent');
  } catch (err) {
    logger.error({ err: (err as Error).message, userId, chatId }, 'Telegram send error');
  }
}
```

Also update `stream-publisher.ts` so the `publishReply` function signs the message
**before** the `_sig` field is added (not after), so verification in `channel-reply.ts`
works correctly. Open `src/services/agent-worker/src/stream-publisher.ts` and replace
the `publishReply` function (lines 68–74) with:

```typescript
export async function publishReply(reply: AgentReplyMessage): Promise<void> {
  // Sign the payload WITHOUT _sig field, then add it
  const sig = createHmac('sha256', QUEUE_SECRET).update(JSON.stringify(reply)).digest('hex');
  const signedReply = { ...reply, _sig: sig };
  const channel = `agent:reply:${reply.channel}:${reply.threadId}`;
  const redis = getRedis();
  await redis.publish(channel, JSON.stringify(signedReply));
  logger.info({ channel, threadId: reply.threadId }, 'Published reply');
}
```

---

## TASK 4 — Fix CSRF Module (ESM + Broken Token Generation)
**File:** `src/services/gateway/src/csrf.ts`

The file has two bugs:
1. `require('node:crypto')` inside a local function — crashes in ESM.
2. `generateCsrfToken` generates random bytes but never includes them in the verification,
   making the token weaker than intended and the random bytes completely wasted.

Replace the entire file with:

```typescript
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const CSRF_COOKIE_NAME = 'oc_csrf';
const CSRF_SECRET = process.env.OPENCLAW_COOKIE_SECRET || '';

if (!CSRF_SECRET) {
  throw new Error('OPENCLAW_COOKIE_SECRET environment variable is not set');
}

/**
 * Generate a CSRF token tied to a sessionId.
 * Format: <randomNonce_hex>:<timestamp>:<hmac(sessionId:nonce:timestamp)>
 * All three parts are verified — the nonce is included in the HMAC input,
 * so each token is single-use-safe even if the session is the same.
 */
export function generateCsrfToken(sessionId: string): string {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${nonce}:${timestamp}`;
  const sig = createHmac('sha256', CSRF_SECRET).update(data).digest('hex');
  return `${nonce}:${timestamp}:${sig}`;
}

/**
 * Verify a CSRF token against a sessionId.
 */
export function verifyCsrfToken(sessionId: string, token: string): boolean {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return false;
    const [nonce, timestamp, sig] = parts as [string, string, string];

    // Reject tokens older than 2 hours
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age > 2 * 60 * 60 * 1000) return false;

    const data = `${sessionId}:${nonce}:${timestamp}`;
    const expected = createHmac('sha256', CSRF_SECRET).update(data).digest('hex');

    const eBuf = Buffer.from(expected, 'hex');
    const sBuf = Buffer.from(sig, 'hex');
    if (eBuf.length !== sBuf.length) return false;

    return timingSafeEqual(eBuf, sBuf);
  } catch {
    return false;
  }
}

/**
 * CSRF protection middleware.
 * Validates CSRF token on write operations (POST, PUT, DELETE, PATCH).
 * Uses userId as the session binding (production should use session JTI).
 */
export async function csrfProtect(c: Context, next: Next): Promise<void> {
  const method = c.req.method;

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }

  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    await next();
    return;
  }

  const csrfToken =
    c.req.header('x-csrf-token') ??
    (c.req.header('content-type')?.includes('application/x-www-form-urlencoded')
      ? (await c.req.formData()).get('_csrf')?.toString()
      : undefined);

  if (!csrfToken) {
    return c.json({ error: 'CSRF token missing' }, 403);
  }

  if (!verifyCsrfToken(team.userId, csrfToken)) {
    return c.json({ error: 'CSRF token invalid' }, 403);
  }

  await next();
}

/**
 * Helper for HTML templates to embed a CSRF token in a hidden form field.
 */
export function getCsrfTokenForTemplate(sessionId: string): string {
  return generateCsrfToken(sessionId);
}
```

---

## TASK 5 — Wire CSRF Middleware into app.ts
**File:** `src/services/gateway/src/app.ts`

Add the import and wire `csrfProtect` to all state-mutating protected routes.

At the top of the file, add this import after the existing imports:
```typescript
import { csrfProtect } from './csrf.js';
```

Then, on the lines that register the protected route middlewares, add `csrfProtect`:

Replace:
```typescript
app.use('/team/*', authMiddleware, requireAuth);
```
With:
```typescript
app.use('/team/*', authMiddleware, requireAuth, csrfProtect);
```

Replace:
```typescript
app.use('/files/*', authMiddleware, requireAuth);
```
With:
```typescript
app.use('/files/*', authMiddleware, requireAuth, csrfProtect);
```

Replace:
```typescript
app.use('/admin/channels/*', authMiddleware, requireAuth, requireAdmin);
```
With:
```typescript
app.use('/admin/channels/*', authMiddleware, requireAuth, requireAdmin, csrfProtect);
```

Replace:
```typescript
app.use('/secrets/*', authMiddleware, requireAuth, requireAdmin);
```
With:
```typescript
app.use('/secrets/*', authMiddleware, requireAuth, requireAdmin, csrfProtect);
```

Replace:
```typescript
app.use('/admin/*', authMiddleware, requireAuth, requireAdmin);
```
With:
```typescript
app.use('/admin/*', authMiddleware, requireAuth, requireAdmin, csrfProtect);
```

---

## TASK 6 — Wire Login Rate Limiting into Auth Routes
**File:** `src/services/gateway/src/auth/auth-routes.ts`

Add the import for the rate limiter at the top of the file (after the existing imports):
```typescript
import { checkLoginRateLimit } from '../rate-limit/rate-limit-middleware.js';
```

Then, inside the `POST /login` handler, add the rate limit check immediately after
the `body` is parsed (after the `if (!body.email || !body.password)` check):

Replace the block:
```typescript
  const user = await findUserByEmail(body.email);
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
```
With:
```typescript
  // Rate limit: 5 attempts per 15 min per IP+email, 10 per IP
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  const rlResult = await checkLoginRateLimit(ip, body.email);
  if (!rlResult.allowed) {
    return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
  }

  const user = await findUserByEmail(body.email);
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
```

---

## TASK 7 — Fix BullMQ Job HMAC Verification in Job Processor
**File:** `src/services/agent-worker/src/job-processor.ts`

The job processor never verifies the HMAC signature on the incoming job payload.
Add a local `verifyJobSignature` function and call it at the start of `processJob`.

Replace the entire file with:

```typescript
import { Job } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pino from 'pino';
import type { AgentJobPayload, TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { findUserById } from '@openclaw/enterprise-shared/db/queries.js';
import { resolveUserFiles } from './file-resolver-s3.js';
import type { ResolvedUserFiles } from './file-resolver-s3.js';
import { captureFileHashes, writeBackFiles } from './write-back.js';
import type { AgentOutput } from './write-back.js';
import { publishReply, publishStreamToken, publishStreamDone } from './stream-publisher.js';

const logger = pino({ name: 'job-processor' });

const QUEUE_SECRET = process.env.OPENCLAW_QUEUE_SECRET || '';

/**
 * Verify the HMAC-SHA256 signature on a BullMQ job payload.
 * Throws if the signature is missing or invalid.
 */
function verifyJobSignature(data: AgentJobPayload & { _sig?: string }): void {
  const { _sig, ...rest } = data;
  if (!_sig) {
    throw new Error('Job payload missing _sig — possible queue tampering');
  }
  if (!QUEUE_SECRET) {
    throw new Error('OPENCLAW_QUEUE_SECRET is not set — cannot verify job signature');
  }
  const expected = createHmac('sha256', QUEUE_SECRET).update(JSON.stringify(rest)).digest('hex');
  const eBuf = Buffer.from(expected, 'hex');
  const sBuf = Buffer.from(_sig, 'hex');
  if (eBuf.length !== sBuf.length || !timingSafeEqual(eBuf, sBuf)) {
    throw new Error('Job payload HMAC signature invalid — possible queue tampering');
  }
}

/**
 * Main job processor function called by BullMQ worker.
 */
export async function processJob(job: Job<AgentJobPayload & { _sig?: string }>): Promise<void> {
  const jobData = job.data;

  // STEP 0: Verify HMAC signature BEFORE doing any work
  try {
    verifyJobSignature(jobData);
  } catch (err) {
    logger.error({ jobId: job.id, err: (err as Error).message }, 'Job signature verification failed — discarding job');
    // Do NOT rethrow — we don't want BullMQ to retry a tampered job
    return;
  }

  const { userId, workspaceId, isAdmin, source, channel, threadId, sessionKey, text, attachments, replyChannel } = jobData;

  try {
    // Step 1: Fetch user from DB
    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Step 2: Resolve user files from S3
    const files = await resolveUserFiles(userId);

    // Step 3: Capture pre-hashes for write-back comparison
    const preHashes = await captureFileHashes(files);

    // Step 4: Build TeamCtx
    const teamCtx: TeamCtx = {
      userId,
      email: user.email,
      name: user.name,
      workspaceId,
      isAdmin,
      source: source as 'cookie' | 'api-token' | 'legacy-token',
    };

    // Step 5: Execute agent
    // The actual agent-command.ts call requires the main openclaw repo to be present.
    // When the openclaw core is available, replace this block with:
    //
    //   const result = await runAgentCommand({
    //     text,
    //     attachments,
    //     sessionKey,
    //     team: teamCtx,
    //     files,
    //     onToken: replyChannel
    //       ? (token: string) => publishStreamToken(replyChannel, token)
    //       : undefined,
    //   });
    //
    // For now, produce a minimal placeholder output so write-back runs correctly.
    const agentOutput: AgentOutput = {
      transcript: JSON.stringify([{ role: 'user', content: text }]),
      log: `Agent execution queued for session ${sessionKey} — awaiting agent-command integration`,
      preHashes,
    };

    // Step 6: Write back modified files to S3
    await writeBackFiles(userId, sessionKey, files, agentOutput);

    // Step 7: Publish streaming done signal (if browser client is connected)
    if (replyChannel) {
      await publishStreamDone(replyChannel);
    }

    // Step 8: Publish final reply to channel (WhatsApp / Telegram)
    await publishReply({
      sessionKey,
      channel,
      threadId,
      text: agentOutput.log,
      timestamp: new Date().toISOString(),
    });

    logger.info({ jobId: job.id, userId, sessionKey }, 'Job processed successfully');
  } catch (err) {
    logger.error({ jobId: job.id, userId, err: (err as Error).message }, 'Job processing failed');
    throw err; // Let BullMQ handle retries
  }
}
```

---

## TASK 8 — Fix Status Type Mismatch in Admin Routes
**File:** `src/services/gateway/src/admin/admin-routes.ts`

The `POST /admin/users/:id/status` handler accepts `'active' | 'suspended'` but the
`updateUserStatus` DB function accepts `'active' | 'disabled'`.
The `User` type in `team-ctx.ts` defines `status: 'active' | 'disabled'`.

Fix `admin-routes.ts` by aligning to `'active' | 'disabled'`:

Replace:
```typescript
  const body = await c.req.json<{ status: 'active' | 'suspended' }>();

  if (!body.status || !['active', 'suspended'].includes(body.status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }
```
With:
```typescript
  const body = await c.req.json<{ status: 'active' | 'disabled' }>();

  if (!body.status || !['active', 'disabled'].includes(body.status)) {
    return c.json({ error: 'Invalid status. Must be "active" or "disabled".' }, 400);
  }
```

---

## TASK 9 — Fix Invalid YAML in NetworkPolicy
**File:** `charts/openclaw/templates/networkpolicy.yaml`

Replace the entire file with valid Kubernetes NetworkPolicy YAML:

```yaml
{{- if .Values.networkPolicies.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: gateway-networkpolicy
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: gateway
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
        - podSelector:
            matchLabels:
              app: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
        - protocol: TCP
          port: 8081
  egress:
    - ports:
        - protocol: UDP
          port: 53
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: minio
      ports:
        - protocol: TCP
          port: 9000
        - protocol: TCP
          port: 9001
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: agent-worker-networkpolicy
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: agent-worker
  policyTypes:
    - Egress
  egress:
    - ports:
        - protocol: UDP
          port: 53
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: minio
      ports:
        - protocol: TCP
          port: 9000
        - protocol: TCP
          port: 9001
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: infra-postgres-networkpolicy
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: gateway
        - podSelector:
            matchLabels:
              app: agent-worker
      ports:
        - protocol: TCP
          port: 5432
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: infra-redis-networkpolicy
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: redis
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: gateway
        - podSelector:
            matchLabels:
              app: agent-worker
      ports:
        - protocol: TCP
          port: 6379
{{- end }}
```

---

## TASK 10 — Create Missing Helm Chart Files
**Files to create:**
- `charts/openclaw/Chart.yaml`
- `charts/openclaw/values.yaml`
- `charts/openclaw/templates/gateway-deployment.yaml`
- `charts/openclaw/templates/agent-worker-deployment.yaml`
- `charts/openclaw/templates/services.yaml`
- `charts/openclaw/templates/hpa.yaml`
- `charts/openclaw/templates/configmap.yaml`
- `charts/openclaw/templates/bootstrap-job.yaml`

### `charts/openclaw/Chart.yaml`
```yaml
apiVersion: v2
name: openclaw
description: OpenClaw Enterprise — Kubernetes Helm chart
type: application
version: 0.1.0
appVersion: "1.0.0"
```

### `charts/openclaw/values.yaml`
```yaml
replicaCount:
  gateway: 2
  agentWorker: 2

image:
  gateway:
    repository: openclaw/gateway
    tag: latest
    pullPolicy: IfNotPresent
  agentWorker:
    repository: openclaw/agent-worker
    tag: latest
    pullPolicy: IfNotPresent

gateway:
  port: 3000
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 1000m
      memory: 512Mi

agentWorker:
  concurrency: 5
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2000m
      memory: 1Gi

hpa:
  gateway:
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
  agentWorker:
    minReplicas: 2
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70

networkPolicies:
  enabled: true

env:
  DATABASE_URL: ""
  REDIS_URL: ""
  S3_ENDPOINT: ""
  AWS_ACCESS_KEY_ID: ""
  AWS_SECRET_ACCESS_KEY: ""
  AWS_REGION: "us-east-1"
  OPENCLAW_S3_BUCKET: "openclaw"
  OPENCLAW_QUEUE_SECRET: ""
  OPENCLAW_COOKIE_SECRET: ""
  OPENCLAW_SECRETS_KEY: ""
  OPENCLAW_JWT_PRIVATE_KEY: ""
  OPENCLAW_JWT_PUBLIC_KEY: ""
  OPENCLAW_GATEWAY_TOKEN: ""
  OPENCLAW_TEAM_ADMIN_EMAIL: "admin@openclaw.local"
  OPENCLAW_TEAM_ADMIN_PASSWORD: ""
  OPENCLAW_PUBLIC_BASE_URL: ""
  OPENAI_API_KEY: ""
  ANTHROPIC_API_KEY: ""
  TELEGRAM_BOT_TOKEN: ""
  TELEGRAM_WEBHOOK_SECRET: ""
  WHATSAPP_ACCESS_TOKEN: ""
  WHATSAPP_PHONE_NUMBER_ID: ""
  WHATSAPP_APP_SECRET: ""
  WHATSAPP_VERIFY_TOKEN: ""
  NODE_ENV: "production"
```

### `charts/openclaw/templates/configmap.yaml`
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: openclaw-config
  namespace: {{ .Release.Namespace }}
data:
  NODE_ENV: {{ .Values.env.NODE_ENV | quote }}
  AWS_REGION: {{ .Values.env.AWS_REGION | quote }}
  OPENCLAW_S3_BUCKET: {{ .Values.env.OPENCLAW_S3_BUCKET | quote }}
  OPENCLAW_TEAM_ADMIN_EMAIL: {{ .Values.env.OPENCLAW_TEAM_ADMIN_EMAIL | quote }}
  OPENCLAW_PUBLIC_BASE_URL: {{ .Values.env.OPENCLAW_PUBLIC_BASE_URL | quote }}
  GATEWAY_PORT: {{ .Values.gateway.port | quote }}
  WORKER_CONCURRENCY: {{ .Values.agentWorker.concurrency | quote }}
  OPENCLAW_TEAM_MODE: "1"
```

### `charts/openclaw/templates/gateway-deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
  namespace: {{ .Release.Namespace }}
  labels:
    app: gateway
spec:
  replicas: {{ .Values.replicaCount.gateway }}
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
    spec:
      containers:
        - name: gateway
          image: "{{ .Values.image.gateway.repository }}:{{ .Values.image.gateway.tag }}"
          imagePullPolicy: {{ .Values.image.gateway.pullPolicy }}
          ports:
            - containerPort: {{ .Values.gateway.port }}
          envFrom:
            - configMapRef:
                name: openclaw-config
            - secretRef:
                name: openclaw-secrets
          resources:
            {{- toYaml .Values.gateway.resources | nindent 12 }}
          livenessProbe:
            httpGet:
              path: /health
              port: {{ .Values.gateway.port }}
            initialDelaySeconds: 15
            periodSeconds: 20
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: {{ .Values.gateway.port }}
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
```

### `charts/openclaw/templates/agent-worker-deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-worker
  namespace: {{ .Release.Namespace }}
  labels:
    app: agent-worker
spec:
  replicas: {{ .Values.replicaCount.agentWorker }}
  selector:
    matchLabels:
      app: agent-worker
  template:
    metadata:
      labels:
        app: agent-worker
    spec:
      containers:
        - name: agent-worker
          image: "{{ .Values.image.agentWorker.repository }}:{{ .Values.image.agentWorker.tag }}"
          imagePullPolicy: {{ .Values.image.agentWorker.pullPolicy }}
          ports:
            - containerPort: 9090
          envFrom:
            - configMapRef:
                name: openclaw-config
            - secretRef:
                name: openclaw-secrets
          resources:
            {{- toYaml .Values.agentWorker.resources | nindent 12 }}
          livenessProbe:
            httpGet:
              path: /health
              port: 9090
            initialDelaySeconds: 15
            periodSeconds: 20
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: 9090
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
```

### `charts/openclaw/templates/services.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: gateway
  namespace: {{ .Release.Namespace }}
  labels:
    app: gateway
spec:
  selector:
    app: gateway
  ports:
    - name: http
      port: 80
      targetPort: {{ .Values.gateway.port }}
  type: ClusterIP
---
apiVersion: v1
kind: Service
metadata:
  name: agent-worker
  namespace: {{ .Release.Namespace }}
  labels:
    app: agent-worker
spec:
  selector:
    app: agent-worker
  ports:
    - name: health
      port: 9090
      targetPort: 9090
  type: ClusterIP
```

### `charts/openclaw/templates/hpa.yaml`
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gateway-hpa
  namespace: {{ .Release.Namespace }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: gateway
  minReplicas: {{ .Values.hpa.gateway.minReplicas }}
  maxReplicas: {{ .Values.hpa.gateway.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.hpa.gateway.targetCPUUtilizationPercentage }}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-worker-hpa
  namespace: {{ .Release.Namespace }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-worker
  minReplicas: {{ .Values.hpa.agentWorker.minReplicas }}
  maxReplicas: {{ .Values.hpa.agentWorker.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.hpa.agentWorker.targetCPUUtilizationPercentage }}
```

### `charts/openclaw/templates/bootstrap-job.yaml`
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: openclaw-bootstrap
  namespace: {{ .Release.Namespace }}
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: bootstrap
          image: "{{ .Values.image.gateway.repository }}:{{ .Values.image.gateway.tag }}"
          command: ["node", "dist/bootstrap.js"]
          envFrom:
            - configMapRef:
                name: openclaw-config
            - secretRef:
                name: openclaw-secrets
```

---

## TASK 11 — Create Missing WebSocket Relay
**File to create:** `src/services/gateway/src/ws-relay.ts`

This file is required by EPIC 3 (AGENT-3). It relays LLM token streaming from
Redis Pub/Sub to connected browser WebSocket clients.

Create `src/services/gateway/src/ws-relay.ts` with:

```typescript
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pino from 'pino';

const logger = pino({ name: 'ws-relay' });

const QUEUE_SECRET = process.env.OPENCLAW_QUEUE_SECRET || '';

export interface WsClient {
  sessionKey: string;
  send: (data: string) => void;
  close: () => void;
}

// Map of sessionKey → set of connected WS clients
const clients = new Map<string, Set<WsClient>>();

let subscriber: ReturnType<typeof getRedis> | null = null;

/**
 * Verify HMAC signature on a stream message.
 */
function verifyStreamMessage(msg: Record<string, unknown>): boolean {
  if (!QUEUE_SECRET) return false;
  const { _sig, ...rest } = msg;
  if (typeof _sig !== 'string') return false;
  const expected = createHmac('sha256', QUEUE_SECRET).update(JSON.stringify(rest)).digest('hex');
  const eBuf = Buffer.from(expected, 'hex');
  const sBuf = Buffer.from(_sig, 'hex');
  if (eBuf.length !== sBuf.length) return false;
  return timingSafeEqual(eBuf, sBuf);
}

/**
 * Start the Redis Pub/Sub subscriber for LLM token streams.
 * Call once at gateway startup.
 */
export async function startWsRelay(): Promise<void> {
  const redis = getRedis();
  subscriber = redis.duplicate();

  await subscriber.psubscribe('agent:stream:*');

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    try {
      const msg = JSON.parse(message) as Record<string, unknown>;

      if (!verifyStreamMessage(msg)) {
        logger.warn({ channel }, 'Invalid HMAC on stream message — dropping');
        return;
      }

      const sessionKey = (msg.sessionKey as string) ?? '';
      const clientSet = clients.get(sessionKey);
      if (!clientSet || clientSet.size === 0) return;

      const payload = JSON.stringify({ type: msg.type, data: msg.data, timestamp: msg.timestamp });
      for (const client of clientSet) {
        try {
          client.send(payload);
          if (msg.type === 'done' || msg.type === 'error') {
            client.close();
          }
        } catch {
          clientSet.delete(client);
        }
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, channel }, 'WS relay error');
    }
  });

  logger.info('WS relay started (psubscribe agent:stream:*)');
}

/**
 * Register a WebSocket client for a session.
 * Call when a browser connects with a valid sessionKey.
 */
export function registerWsClient(client: WsClient): void {
  if (!clients.has(client.sessionKey)) {
    clients.set(client.sessionKey, new Set());
  }
  clients.get(client.sessionKey)!.add(client);
  logger.debug({ sessionKey: client.sessionKey }, 'WS client registered');
}

/**
 * Deregister a WebSocket client.
 * Call when a browser disconnects.
 */
export function deregisterWsClient(client: WsClient): void {
  clients.get(client.sessionKey)?.delete(client);
  logger.debug({ sessionKey: client.sessionKey }, 'WS client deregistered');
}

/**
 * Stop the relay (for graceful shutdown).
 */
export async function stopWsRelay(): Promise<void> {
  if (subscriber) {
    await subscriber.punsubscribe('agent:stream:*');
    await subscriber.quit();
    subscriber = null;
  }
}
```

---

## TASK 12 — Add TELEGRAM_WEBHOOK_SECRET to docker-compose.enterprise.yml
**File:** `docker-compose.enterprise.yml`

The `gateway` service environment block is missing `TELEGRAM_WEBHOOK_SECRET` and
`WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`.

In the `gateway` service `environment:` section, add these three lines after
`WHATSAPP_PHONE_NUMBER_ID: ${WHATSAPP_PHONE_NUMBER_ID}`:

```yaml
      TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET}
      WHATSAPP_APP_SECRET: ${WHATSAPP_APP_SECRET}
      WHATSAPP_VERIFY_TOKEN: ${WHATSAPP_VERIFY_TOKEN:-openclaw-verify}
```

---

## TASK 13 — Add AgentReplyMessage `_sig` Field to types
**File:** `src/services/shared/src/types/team-ctx.ts`

The `AgentReplyMessage` interface is missing the `_sig` field used for HMAC verification
in `channel-reply.ts`. Add it:

Replace:
```typescript
export interface AgentReplyMessage {
  sessionKey: string;
  channel: string;
  threadId: string;
  text: string;
  attachments?: AttachmentRef[];
  timestamp: string;
}
```
With:
```typescript
export interface AgentReplyMessage {
  sessionKey: string;
  channel: string;
  threadId: string;
  text: string;
  attachments?: AttachmentRef[];
  timestamp: string;
  _sig?: string;
}
```

---

## TASK 14 — Fix stream-publisher.ts publishReply Signing Order
**File:** `src/services/agent-worker/src/stream-publisher.ts`

The existing `publishReply` function calls `signMessage(reply)` where `reply` already
has no `_sig` field — this is actually correct signing order. However, the `signMessage`
function serializes the **entire object** including any `_sig` field if present in future
callers, which would break verification. Harden it by explicitly excluding `_sig`.

Replace the `signMessage` function (lines 24–27):
```typescript
function signMessage(msg: AgentStreamMessage | AgentReplyMessage): string {
  const payloadStr = JSON.stringify(msg);
  return createHmac('sha256', QUEUE_SECRET).update(payloadStr).digest('hex');
}
```
With:
```typescript
function signMessage(msg: AgentStreamMessage | (AgentReplyMessage & { _sig?: string })): string {
  const { _sig, ...rest } = msg as Record<string, unknown>;
  return createHmac('sha256', QUEUE_SECRET).update(JSON.stringify(rest)).digest('hex');
}
```

---

## TASK 15 — Verify all environment variable names are consistent

Check `.env.example` (if it exists in the root) and add the following missing variables
if they are not already present:

```
TELEGRAM_WEBHOOK_SECRET=your-telegram-webhook-secret
WHATSAPP_APP_SECRET=your-whatsapp-app-secret
WHATSAPP_VERIFY_TOKEN=openclaw-verify
```

If `.env.example` does not exist at the repo root, create it at `src/services/.env.example`
with the full set required:

```
# Database
DATABASE_URL=postgres://openclaw:openclaw@localhost:5432/openclaw

# Redis
REDIS_URL=redis://localhost:6379

# S3 / MinIO
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
OPENCLAW_S3_BUCKET=openclaw

# Queue security (HMAC key — generate with: openssl rand -hex 32)
OPENCLAW_QUEUE_SECRET=

# Session / CSRF security (generate with: openssl rand -hex 32)
OPENCLAW_COOKIE_SECRET=

# AES-256-GCM key for workspace secrets (32 bytes base64: openssl rand -base64 32)
OPENCLAW_SECRETS_KEY=

# JWT RS256 keys (generate with: openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem)
# Provide as single-line with \n escaped: awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem
OPENCLAW_JWT_PRIVATE_KEY=
OPENCLAW_JWT_PUBLIC_KEY=

# Legacy gateway token (optional — generate with: openssl rand -hex 32)
OPENCLAW_GATEWAY_TOKEN=

# Bootstrap admin
OPENCLAW_TEAM_ADMIN_EMAIL=admin@openclaw.local
OPENCLAW_TEAM_ADMIN_PASSWORD=

# Public URL
OPENCLAW_PUBLIC_BASE_URL=http://localhost:3000

# LLM providers (at least one required)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# WhatsApp Meta Cloud API
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=openclaw-verify

# Worker
GATEWAY_PORT=3000
WORKER_CONCURRENCY=5
OPENCLAW_TEAM_MODE=1
```

---

## VERIFICATION CHECKLIST

After implementing all tasks above, verify the following:

1. `auth-middleware.ts` — `verifyJwt` uses `audience: JWT_AUDIENCE` (not `JWT_ALGORITHM`)
2. `auth-middleware.ts` — legacy token uses `timingSafeEqual`
3. `channel-router.ts` — WhatsApp HMAC verification calls `verifyWhatsAppSignature` and returns 401 if missing/invalid
4. `channel-router.ts` — Telegram uses `timingSafeEqual` on secret token
5. `channel-router.ts` — both handlers call `checkWebhookRateLimit` and `checkSenderCooldown`
6. `channel-reply.ts` — uses `psubscribe` not `subscribe`, listens on `pmessage` not `message`
7. `channel-reply.ts` — HMAC verification uses dedicated `verifyReplyMessage` (not `verifyJobPayload`)
8. `csrf.ts` — no `require()` call anywhere, only ESM imports
9. `csrf.ts` — `generateCsrfToken` includes nonce in HMAC input
10. `app.ts` — `csrfProtect` is imported and applied to `/team/*`, `/files/*`, `/admin/*`, `/secrets/*`
11. `auth-routes.ts` — `checkLoginRateLimit` is called in `POST /login` before `findUserByEmail`
12. `job-processor.ts` — `verifyJobSignature` is called at the very start of `processJob`
13. `admin-routes.ts` — status field uses `'active' | 'disabled'` (not `'suspended'`)
14. `networkpolicy.yaml` — no plain English text in YAML arrays, passes `helm template` lint
15. `charts/openclaw/Chart.yaml` — exists and contains `apiVersion: v2`
16. `charts/openclaw/values.yaml` — exists with full values
17. All 6 Helm template files exist under `charts/openclaw/templates/`
18. `ws-relay.ts` — exists, uses `psubscribe`, verifies HMAC
19. `docker-compose.enterprise.yml` — includes `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
20. `types/team-ctx.ts` — `AgentReplyMessage` has `_sig?: string`
21. `stream-publisher.ts` — `signMessage` excludes `_sig` before serializing
