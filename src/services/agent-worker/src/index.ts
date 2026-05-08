import { Worker } from 'bullmq';
import pino from 'pino';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { headObject } from '@openclaw/enterprise-shared/s3/helpers.js';

const logger = pino({ name: 'agent-worker' });

let worker: Worker | null = null;

/**
 * Main entry point for the Agent Worker service.
 */
async function main() {
  // Validate required env vars
  const required = ['REDIS_URL', 'DATABASE_URL', 'OPENCLAW_S3_BUCKET', 'OPENCLAW_TEAM_MODE'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error({ missing }, 'Missing required environment variables');
    process.exit(1);
  }

  if (process.env.OPENCLAW_TEAM_MODE !== '1') {
    logger.error('OPENCLAW_TEAM_MODE must be "1"');
    process.exit(1);
  }

  const redis = getRedis();

  // Check Redis connectivity
  try {
    await redis.ping();
    logger.info('Redis connection successful');
  } catch (err) {
    logger.error({ err }, 'Redis connection failed');
    process.exit(1);
  }

  // Check S3 connectivity
  try {
    await headObject('base/'); // Returns false if not exists, that's fine - just testing connectivity
    logger.info('S3 connection successful');
  } catch (err) {
    logger.error({ err }, 'S3 connection failed');
    process.exit(1);
  }

  // Create BullMQ Worker
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
  const { processJob } = await import('./job-processor.js');
  worker = new Worker(
    'agent-jobs',
    processJob,
    {
      connection: redis,
      concurrency,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, userId: job.data.userId, duration: Date.now() - job.timestamp },
      'Job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, userId: job?.data?.userId, err: (err as Error).message },
      'Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err: (err as Error).message }, 'Worker error');
  });

  logger.info('Agent worker started');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down agent worker...');
    if (worker) {
      await worker.close();
    }
    await redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/**
 * Check if the worker is healthy (for health checks).
 */
export function isWorkerHealthy(): boolean {
  return worker?.isRunning() ?? false;
}

// Start the worker
main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'Fatal error starting agent worker');
  process.exit(1);
});
