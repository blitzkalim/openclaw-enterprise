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
