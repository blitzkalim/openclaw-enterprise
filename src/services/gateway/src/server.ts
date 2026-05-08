import { serve } from '@hono/node-server';
import app from './app.js';
import { bootstrap } from './bootstrap.js';
import { validateEnv } from '@openclaw/enterprise-shared/config/env-validation.js';

async function main() {
  validateEnv();
  await bootstrap();

  const port = Number(process.env.GATEWAY_PORT || 3000);
  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Gateway listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
