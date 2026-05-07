import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRedis, closeRedis } from '../redis/client.js';
import Redis from 'ioredis';

vi.mock('ioredis', () => {
  const MockRedis = vi.fn().mockImplementation(function () {
    return {
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue('PONG'),
    };
  });
  return { default: MockRedis, __esModule: true };
});

describe('redis/client', () => {
  beforeEach(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    // Reset singleton so each test starts fresh
    const { closeRedis } = await import('../redis/client.js');
    await closeRedis();
  });

  it('should return a Redis instance', () => {
    const client = getRedis();
    expect(client).toBeDefined();
    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
  });

  it('should throw when REDIS_URL is missing', () => {
    delete process.env.REDIS_URL;
    expect(() => getRedis()).toThrow('REDIS_URL environment variable is not set');
  });

  it('closeRedis should call quit and reset singleton', async () => {
    const client = getRedis();
    await closeRedis();
    expect(client.quit).toHaveBeenCalled();
  });
});
