import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import teamRoutes from '../team/team-routes.js';

describe('team-routes', () => {
  it('POST /tokens should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/team', teamRoutes);
    const res = await app.request('/team/tokens', { method: 'POST', body: JSON.stringify({ name: 'test' }) });
    expect(res.status).toBe(401);
  });

  it('GET /tokens should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/team', teamRoutes);
    const res = await app.request('/team/tokens');
    expect(res.status).toBe(401);
  });
});

