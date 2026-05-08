import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import fileRoutes from '../files/file-routes.js';

describe('file-routes', () => {
  it('POST / should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/files', fileRoutes);
    const res = await app.request('/files', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('GET / should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/files', fileRoutes);
    const res = await app.request('/files');
    expect(res.status).toBe(401);
  });

  it('GET /:id should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/files', fileRoutes);
    const res = await app.request('/files/123');
    expect(res.status).toBe(401);
  });

  it('DELETE /:id should reject unauthenticated', async () => {
    const app = new Hono();
    app.route('/files', fileRoutes);
    const res = await app.request('/files/123', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
