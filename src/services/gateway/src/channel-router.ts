import { Hono } from 'hono';
import { enqueueAgentJob, verifyJobPayload } from './queue-producer.js';
import { downloadWhatsAppAttachment, downloadTelegramAttachment } from './attachment-handler.js';
import type { AttachmentRef, AgentJobPayload } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { findChannelIdentity } from '@openclaw/enterprise-shared/db/queries.js';
import pino from 'pino';

const logger = pino({ name: 'channel-router' });

const router = new Hono();

/**
 * WhatsApp webhook handler.
 * POST /webhooks/whatsapp/:webhookId
 */
router.post('/webhooks/whatsapp/:webhookId', async (c) => {
  const webhookId = c.req.param('webhookId')!;
  const rawBody = await c.req.text();
  
  try {
    const payload = JSON.parse(rawBody);
    
    // Verify signature if provided (Meta X-Hub-Signature-256)
    const signature = c.req.header('x-hub-signature-256');
    if (signature) {
      // TODO: Verify WhatsApp signature
      logger.info({ webhookId }, 'WhatsApp webhook received (signature verification not yet implemented)');
    }
    
    // Handle message
    if (payload.entry && payload.entry[0]?.changes && payload.entry[0].changes[0]?.value) {
      const value = payload.entry[0].changes[0].value;
      
      if (value.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const phone = message.from;
        const text = message.text?.body || '';
        
        // Find user identity
        const identity = await findChannelIdentity('whatsapp', phone);
        
        if (!identity) {
          logger.warn({ phone, webhookId }, 'WhatsApp message from unknown identity');
          return c.json({ error: 'Identity not linked' }, 404);
        }
        
        // Handle attachments
        const attachments: AttachmentRef[] = [];
        if (message.type === 'image' || message.type === 'document' || message.type === 'audio') {
          const mediaId = message[message.type]?.id;
          const mimeType = message[message.type]?.mime_type || 'application/octet-stream';
          
          if (mediaId) {
            const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
            if (accessToken) {
              const attachment = await downloadWhatsAppAttachment(identity.userId, mediaId, mimeType, accessToken);
              if (attachment) {
                attachments.push(attachment);
              }
            }
          }
        }
        
        // Enqueue agent job
        const jobPayload: AgentJobPayload = {
          userId: identity.userId,
          workspaceId: null,
          isAdmin: false,
          source: 'webhook',
          channel: 'whatsapp',
          threadId: phone,
          sessionKey: `${phone}_${Date.now()}`,
          text,
          attachments,
          webhookMessageId: message.id,
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
 * Telegram webhook handler.
 * POST /webhooks/telegram/:webhookId
 */
router.post('/webhooks/telegram/:webhookId', async (c) => {
  const webhookId = c.req.param('webhookId')!;
  const rawBody = await c.req.text();
  
  try {
    const payload = JSON.parse(rawBody);
    
    // Verify signature if provided (Telegram X-Telegram-Bot-Api-Secret-Token)
    const secretToken = c.req.header('x-telegram-bot-api-secret-token');
    const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken && expectedToken && secretToken !== expectedToken) {
      logger.warn({ webhookId }, 'Telegram webhook signature verification failed');
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    if (payload.message) {
      const message = payload.message;
      const chatId = String(message.chat.id);
      const text = message.text || '';
      
      // Find user identity
      const identity = await findChannelIdentity('telegram', chatId);
      
      if (!identity) {
        logger.warn({ chatId, webhookId }, 'Telegram message from unknown identity');
        return c.json({ error: 'Identity not linked' }, 404);
      }
      
      // Handle attachments
      const attachments: AttachmentRef[] = [];
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      
      if (message.photo && botToken) {
        const photo = message.photo[message.photo.length - 1]; // Largest size
        const attachment = await downloadTelegramAttachment(identity.userId, photo.file_id, 'image/jpeg', botToken);
        if (attachment) {
          attachments.push(attachment);
        }
      } else if (message.document && botToken) {
        const attachment = await downloadTelegramAttachment(identity.userId, message.document.file_id, message.document.mime_type, botToken);
        if (attachment) {
          attachments.push(attachment);
        }
      } else if (message.voice && botToken) {
        const attachment = await downloadTelegramAttachment(identity.userId, message.voice.file_id, 'audio/ogg', botToken);
        if (attachment) {
          attachments.push(attachment);
        }
      }
      
      // Enqueue agent job
      const jobPayload: AgentJobPayload = {
        userId: identity.userId,
        workspaceId: null,
        isAdmin: false,
        source: 'webhook',
        channel: 'telegram',
        threadId: chatId,
        sessionKey: `${chatId}_${Date.now()}`,
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
