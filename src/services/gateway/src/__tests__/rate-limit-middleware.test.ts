import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimitMiddleware } from '../rate-limit/rate-limit-middleware.js';

vi.mock('@openclaw/enterprise-shared/redis/client.js', () => ({
  getRedis: vi.fn().mockReturnValue({
    incr: vi.fn().mockResolvedValue(1),
    pexpire: vi.fn().mockResolvedValue(true),
    pttl: vi.fn().mockResolvedValue(30000),
  }),
}));

vi.mock('@openclaw/enterprise-shared/db/queries.js', () => ({
  logRateLimit: vi.fn().mockResolvedValue(undefined),
}));

describe('rate-limit-middleware', () => {
  it('should allow requests under the limit', async () => {
    const app = new Hono();
    app.use(rateLimitMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
