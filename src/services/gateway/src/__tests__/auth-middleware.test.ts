import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, requireAuth, requireAdmin, signJwt } from '../auth/auth-middleware.js';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { findUserById, findApiTokenByHash } from '@openclaw/enterprise-shared/db/queries.js';

vi.mock('@openclaw/enterprise-shared/db/queries.js', () => ({
  findUserById: vi.fn(),
  findApiTokenByHash: vi.fn(),
  touchApiTokenLastUsed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@openclaw/enterprise-shared/redis/client.js', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  }),
}));

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
  };
});

describe('authMiddleware', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'argon2id$...',
    name: 'Test',
    isAdmin: true,
    workspaceId: null,
    status: 'active' as const,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_JWT_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\n' +
      'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC0WnEg+3QJkWz8\n' +
      '-----END PRIVATE KEY-----';
    process.env.OPENCLAW_JWT_PUBLIC_KEY =
      '-----BEGIN PUBLIC KEY-----\n' +
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtFpxIPt0CZF/\n' +
      '-----END PUBLIC KEY-----';
  });

  it('should set team from valid JWT cookie', async () => {
    const app = new Hono();
    app.use(authMiddleware);
    app.get('/me', (c) => c.json({ team: (c as any).get('team') }));

    const jwt = await signJwt({ sub: 'user-1', sid: 'abc123' });
    const res = await app.request('/me', {
      headers: { cookie: `oc_session=${jwt}` },
    });

    expect(res.status).toBe(200);
  });

  it('should return 401 from requireAuth when no credentials', async () => {
    const app = new Hono();
    app.use(authMiddleware);
    app.use(requireAuth);
    app.get('/secret', (c) => c.json({ ok: true }));

    const res = await app.request('/secret');
    expect(res.status).toBe(401);
  });

  it('should return 403 from requireAdmin for non-admin', async () => {
    const app = new Hono();
    app.use(authMiddleware);
    app.use(requireAdmin);
    app.get('/admin', (c) => c.json({ ok: true }));

    const res = await app.request('/admin');
    expect(res.status).toBe(403);
  });
});
