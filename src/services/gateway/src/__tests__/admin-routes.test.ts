import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import adminRoutes from '../admin/admin-routes.js';

describe('admin-routes', () => {
  it('GET /admin/users should reject non-admin', async () => {
    const app = new Hono();
    app.route('/admin', adminRoutes);
    const res = await app.request('/admin/users');
    expect(res.status).toBe(403);
  });

  it('GET /admin/users/:id should reject non-admin', async () => {
    const app = new Hono();
    app.route('/admin', adminRoutes);
    const res = await app.request('/admin/users/123');
    expect(res.status).toBe(403);
  });

  it('POST /admin/users/:id/status should reject non-admin', async () => {
    const app = new Hono();
    app.route('/admin', adminRoutes);
    const res = await app.request('/admin/users/123/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'suspended' }),
    });
    expect(res.status).toBe(403);
  });
});
