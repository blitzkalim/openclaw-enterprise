import { Hono } from 'hono';
import { listChannelIdentitiesByUser, findChannelClaimByCode, claimChannelClaim, findUserById } from '@openclaw/enterprise-shared/db/queries.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const app = new Hono();

/**
 * GET /channels
 * List linked channel identities for the current user.
 * Requires authMiddleware.
 */
app.get('/', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const identities = await listChannelIdentitiesByUser(team.userId);
  return c.json(identities, 200);
});

/**
 * POST /channels/claim
 * Body: { claimCode: string }
 * Claim a pre-created channel claim by code.
 * Requires authMiddleware.
 */
app.post('/claim', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ claimCode: string }>();
  if (!body.claimCode || typeof body.claimCode !== 'string') {
    return c.json({ error: 'Missing claim code' }, 400);
  }

  const claim = await findChannelClaimByCode(body.claimCode);
  if (!claim) {
    return c.json({ error: 'Invalid claim code' }, 404);
  }

  if (claim.claimedBy) {
    return c.json({ error: 'Claim already used' }, 409);
  }

  if (claim.expiresAt < new Date()) {
    return c.json({ error: 'Claim expired' }, 410);
  }

  const user = await findUserById(team.userId);
  if (!user || user.status !== 'active') {
    return c.json({ error: 'User not active' }, 403);
  }

  await claimChannelClaim(claim.id, team.userId);
  return c.json({ ok: true, channel: claim.channel, externalId: claim.externalId }, 200);
});

export default app;
