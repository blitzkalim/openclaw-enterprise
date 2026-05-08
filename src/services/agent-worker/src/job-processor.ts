import { Job } from 'bullmq';
import pino from 'pino';
import type { AgentJobPayload, TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';
import { findUserById } from '@openclaw/enterprise-shared/db/queries.js';
import { resolveUserFiles } from './file-resolver-s3.js';
import type { ResolvedUserFiles } from './file-resolver-s3.js';
import { captureFileHashes, writeBackFiles } from './write-back.js';
import type { AgentOutput } from './write-back.js';

const logger = pino({ name: 'job-processor' });

/**
 * Main job processor function called by BullMQ worker.
 */
export async function processJob(job: Job<AgentJobPayload>): Promise<void> {
  const { userId, workspaceId, isAdmin, source, channel, threadId, sessionKey, text, attachments } = job.data;

  try {
    // Step 1: Fetch user from DB for email/name
    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Step 2: Resolve user files from S3
    const files = await resolveUserFiles(userId);

    // Step 3: Capture pre-hashes for write-back comparison
    const preHashes = await captureFileHashes(files);

    // Step 4: Build TeamCtx (cast source to valid type - jobs come from trusted gateway)
    const teamCtx: TeamCtx = {
      userId,
      email: user.email,
      name: user.name,
      workspaceId,
      isAdmin,
      source: source as 'cookie' | 'api-token' | 'legacy-token',
    };

    // Step 5: Execute agent (TODO: Call actual agent-command.ts - requires main openclaw repo)
    // const result = await runAgent({
    //   text,
    //   attachments,
    //   sessionKey,
    //   team: teamCtx,
    //   files,
    //   onToken: (token) => publishStreamToken(replyChannel, token),
    // });

    // Placeholder for agent output
    const agentOutput: AgentOutput = {
      transcript: JSON.stringify([{ role: 'user', content: text }]),
      log: `Agent execution completed for session ${sessionKey}`,
      preHashes,
    };

    // Step 6: Write back modified files
    await writeBackFiles(userId, sessionKey, files, agentOutput);

    // Step 7: Publish final reply (TODO: Implement stream-publisher)
    // await publishReply({
    //   channel,
    //   threadId,
    //   text: result.text,
    // });

    logger.info({ jobId: job.id, userId, sessionKey }, 'Job processed successfully');
  } catch (err) {
    logger.error({ jobId: job.id, userId, err: (err as Error).message }, 'Job processing failed');
    throw err; // Let BullMQ handle retries
  }
}
