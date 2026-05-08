import type { Context, Next } from 'hono';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { logRateLimit } from '@openclaw/enterprise-shared/db/queries.js';

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // per minute per IP

export async function rateLimitMiddleware(c: Context, next: Next) {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const redis = getRedis();
  const key = `rate_limit:${ip}`;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.pexpire(key, WINDOW_MS);
  }

  if (current > MAX_REQUESTS) {
    const remaining = await redis.pttl(key);
    c.header('Retry-After', String(Math.ceil(remaining / 1000)));
    await logRateLimit(ip, c.req.method, c.req.path, true);
    return c.json({ error: 'Too many requests' }, 429);
  }

  await logRateLimit(ip, c.req.method, c.req.path, false);
  await next();
}
