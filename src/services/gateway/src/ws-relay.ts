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
