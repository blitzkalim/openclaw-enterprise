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
