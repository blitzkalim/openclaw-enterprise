import { Queue } from 'bullmq';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import type { AgentJobPayload, AttachmentRef } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const QUEUE_SECRET = process.env.OPENCLAW_QUEUE_SECRET || '';
if (!QUEUE_SECRET) {
  throw new Error('OPENCLAW_QUEUE_SECRET environment variable is not set');
}

let jobQueue: Queue | null = null;

/**
 * Get or create the BullMQ queue for agent jobs.
 */
export function getJobQueue(): Queue {
  if (!jobQueue) {
    jobQueue = new Queue('agent-jobs', {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    });
  }
  return jobQueue;
}

/**
 * Sign job payload with HMAC-SHA256.
 */
export function signJobPayload(payload: AgentJobPayload): string {
  const payloadStr = JSON.stringify(payload);
  return createHmac('sha256', QUEUE_SECRET).update(payloadStr).digest('hex');
}

/**
 * Verify job payload signature.
 */
export function verifyJobPayload(payload: AgentJobPayload, sig: string): boolean {
  const expectedSig = signJobPayload(payload);
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const providedBuf = Buffer.from(sig, 'hex');
  
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Enqueue an agent job with HMAC signing.
 * Deduplicates by webhookMessageId if provided.
 */
export async function enqueueAgentJob(payload: AgentJobPayload): Promise<void> {
  const queue = getJobQueue();
  
  // Add HMAC signature
  const sig = signJobPayload(payload);
  const signedPayload = { ...payload, _sig: sig };
  
  // Deduplication: check if job with same webhookMessageId exists
  if (payload.webhookMessageId) {
    const dedupeJobId = `webhook:${payload.webhookMessageId}`;
    const existingJob = await queue.getJob(dedupeJobId);
    
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'completed' || state === 'active') {
        // Skip duplicate
        console.log(`[queue-producer] Skipping duplicate job ${dedupeJobId}`);
        return;
      }
    }
    
    await queue.add('agent-job', signedPayload, {
      jobId: dedupeJobId,
    });
  } else {
    await queue.add('agent-job', signedPayload);
  }
  
  console.log(`[queue-producer] Enqueued job for user ${payload.userId}, session ${payload.sessionKey}`);
}
