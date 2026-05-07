import { Pool, type PoolConfig } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const config: PoolConfig = {
    connectionString,
    max: Number.parseInt(process.env.DATABASE_POOL_SIZE ?? '10', 10),
  };

  pool = new Pool(config);

  pool.on('error', (err) => {
    console.error('Unexpected Postgres pool error:', err);
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
