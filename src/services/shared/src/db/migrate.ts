import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const pool = getPool();
  const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('[migrate] Schema applied successfully');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
