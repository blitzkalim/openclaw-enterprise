import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import channelRoutes from '../channels/channel-routes.js';

describe('channel-routes', () => {
  it('GET / should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/channels', channelRoutes);
    const res = await app.request('/channels');
    expect(res.status).toBe(401);
  });

  it('POST /claim should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/channels', channelRoutes);
    const res = await app.request('/channels/claim', {
      method: 'POST',
      body: JSON.stringify({ claimCode: 'abc123' }),
    });
    expect(res.status).toBe(401);
  });
});
