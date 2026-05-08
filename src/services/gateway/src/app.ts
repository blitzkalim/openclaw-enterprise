import { Hono } from 'hono';
import { authMiddleware, requireAuth, requireAdmin } from './auth/auth-middleware.js';
import { getJwks } from './auth/jwks.js';
import authRoutes from './auth/auth-routes.js';
import teamRoutes from './team/team-routes.js';
import fileRoutes from './files/file-routes.js';
import channelRoutes from './channels/channel-routes.js';
import adminChannelRoutes from './channels/admin-channel-routes.js';
import secretRoutes from './secrets/secret-routes.js';
import adminRoutes from './admin/admin-routes.js';
import { rateLimitMiddleware } from './rate-limit/rate-limit-middleware.js';
import channelRouter from './channel-router.js';

const app = new Hono();

/**
 * Health check — always public.
 */
app.get('/health', (c) => c.json({ status: 'ok', service: 'gateway' }, 200));

/**
 * JWKS endpoint — always public (for JWT signature verification).
 */
app.get('/.well-known/jwks.json', async (c) => {
  const jwks = await getJwks();
  return c.json(jwks, 200);
});

/**
 * Global rate limiter.
 */
app.use(rateLimitMiddleware);

/**
 * Channel webhook routes — public (use HMAC verification internally).
 */
app.route('/webhooks', channelRouter);

/**
 * Auth routes — public (register, login, logout, profile).
 */
app.route('/auth', authRoutes);

/**
 * Team routes — protected (API tokens).
 */
app.use('/team/*', authMiddleware, requireAuth);
app.route('/team', teamRoutes);

/**
 * File routes — protected (upload, list, download, delete).
 */
app.use('/files/*', authMiddleware, requireAuth);
app.route('/files', fileRoutes);

/**
 * Channel routes — protected (list, claim).
 */
app.use('/channels/*', authMiddleware, requireAuth);
app.route('/channels', channelRoutes);

/**
 * Admin channel routes — protected + admin only.
 */
app.use('/admin/channels/*', authMiddleware, requireAuth, requireAdmin);
app.route('/admin/channels', adminChannelRoutes);

/**
 * Secret routes — protected + admin only.
 */
app.use('/secrets/*', authMiddleware, requireAuth, requireAdmin);
app.route('/secrets', secretRoutes);

/**
 * Admin routes — protected + admin only.
 */
app.use('/admin/*', authMiddleware, requireAuth, requireAdmin);
app.route('/admin', adminRoutes);

/**
 * 404 fallback.
 */
app.notFound((c) => c.json({ error: 'Not found' }, 404));

/**
 * Global error handler.
 */
app.onError((err, c) => {
  console.error('[gateway error]', err);
  return c.json({ error: 'Internal server error' }, 500);
});

/**
 * Start the server after bootstrapping.
 */
export default app;

/*
 * To start the server in production / dev, import this file
 * from a dedicated entry point (e.g. server.ts) and call:
 *
 *   await bootstrap();
 *   serve({ fetch: app.fetch, port: Number(process.env.GATEWAY_PORT || 3000) });
 */
