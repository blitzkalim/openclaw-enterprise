import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import secretRoutes from '../secrets/secret-routes.js';

describe('secret-routes', () => {
  it('POST / should reject non-admin', async () => {
    const app = new Hono();
    app.route('/secrets', secretRoutes);
    const res = await app.request('/secrets', {
      method: 'POST',
      body: JSON.stringify({ secretType: 'api_key', plaintext: 'supersecret' }),
    });
    expect(res.status).toBe(403);
  });

  it('GET / should reject non-admin', async () => {
    const app = new Hono();
    app.route('/secrets', secretRoutes);
    const res = await app.request('/secrets');
    expect(res.status).toBe(403);
  });

  it('GET /:secretType should reject non-admin', async () => {
    const app = new Hono();
    app.route('/secrets', secretRoutes);
    const res = await app.request('/secrets/api_key');
    expect(res.status).toBe(403);
  });
});
