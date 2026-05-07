import { jwtVerify, importSPKI, importPKCS8, SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { findUserById, findApiTokenByHash, touchApiTokenLastUsed } from '@openclaw/enterprise-shared/db/queries.js';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const JWT_ALGORITHM = 'RS256';
const JWT_ISSUER = 'openclaw-gateway';
const JWT_AUDIENCE = 'openclaw-team';
const JWT_MAX_AGE_SEC = 86400; // 24 hours

let publicKeyCache: CryptoKey | null = null;
let privateKeyCache: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (publicKeyCache) return publicKeyCache;
  const pem = process.env.OPENCLAW_JWT_PUBLIC_KEY!;
  publicKeyCache = await importSPKI(pem, JWT_ALGORITHM);
  return publicKeyCache;
}

async function getPrivateKey(): Promise<CryptoKey> {
  if (privateKeyCache) return privateKeyCache;
  const pem = process.env.OPENCLAW_JWT_PRIVATE_KEY!;
  privateKeyCache = await importPKCS8(pem, JWT_ALGORITHM);
  return privateKeyCache;
}

export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(`${JWT_MAX_AGE_SEC}s`)
    .sign(privateKey);
}


async function verifyJwt(token: string): Promise<Record<string, unknown>> {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: JWT_ISSUER,
    audience: JWT_ALGORITHM,
    clockTolerance: 60,
  });
  return payload as Record<string, unknown>;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface AuthContext {
  team: TeamCtx | null;
  csrfToken: string;
}

/**
 * Middleware that populates `c.get('team')` with a valid TeamCtx or null.
 * Checks three credential paths:
 *  1. JWT cookie (oc_session)
 *  2. API token (ocp_*) via Authorization: Bearer
 *  3. Legacy gateway token (OPENCLAW_GATEWAY_TOKEN env var)
 */
export async function authMiddleware(c: any, next: () => Promise<void>): Promise<void> {
  let teamCtx: TeamCtx | null = null;

  // --- Path 1: JWT cookie ---
  const cookieHeader = c.req.header('cookie') ?? '';
  const cookieMatch = cookieHeader.match(/oc_session=([^;]+)/);
  if (cookieMatch) {
    try {
      const jwtPayload = await verifyJwt(cookieMatch[1]!);
      const userId = jwtPayload.sub as string;
      const sessionHash = jwtPayload.sid as string;
      if (userId && sessionHash) {
        // Check Redis revocation cache
        const redis = getRedis();
        const revoked = await redis.get(`session_revoked:${sessionHash}`);
        if (!revoked) {
          const user = await findUserById(userId);
          if (user && user.status === 'active') {
            teamCtx = {
              userId: user.id,
              email: user.email,
              name: user.name,
              isAdmin: user.isAdmin,
              workspaceId: user.workspaceId,
              source: 'cookie',
            };
          }
        }
      }
    } catch {
      /* invalid JWT — fall through */
    }
  }

  // --- Path 2: API token ---
  const authHeader = c.req.header('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(ocp_[a-f0-9]{64})$/i);
  if (!teamCtx && bearerMatch) {
    const rawToken = bearerMatch[1]!;
    const tokenHash = hashToken(rawToken);
    const redis = getRedis();
    const cachedUserId = await redis.get(`api_token:${tokenHash}`);
    if (cachedUserId) {
      const user = await findUserById(cachedUserId);
      if (user && user.status === 'active') {
        teamCtx = {
          userId: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
          workspaceId: user.workspaceId,
          source: 'api-token',
        };
      }
    } else {
      const apiToken = await findApiTokenByHash(tokenHash);
      if (apiToken) {
        // Cache hit for next request
        await redis.setex(`api_token:${tokenHash}`, 60, apiToken.userId);
        // Fire-and-forget update last_used_at
        touchApiTokenLastUsed(tokenHash).catch(() => {});
        const user = await findUserById(apiToken.userId);
        if (user && user.status === 'active') {
          teamCtx = {
            userId: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            workspaceId: user.workspaceId,
            source: 'api-token',
          };
        }
      }
    }
  }

  // --- Path 3: Legacy gateway token ---
  const legacyMatch = authHeader.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!teamCtx && legacyMatch) {
    const legacyToken = legacyMatch[1]!;
    const expected = process.env.OPENCLAW_GATEWAY_TOKEN;
    if (expected && legacyToken === expected) {
      // Legacy tokens are treated as a synthetic admin user with userId = 'legacy'
      teamCtx = {
        userId: 'legacy',
        email: 'legacy@openclaw.local',
        name: 'Legacy Gateway',
        isAdmin: true,
        workspaceId: null,
        source: 'legacy-token',
      };
    }
  }

  // Generate CSRF token for all authenticated contexts (and unauthenticated for forms)
  const csrfToken = randomBytes(32).toString('hex');

  c.set('team', teamCtx);
  c.set('csrfToken', csrfToken);
  await next();
}

/**
 * Require authentication — returns 401 if no valid team context.
 */
export function requireAuth(c: any, next: () => Promise<void>): Promise<void> {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
}

/**
 * Require admin privileges — returns 403 if not admin.
 */
export function requireAdmin(c: any, next: () => Promise<void>): Promise<void> {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
}
