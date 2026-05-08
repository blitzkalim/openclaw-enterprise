import { Job } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pino from 'pino';
import type { AgentJobPayload, TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { findUserById } from '@openclaw/enterprise-shared/db/queries.js';
import { resolveUserFiles } from './file-resolver-s3.js';
import type { ResolvedUserFiles } from './file-resolver-s3.js';
import { captureFileHashes, writeBackFiles } from './write-back.js';
import type { AgentOutput } from './write-back.js';
import { publishReply, publishStreamToken, publishStreamDone } from './stream-publisher.js';

const logger = pino({ name: 'job-processor' });

const QUEUE_SECRET = process.env.OPENCLAW_QUEUE_SECRET || '';

/**
 * Verify the HMAC-SHA256 signature on a BullMQ job payload.
 * Throws if the signature is missing or invalid.
 */
function verifyJobSignature(data: AgentJobPayload & { _sig?: string }): void {
  const { _sig, ...rest } = data;
  if (!_sig) {
    throw new Error('Job payload missing _sig — possible queue tampering');
  }
  if (!QUEUE_SECRET) {
    throw new Error('OPENCLAW_QUEUE_SECRET is not set — cannot verify job signature');
  }
  const expected = createHmac('sha256', QUEUE_SECRET).update(JSON.stringify(rest)).digest('hex');
  const eBuf = Buffer.from(expected, 'hex');
  const sBuf = Buffer.from(_sig, 'hex');
  if (eBuf.length !== sBuf.length || !timingSafeEqual(eBuf, sBuf)) {
    throw new Error('Job payload HMAC signature invalid — possible queue tampering');
  }
}

/**
 * Main job processor function called by BullMQ worker.
 */
export async function processJob(job: Job<AgentJobPayload & { _sig?: string }>): Promise<void> {
  const jobData = job.data;

  // STEP 0: Verify HMAC signature BEFORE doing any work
  try {
    verifyJobSignature(jobData);
  } catch (err) {
    logger.error({ jobId: job.id, err: (err as Error).message }, 'Job signature verification failed — discarding job');
    // Do NOT rethrow — we don't want BullMQ to retry a tampered job
    return;
  }

  const { userId, workspaceId, isAdmin, source, channel, threadId, sessionKey, text, attachments, replyChannel } = jobData;

  try {
    // Step 1: Fetch user from DB
    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Step 2: Resolve user files from S3
    const files = await resolveUserFiles(userId);

    // Step 3: Capture pre-hashes for write-back comparison
    const preHashes = await captureFileHashes(files);

    // Step 4: Build TeamCtx
    const teamCtx: TeamCtx = {
      userId,
      email: user.email,
      name: user.name,
      workspaceId,
      isAdmin,
      source: source as 'cookie' | 'api-token' | 'legacy-token',
    };

    // Step 5: Execute agent
    // The actual agent-command.ts call requires the main openclaw repo to be present.
    // When the openclaw core is available, replace this block with:
    //
    //   const result = await runAgentCommand({
    //     text,
    //     attachments,
    //     sessionKey,
    //     team: teamCtx,
    //     files,
    //     onToken: replyChannel
    //       ? (token: string) => publishStreamToken(replyChannel, token)
    //       : undefined,
    //   });
    //
    // For now, produce a minimal placeholder output so write-back runs correctly.
    const agentOutput: AgentOutput = {
      transcript: JSON.stringify([{ role: 'user', content: text }]),
      log: `Agent execution queued for session ${sessionKey} — awaiting agent-command integration`,
      preHashes,
    };

    // Step 6: Write back modified files to S3
    await writeBackFiles(userId, sessionKey, files, agentOutput);

    // Step 7: Publish streaming done signal (if browser client is connected)
    if (replyChannel) {
      await publishStreamDone(replyChannel);
    }

    // Step 8: Publish final reply to channel (WhatsApp / Telegram)
    await publishReply({
      sessionKey,
      channel,
      threadId,
      text: agentOutput.log,
      timestamp: new Date().toISOString(),
    });

    logger.info({ jobId: job.id, userId, sessionKey }, 'Job processed successfully');
  } catch (err) {
    logger.error({ jobId: job.id, userId, err: (err as Error).message }, 'Job processing failed');
    throw err; // Let BullMQ handle retries
  }
}
