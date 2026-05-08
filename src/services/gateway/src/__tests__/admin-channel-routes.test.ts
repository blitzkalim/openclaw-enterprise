import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import adminChannelRoutes from '../channels/admin-channel-routes.js';

describe('admin-channel-routes', () => {
  it('POST /claims should reject non-admin', async () => {
    const app = new Hono();
    app.route('/admin/channels', adminChannelRoutes);
    const res = await app.request('/admin/channels/claims', {
      method: 'POST',
      body: JSON.stringify({ channel: 'whatsapp', externalId: '+1234567890' }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /cleanup should reject non-admin', async () => {
    const app = new Hono();
    app.route('/admin/channels', adminChannelRoutes);
    const res = await app.request('/admin/channels/cleanup', { method: 'POST' });
    expect(res.status).toBe(403);
  });
});
