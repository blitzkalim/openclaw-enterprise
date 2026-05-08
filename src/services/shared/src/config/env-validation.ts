/**
 * Environment variable validation.
 * Ensures all required environment variables are set at startup.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const REQUIRED_VARS: EnvVar[] = [
  { name: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string' },
  { name: 'REDIS_URL', required: true, description: 'Redis connection string' },
  { name: 'OPENCLAW_S3_BUCKET', required: true, description: 'S3 bucket name' },
  { name: 'OPENCLAW_QUEUE_SECRET', required: true, description: 'HMAC secret for BullMQ job signing' },
  { name: 'OPENCLAW_COOKIE_SECRET', required: true, description: 'HMAC secret for CSRF tokens' },
  { name: 'OPENCLAW_SECRETS_KEY', required: true, description: 'AES-256-GCM key for workspace secrets (32 bytes)' },
  { name: 'OPENCLAW_JWT_PRIVATE_KEY', required: true, description: 'RSA private key for JWT signing (PEM format)' },
  { name: 'OPENCLAW_JWT_PUBLIC_KEY', required: true, description: 'RSA public key for JWT verification (PEM format)' },
  { name: 'OPENCLAW_TEAM_ADMIN_EMAIL', required: true, description: 'Email for initial admin user' },
  { name: 'OPENCLAW_TEAM_ADMIN_PASSWORD', required: true, description: 'Password for initial admin user' },
  { name: 'OPENCLAW_PUBLIC_BASE_URL', required: true, description: 'Public base URL for the service' },
  { name: 'OPENCLAW_TEAM_MODE', required: false, description: 'Set to "1" for team mode' },
];

const OPTIONAL_VARS: EnvVar[] = [
  { name: 'S3_ENDPOINT', required: false, description: 'S3 endpoint (for MinIO or compatible)' },
  { name: 'AWS_ACCESS_KEY_ID', required: false, description: 'AWS access key ID' },
  { name: 'AWS_SECRET_ACCESS_KEY', required: false, description: 'AWS secret access key' },
  { name: 'AWS_REGION', required: false, description: 'AWS region (default: us-east-1)' },
  { name: 'OPENCLAW_GATEWAY_TOKEN', required: false, description: 'Legacy gateway token' },
  { name: 'OPENAI_API_KEY', required: false, description: 'OpenAI API key' },
  { name: 'ANTHROPIC_API_KEY', required: false, description: 'Anthropic API key' },
  { name: 'TELEGRAM_BOT_TOKEN', required: false, description: 'Telegram bot token' },
  { name: 'WHATSAPP_ACCESS_TOKEN', required: false, description: 'WhatsApp Meta API access token' },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', required: false, description: 'WhatsApp phone number ID' },
  { name: 'WORKER_CONCURRENCY', required: false, description: 'BullMQ worker concurrency (default: 5)' },
  { name: 'DATABASE_POOL_SIZE', required: false, description: 'Postgres connection pool size (default: 10)' },
  { name: 'GATEWAY_PORT', required: false, description: 'Gateway HTTP port (default: 3000)' },
];

/**
 * Validate required environment variables.
 * Throws an error if any required variable is missing.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_VARS) {
    if (!process.env[envVar.name]) {
      missing.push(envVar.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n\n` +
      `Required variables:\n` +
      REQUIRED_VARS.map(v => `  ${v.name}: ${v.description}`).join('\n')
    );
  }
}

/**
 * Print environment variable documentation.
 */
export function printEnvDocs(): void {
  console.log('Environment Variables:\n');
  console.log('Required:');
  for (const envVar of REQUIRED_VARS) {
    console.log(`  ${envVar.name}: ${envVar.description}`);
  }
  console.log('\nOptional:');
  for (const envVar of OPTIONAL_VARS) {
    console.log(`  ${envVar.name}: ${envVar.description}`);
  }
}
