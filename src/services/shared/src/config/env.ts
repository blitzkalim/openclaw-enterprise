/**
 * Environment validation helpers used by all services.
 */

export function validateEnv(required: string[], context: string): void {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[${context}] Missing required environment variables:`);
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('Check .env.example for documentation.');
    process.exit(1);
  }

  // OPENCLAW_TEAM_MODE must equal '1' exactly
  if (required.includes('OPENCLAW_TEAM_MODE') && process.env.OPENCLAW_TEAM_MODE !== '1') {
    console.error(`[${context}] OPENCLAW_TEAM_MODE must be '1'`);
    process.exit(1);
  }
}

export const GATEWAY_REQUIRED = [
  'OPENCLAW_TEAM_MODE',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENCLAW_S3_BUCKET',
  'OPENCLAW_QUEUE_SECRET',
  'OPENCLAW_JWT_PRIVATE_KEY',
  'OPENCLAW_JWT_PUBLIC_KEY',
  'OPENCLAW_COOKIE_SECRET',
  'OPENCLAW_SECRETS_KEY',
];

export const AGENT_WORKER_REQUIRED = [
  'OPENCLAW_TEAM_MODE',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENCLAW_S3_BUCKET',
  'OPENCLAW_QUEUE_SECRET',
  'OPENCLAW_JWT_PUBLIC_KEY',
];

export const BOOTSTRAP_REQUIRED = [
  'DATABASE_URL',
  'OPENCLAW_S3_BUCKET',
];
