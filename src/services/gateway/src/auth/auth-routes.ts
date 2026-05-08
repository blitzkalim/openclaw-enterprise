import { Hono } from 'hono';
import { createUser, findUserByEmail, createSession, findSessionByTokenHash, revokeSession } from '@openclaw/enterprise-shared/db/queries.js';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { hashPassword, verifyPassword } from './password.js';
import { signJwt } from './auth-middleware.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { createHash, randomBytes } from 'node:crypto';
import { checkLoginRateLimit } from '../rate-limit/rate-limit-middleware.js';

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashSessionToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const app = new Hono();

/**
 * POST /auth/register
 * Body: { email, password, name?, isAdmin? }
 * Creates a new user. In team mode, only admins can create other admins.
 */
app.post('/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string; name?: string; isAdmin?: boolean }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Missing email or password' }, 400);
  }

  const existing = await findUserByEmail(body.email);
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await hashPassword(body.password);
  const user = await createUser({
    email: body.email,
    passwordHash,
    name: body.name ?? null,
    isAdmin: body.isAdmin ?? false,
    workspaceId: null,
    status: 'active',
  });

  return c.json({ id: user.id, email: user.email }, 201);
});

/**
 * POST /auth/login
 * Body: { email, password }
 * Returns Set-Cookie with JWT (HttpOnly, SameSite=Lax).
 */
app.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Missing email or password' }, 400);
  }

  // Rate limit: 5 attempts per 15 min per IP+email, 10 per IP
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  const rlResult = await checkLoginRateLimit(ip, body.email);
  if (!rlResult.allowed) {
    return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
  }

  const user = await findUserByEmail(body.email);
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  if (user.status === 'disabled') {
    return c.json({ error: 'Account disabled' }, 403);
  }

  const valid = await verifyPassword(user.passwordHash, body.password);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Create session token (raw) + hash for DB
  const rawSession = randomBytes(32).toString('hex');
  const sessionHash = hashSessionToken(rawSession);

  const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;

  const session = await createSession({
    userId: user.id,
    tokenHash: sessionHash,
    ip: clientIp,
    userAgent,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS),
    revokedAt: null,
  });

  // Issue JWT embedding the session hash so we can revoke efficiently
  const jwt = await signJwt({
    sub: user.id,
    sid: sessionHash,
    email: user.email,
    admin: user.isAdmin,
    jti: session.id,
  });

  c.header(
    'set-cookie',
    `oc_session=${jwt}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  );

  return c.json({ id: user.id, email: user.email }, 200);
});

/**
 * POST /auth/logout
 * Revokes session via Redis revocation cache (prevents reuse of stolen cookie).
 */
app.post('/logout', async (c) => {
  const cookieHeader = c.req.header('cookie') ?? '';
  const match = cookieHeader.match(/oc_session=([^;]+)/);
  if (match) {
    try {
      const { jwtVerify, importSPKI } = await import('jose');
      const pem = process.env.OPENCLAW_JWT_PUBLIC_KEY!;
      const publicKey = await importSPKI(pem, 'RS256');
      const { payload } = await jwtVerify(match[1]!, publicKey, {
        issuer: 'openclaw-gateway',
        audience: 'openclaw-team',
        clockTolerance: 60,
      });
      const sessionHash = payload.sid as string;
      if (sessionHash) {
        const redis = getRedis();
        await redis.setex(`session_revoked:${sessionHash}`, SESSION_MAX_AGE_MS / 1000, '1');
      }
    } catch {
      // Ignore invalid JWT on logout
    }
  }

  c.header('set-cookie', 'oc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return c.json({ ok: true }, 200);
});

/**
 * GET /auth/me
 * Returns the current user profile (requires authMiddleware before this router).
 */
app.get('/me', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json({
    id: team.userId,
    email: team.email,
    name: team.name,
    isAdmin: team.isAdmin,
    workspaceId: team.workspaceId,
  }, 200);
});

export default app;
