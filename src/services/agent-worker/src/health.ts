import { isWorkerHealthy } from './index.js';

/**
 * Health check endpoint for agent-worker.
 * Returns 200 if the BullMQ worker is running, 503 otherwise.
 */
export async function healthCheck(): Promise<{ status: string; service: string }> {
  if (isWorkerHealthy()) {
    return { status: 'ok', service: 'agent-worker' };
  }
  throw new Error('Worker not healthy');
}
