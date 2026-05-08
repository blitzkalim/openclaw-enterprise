import { Hono } from 'hono';
import { upsertWorkspaceSecret, findWorkspaceSecret, loadAllWorkspaceSecrets } from '@openclaw/enterprise-shared/db/queries.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { encrypt } from '@openclaw/enterprise-shared/crypto/secrets.js';

const app = new Hono();

/**
 * POST /secrets
 * Body: { secretType: string, plaintext: string }
 * Admin-only: Upsert an encrypted workspace secret.
 * Requires authMiddleware + requireAdmin.
 */
app.post('/', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{ secretType: string; plaintext: string }>();
  if (!body.secretType || typeof body.secretType !== 'string' || !body.plaintext || typeof body.plaintext !== 'string') {
    return c.json({ error: 'Missing secretType or plaintext' }, 400);
  }

  const workspaceId = team.workspaceId ?? 'default';
  const { ciphertext, iv } = encrypt(body.plaintext);

  await upsertWorkspaceSecret({
    workspaceId,
    secretType: body.secretType,
    encryptedHex: ciphertext,
    ivHex: iv,
  });

  return c.json({ ok: true, workspaceId, secretType: body.secretType }, 201);
});

/**
 * GET /secrets/:secretType
 * Admin-only: Retrieve an encrypted workspace secret (still encrypted — decryption should happen at the edge).
 * Requires authMiddleware + requireAdmin.
 */
app.get('/:secretType', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const secretType = c.req.param('secretType');
  const workspaceId = team.workspaceId ?? 'default';
  const secret = await findWorkspaceSecret(workspaceId, secretType);

  if (!secret) {
    return c.json({ error: 'Secret not found' }, 404);
  }

  return c.json({ secretType, workspaceId, encryptedVal: secret.encryptedVal, iv: secret.iv }, 200);
});

/**
 * GET /secrets
 * Admin-only: List all workspace secrets (metadata only, no encrypted values).
 * Requires authMiddleware + requireAdmin.
 */
app.get('/', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const all = await loadAllWorkspaceSecrets();
  const masked = all.map((s) => ({
    workspaceId: s.workspaceId,
    secretType: s.secretType,
    hasValue: Boolean(s.encryptedVal),
  }));

  return c.json(masked, 200);
});

export default app;
