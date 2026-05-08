import type { Context, Next } from 'hono';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';

/**
 * Generic rate limiter using sliding window algorithm.
 * @param key - Redis key prefix (e.g., 'login', 'webhook')
 * @param identifier - Unique identifier (e.g., IP, email, externalId)
 * @param maxRequests - Maximum requests allowed in window
 * @param windowMs - Window duration in milliseconds
 */
export async function checkRateLimit(
  key: string,
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const redisKey = `rl:${key}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Remove old entries outside the window
  await redis.zremrangebyscore(redisKey, 0, windowStart);

  // Count requests in current window
  const count = await redis.zcard(redisKey);

  if (count >= maxRequests) {
    // Calculate reset time (oldest entry in window)
    const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetAt = oldest.length > 1 ? parseInt(oldest[1]!, 10) + windowMs : now + windowMs;
    return { allowed: false, remaining: 0, resetAt };
  }

  // Add current request
  await redis.zadd(redisKey, now, `${now}-${Math.random()}`);
  await redis.expire(redisKey, Math.ceil(windowMs / 1000) + 1);

  return { allowed: true, remaining: maxRequests - count - 1, resetAt: now + windowMs };
}

/**
 * Login rate limiter (per IP + email).
 * 5 attempts per 15 minutes per IP/email combination.
 */
export async function checkLoginRateLimit(ip: string, email?: string): Promise<{ allowed: boolean }> {
  if (email) {
    const result = await checkRateLimit('login', `${ip}:${email}`, 5, 15 * 60 * 1000);
    if (!result.allowed) return { allowed: false };
  }
  
  const result = await checkRateLimit('login', ip, 10, 15 * 60 * 1000);
  return { allowed: result.allowed };
}

/**
 * Webhook burst limiter (per IP).
 * 100 requests per minute per IP.
 */
export async function checkWebhookRateLimit(ip: string): Promise<{ allowed: boolean }> {
  const result = await checkRateLimit('webhook', ip, 100, 60 * 1000);
  return { allowed: result.allowed };
}

/**
 * Per-sender cooldown (per externalId).
 * 1 request per 10 seconds per sender (externalId).
 */
export async function checkSenderCooldown(externalId: string): Promise<{ allowed: boolean }> {
  const redis = getRedis();
  const key = `rl:msg:${externalId}`;
  const lastRequest = await redis.get(key);
  
  if (lastRequest) {
    const elapsed = Date.now() - parseInt(lastRequest, 10);
    if (elapsed < 10000) { // 10 seconds
      return { allowed: false };
    }
  }
  
  await redis.setex(key, 10, Date.now().toString());
  return { allowed: true };
}

/**
 * Global rate limit middleware (basic IP-based).
 * 100 requests per minute per IP.
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const result = await checkRateLimit('global', ip, 100, 60 * 1000);

  if (!result.allowed) {
    c.header('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
    c.header('X-RateLimit-Limit', '100');
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    return c.json({ error: 'Too many requests' }, 429);
  }

  c.header('X-RateLimit-Limit', '100');
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  await next();
}
