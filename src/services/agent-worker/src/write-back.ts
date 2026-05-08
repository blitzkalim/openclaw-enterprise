import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { getObject, putObject } from '@openclaw/enterprise-shared/s3/helpers.js';
import { secureWrite } from './secure-fs-s3.js';
import type { UserFiles } from './file-resolver-s3.js';

export interface FileHashes {
  memoryHash: string;
  userHash: string;
  tasksHash: string;
}

export interface AgentOutput {
  transcript: string;
  log: string;
  preHashes: FileHashes;
}

/**
 * Capture SHA-256 hashes of overlay files before agent execution.
 */
export async function captureFileHashes(files: UserFiles): Promise<FileHashes> {
  const memoryHash = createHash('sha256')
    .update(await readFile(files.memoryPath, 'utf-8'))
    .digest('hex');
  const userHash = createHash('sha256')
    .update(await readFile(files.userProfilePath, 'utf-8'))
    .digest('hex');
  const tasksHash = createHash('sha256')
    .update(await readFile(files.tasksPath, 'utf-8'))
    .digest('hex');

  return { memoryHash, userHash, tasksHash };
}

/**
 * Write back modified overlay files to S3 after agent execution.
 * Also uploads conversation transcript and execution log.
 */
export async function writeBackFiles(
  userId: string,
  sessionKey: string,
  files: UserFiles,
  agentOutput: AgentOutput
): Promise<void> {
  const overlayFiles = [
    { name: 'MEMORY.md', path: files.memoryPath, preHash: agentOutput.preHashes.memoryHash },
    { name: 'USER.md', path: files.userProfilePath, preHash: agentOutput.preHashes.userHash },
    { name: 'TASKS.md', path: files.tasksPath, preHash: agentOutput.preHashes.tasksHash },
  ];

  // Write back modified overlay files
  for (const file of overlayFiles) {
    const content = await readFile(file.path, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    if (hash !== file.preHash) {
      const s3Key = `users/user_${userId}/${file.name}`;
      await secureWrite(userId, s3Key, content);
      console.log(`[write-back] Wrote back ${file.name} for user ${userId}`);
    }
  }

  // Upload conversation transcript
  const transcriptKey = `users/user_${userId}/conversations/${sessionKey}.jsonl`;
  await secureWrite(userId, transcriptKey, agentOutput.transcript);

  // Upload execution log (append to date-based log file)
  const date = new Date().toISOString().slice(0, 10);
  const logKey = `users/user_${userId}/logs/${date}.log`;
  const existing = await getObject(logKey).catch(() => '');
  await secureWrite(userId, logKey, existing + '\n' + agentOutput.log);

  // Clean up local scratch directory
  await rm(`/tmp/agent-scratch/${userId}`, { recursive: true, force: true });
}
