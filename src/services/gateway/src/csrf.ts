import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const CSRF_COOKIE_NAME = 'oc_csrf';
const CSRF_SECRET = process.env.OPENCLAW_COOKIE_SECRET || '';

if (!CSRF_SECRET) {
  throw new Error('OPENCLAW_COOKIE_SECRET environment variable is not set');
}

/**
 * Generate a CSRF token tied to a sessionId.
 * Format: <randomNonce_hex>:<timestamp>:<hmac(sessionId:nonce:timestamp)>
 * All three parts are verified — the nonce is included in the HMAC input,
 * so each token is single-use-safe even if the session is the same.
 */
export function generateCsrfToken(sessionId: string): string {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${nonce}:${timestamp}`;
  const sig = createHmac('sha256', CSRF_SECRET).update(data).digest('hex');
  return `${nonce}:${timestamp}:${sig}`;
}

/**
 * Verify a CSRF token against a sessionId.
 */
export function verifyCsrfToken(sessionId: string, token: string): boolean {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return false;
    const [nonce, timestamp, sig] = parts as [string, string, string];

    // Reject tokens older than 2 hours
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age > 2 * 60 * 60 * 1000) return false;

    const data = `${sessionId}:${nonce}:${timestamp}`;
    const expected = createHmac('sha256', CSRF_SECRET).update(data).digest('hex');

    const eBuf = Buffer.from(expected, 'hex');
    const sBuf = Buffer.from(sig, 'hex');
    if (eBuf.length !== sBuf.length) return false;

    return timingSafeEqual(eBuf, sBuf);
  } catch {
    return false;
  }
}

/**
 * CSRF protection middleware.
 * Validates CSRF token on write operations (POST, PUT, DELETE, PATCH).
 * Uses userId as the session binding (production should use session JTI).
 */
export async function csrfProtect(c: Context, next: Next): Promise<void> {
  const method = c.req.method;

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }

  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    await next();
    return;
  }

  const csrfToken =
    c.req.header('x-csrf-token') ??
    (c.req.header('content-type')?.includes('application/x-www-form-urlencoded')
      ? (await c.req.formData()).get('_csrf')?.toString()
      : undefined);

  if (!csrfToken) {
    return c.json({ error: 'CSRF token missing' }, 403);
  }

  if (!verifyCsrfToken(team.userId, csrfToken)) {
    return c.json({ error: 'CSRF token invalid' }, 403);
  }

  await next();
}

/**
 * Helper for HTML templates to embed a CSRF token in a hidden form field.
 */
export function getCsrfTokenForTemplate(sessionId: string): string {
  return generateCsrfToken(sessionId);
}
