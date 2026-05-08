import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { findChannelIdentity } from '@openclaw/enterprise-shared/db/queries.js';
import type { AgentReplyMessage } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { verifyJobPayload } from './queue-producer.js';
import pino from 'pino';

const logger = pino({ name: 'channel-reply' });

/**
 * Start the channel reply sender subscriber.
 * Subscribes to Redis Pub/Sub agent:reply:* channels and sends outbound messages.
 */
export async function startChannelReplySender(): Promise<void> {
  const redis = getRedis();
  const subscriber = redis.duplicate();
  
  await subscriber.subscribe('agent:reply:*');
  
  subscriber.on('message', async (channel, message) => {
    try {
      const reply: AgentReplyMessage = JSON.parse(message);
      
      // Verify HMAC signature if present
      if (reply._sig) {
        const isValid = verifyJobPayload(reply as any, reply._sig);
        if (!isValid) {
          logger.warn({ channel }, 'Invalid HMAC signature on reply');
          return;
        }
      }
      
      await sendChannelReply(reply);
    } catch (err) {
      logger.error({ err: (err as Error).message, channel }, 'Error processing reply');
    }
  });
  
  logger.info('Channel reply sender started');
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
    await sendWhatsAppReply(identity.userId, reply.threadId, reply.text, reply.attachments);
  } else if (reply.channel === 'telegram') {
    await sendTelegramReply(identity.userId, reply.threadId, reply.text, reply.attachments);
  }
}

/**
 * Send reply via WhatsApp Meta API.
 */
async function sendWhatsAppReply(
  userId: string,
  phone: string,
  text: string,
  attachments?: any[]
): Promise<void> {
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
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text },
        }),
      }
    );
    
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
async function sendTelegramReply(
  userId: string,
  chatId: string,
  text: string,
  attachments?: any[]
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, skipping Telegram reply');
    return;
  }
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      }
    );
    
    if (!response.ok) {
      logger.error({ userId, chatId, status: response.status }, 'Telegram API error');
      return;
    }
    
    logger.info({ userId, chatId }, 'Telegram reply sent');
  } catch (err) {
    logger.error({ err: (err as Error).message, userId, chatId }, 'Telegram send error');
  }
}
