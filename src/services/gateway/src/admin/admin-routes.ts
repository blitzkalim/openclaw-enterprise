import { Hono } from 'hono';
import { listUsers, findUserById, updateUserStatus } from '@openclaw/enterprise-shared/db/queries.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const app = new Hono();

/**
 * GET /admin/users
 * Admin-only: List all users with pagination.
 */
app.get('/users', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const users = await listUsers();
  const sanitized = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    status: u.status,
    workspaceId: u.workspaceId,
    createdAt: u.createdAt,
  }));

  return c.json(sanitized, 200);
});

/**
 * GET /admin/users/:id
 * Admin-only: Get a specific user.
 */
app.get('/users/:id', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const user = await findUserById(id);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      status: user.status,
      workspaceId: user.workspaceId,
      createdAt: user.createdAt,
    },
    200,
  );
});

/**
 * POST /admin/users/:id/status
 * Body: { status: 'active' | 'suspended' }
 * Admin-only: Update user status.
 */
app.post('/users/:id/status', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team || !team.isAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{ status: 'active' | 'disabled' }>();

  if (!body.status || !['active', 'disabled'].includes(body.status)) {
    return c.json({ error: 'Invalid status. Must be "active" or "disabled".' }, 400);
  }

  if (id === team.userId) {
    return c.json({ error: 'Cannot change own status' }, 400);
  }

  await updateUserStatus(id, body.status);
  return c.json({ ok: true }, 200);
});

export default app;
