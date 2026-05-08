import pino from 'pino';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import type { AgentReplyMessage } from '@openclaw/enterprise-shared/types/team-ctx.js';

const logger = pino({ name: 'stream-publisher' });

export interface AgentStreamMessage {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  sessionKey: string;
  data: string;
  timestamp: string;
}

/**
 * Publish a single LLM token to Redis Pub/Sub for streaming to browser.
 */
export async function publishStreamToken(replyChannel: string, token: string): Promise<void> {
  if (!replyChannel) return; // No-op for webhook channels (no streaming)

  const msg: AgentStreamMessage = {
    type: 'token',
    sessionKey: replyChannel.split(':').slice(2).join(':'),
    data: token,
    timestamp: new Date().toISOString(),
  };

  const redis = getRedis();
  await redis.publish(replyChannel, JSON.stringify(msg));
}

/**
 * Publish a 'done' message to signal end of streaming.
 */
export async function publishStreamDone(replyChannel: string): Promise<void> {
  if (!replyChannel) return;

  const msg: AgentStreamMessage = {
    type: 'done',
    sessionKey: replyChannel.split(':').slice(2).join(':'),
    data: '',
    timestamp: new Date().toISOString(),
  };

  const redis = getRedis();
  await redis.publish(replyChannel, JSON.stringify(msg));
}

/**
 * Publish the final agent reply to Redis Pub/Sub for channel delivery.
 */
export async function publishReply(reply: AgentReplyMessage): Promise<void> {
  const channel = `agent:reply:${reply.channel}:${reply.threadId}`;
  const redis = getRedis();
  await redis.publish(channel, JSON.stringify(reply));
  logger.info({ channel, threadId: reply.threadId }, 'Published reply');
}
