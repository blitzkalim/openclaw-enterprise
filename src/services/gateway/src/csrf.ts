import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const CSRF_COOKIE_NAME = 'oc_csrf';
const CSRF_SECRET = process.env.OPENCLAW_COOKIE_SECRET || '';

if (!CSRF_SECRET) {
  throw new Error('OPENCLAW_COOKIE_SECRET environment variable is not set');
}

/**
 * Generate a CSRF token for a session.
 */
export function generateCsrfToken(sessionId: string): string {
  const hmac = randomBytes(32);
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = createHmac(data);
  return `${Buffer.from(hmac).toString('base64')}:${timestamp}:${signature}`;
}

/**
 * Verify a CSRF token.
 */
export function verifyCsrfToken(sessionId: string, token: string): boolean {
  try {
    const [hmacB64, timestamp, signature] = token.split(':');
    if (!hmacB64 || !timestamp || !signature) {
      return false;
    }

    const hmac = Buffer.from(hmacB64, 'base64');
    const data = `${sessionId}:${timestamp}`;
    const expectedSignature = createHmac(data);

    // Use timing-safe comparison
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');

    if (sigBuf.length !== expectedBuf.length) {
      return false;
    }

    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Create HMAC signature.
 */
function createHmac(data: string): string {
  const crypto = require('node:crypto');
  return crypto.createHmac('sha256', CSRF_SECRET).update(data).digest('hex');
}

/**
 * CSRF protection middleware.
 * Validates CSRF token on write operations (POST, PUT, DELETE, PATCH).
 */
export async function csrfProtect(c: Context, next: Next): Promise<void> {
  const method = c.req.method;

  // Skip CSRF for GET, HEAD, OPTIONS
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }

  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    // If no auth, skip CSRF (auth middleware will handle it)
    await next();
    return;
  }

  // Get CSRF token from request
  const csrfToken = c.req.header('x-csrf-token') || (await c.req.formData()).get('_csrf');

  if (!csrfToken) {
    return c.json({ error: 'CSRF token missing' }, 403);
  }

  // Verify CSRF token (using session JTI as session ID)
  const sessionId = team.userId; // In production, this should be the session JTI
  const isValid = verifyCsrfToken(sessionId, csrfToken);

  if (!isValid) {
    return c.json({ error: 'CSRF token invalid' }, 403);
  }

  await next();
}

/**
 * CSRF token generation helper for templates.
 */
export function getCsrfTokenForTemplate(sessionId: string): string {
  return generateCsrfToken(sessionId);
}
