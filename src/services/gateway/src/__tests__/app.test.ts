import { describe, it, expect } from 'vitest';
import app from '../app.js';

describe('app', () => {
  it('GET /health should return ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gateway');
  });

  it('GET /unknown should return 404', async () => {
    const res = await app.request('/unknown');
    expect(res.status).toBe(404);
  });
});
