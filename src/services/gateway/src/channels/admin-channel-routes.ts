import { Hono } from 'hono';
import { createChannelClaim, deleteExpiredClaims } from '@openclaw/enterprise-shared/db/queries.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { randomBytes } from 'node:crypto';

const CLAIM_CODE_BYTES = 16;
const CLAIM_EXPIRY_HOURS = 24;

const app = new Hono();

/**
 * POST /admin/channels/claims
 * Body: { channel: string, externalId: string, mode?: 'A' | 'B' | 'C', workspaceId?: string }
 * Admin-only: Create a channel claim code.
 * Requires authMiddleware + requireAdmin.
 */
app.post('/claims', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    channel: string;
    externalId: string;
    mode?: 'A' | 'B' | 'C';
    workspaceId?: string;
  }>();

  if (!body.channel || !body.externalId) {
    return c.json({ error: 'Missing channel or externalId' }, 400);
  }

  const claimCode = randomBytes(CLAIM_CODE_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + CLAIM_EXPIRY_HOURS * 60 * 60 * 1000);

  const claim = await createChannelClaim({
    channel: body.channel,
    externalId: body.externalId,
    claimCode,
    mode: body.mode ?? 'A',
    workspaceId: body.workspaceId ?? null,
    expiresAt,
    claimedBy: null,
  });

  return c.json(
    {
      claimId: claim.id,
      claimCode: claim.claimCode,
      channel: claim.channel,
      externalId: claim.externalId,
      expiresAt: claim.expiresAt,
    },
    201,
  );
});

/**
 * POST /admin/channels/cleanup
 * Admin-only: Delete expired channel claims.
 * Requires authMiddleware + requireAdmin.
 */
app.post('/cleanup', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await deleteExpiredClaims();
  return c.json({ ok: true }, 200);
});

export default app;
