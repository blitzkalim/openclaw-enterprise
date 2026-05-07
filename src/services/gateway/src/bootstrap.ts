import { createUser, findUserByEmail, listUsers } from '@openclaw/enterprise-shared/db/queries.js';
import { migrate } from '@openclaw/enterprise-shared/db/migrate.js';
import { hashPassword } from './auth/password.js';
import { validateEnv, BOOTSTRAP_REQUIRED } from '@openclaw/enterprise-shared/config/env.js';

/**
 * Bootstrap the system on first start:
 * 1. Validate required env vars
 * 2. Run DB migrations (idempotent)
 * 3. If zero users exist, create an admin user from env vars.
 *
 * Environment variables used:
 *   OPENCLAW_ADMIN_EMAIL     (default: admin@openclaw.local)
 *   OPENCLAW_ADMIN_PASSWORD  (required if no users exist)
 */
export async function bootstrap(): Promise<void> {
  validateEnv(BOOTSTRAP_REQUIRED, 'Bootstrap');

  // Ensure schema exists
  await migrate();

  const users = await listUsers();
  if (users.length === 0) {
    const email = process.env.OPENCLAW_ADMIN_EMAIL ?? 'admin@openclaw.local';
    const password = process.env.OPENCLAW_ADMIN_PASSWORD;

    if (!password) {
      console.error(
        `[bootstrap] No users found and OPENCLAW_ADMIN_PASSWORD is not set.\n` +
          `Set OPENCLAW_ADMIN_PASSWORD to create the initial admin account (${email}).`,
      );
      process.exit(1);
    }

    const existing = await findUserByEmail(email);
    if (!existing) {
      await createUser({
        email,
        passwordHash: await hashPassword(password),
        name: 'Administrator',
        isAdmin: true,
        workspaceId: null,
        status: 'active',
      });
      console.log(`[bootstrap] Created initial admin user: ${email}`);
    }
  }
}
