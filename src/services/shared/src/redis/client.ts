import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  redis.on('error', (err) => {
    console.error('[redis] connection error:', err.message);
  });

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
