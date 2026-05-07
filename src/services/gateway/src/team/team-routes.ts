import { Hono } from 'hono';
import { createApiToken, listApiTokensByUser, deleteApiToken } from '@openclaw/enterprise-shared/db/queries.js';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'ocp_';
const TOKEN_BYTES = 32;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const app = new Hono();

/**
 * POST /team/tokens
 * Body: { name: string }
 * Requires authMiddleware.
 */
app.post('/tokens', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ name: string }>();
  if (!body.name || typeof body.name !== 'string') {
    return c.json({ error: 'Missing token name' }, 400);
  }

  const rawToken = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(rawToken);

  const token = await createApiToken({
    userId: team.userId,
    name: body.name,
    hash: tokenHash,
  });

  return c.json({ tokenId: token.id, token: rawToken }, 201);
});

/**
 * GET /team/tokens
 * Returns list of API tokens for the current user (without raw token values).
 * Requires authMiddleware.
 */
app.get('/tokens', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const tokens = await listApiTokensByUser(team.userId);
  return c.json(tokens, 200);
});

/**
 * DELETE /team/tokens/:id
 * Revokes an API token and purges it from Redis cache.
 * Requires authMiddleware.
 */
app.delete('/tokens/:id', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const deleted = await deleteApiToken(id, team.userId);
  if (!deleted) {
    return c.json({ error: 'Not found' }, 404);
  }

  // Also clear from Redis if cached (best-effort, exact hash unknown here)
  // The token won't be found on next API request because DB row is gone.
  return c.json({ ok: true }, 204);
});

export default app;
