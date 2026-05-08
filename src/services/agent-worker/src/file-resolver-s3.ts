import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getObject, putObject, headObject, copyObject } from '@openclaw/enterprise-shared/s3/helpers.js';
import { validateS3Key } from './secure-fs-s3.js';

export interface ResolvedUserFiles {
  soulPath: string;
  agentsPath: string;
  memoryPath: string;
  userProfilePath: string;
  tasksPath: string;
  uploadsS3Prefix: string;
  conversationsS3Prefix: string;
  logsS3Prefix: string;
  tmpDir: string;
}

/**
 * Resolves user overlay files from S3 to local scratch directory.
 * Seeds from base/ on first access.
 */
export async function resolveUserFiles(userId: string): Promise<ResolvedUserFiles> {
  const scratchDir = `/tmp/agent-scratch/${userId}`;
  const tmpDir = `${scratchDir}/tmp`;

  // Step 1: Create scratch directories
  await mkdir(scratchDir, { recursive: true });
  await rm(tmpDir, { recursive: true, force: true }); // Clear tmp from previous job
  await mkdir(tmpDir, { recursive: true });

  // Step 2: Resolve each file
  const overlayFiles = [
    { name: 'SOUL.md', seedFrom: 'base/SOUL.md', emptyOk: false },
    { name: 'AGENTS.md', seedFrom: 'base/AGENTS.md', emptyOk: false },
    { name: 'MEMORY.md', seedFrom: null, emptyOk: true },
    { name: 'USER.md', seedFrom: null, emptyOk: true },
    { name: 'TASKS.md', seedFrom: null, emptyOk: true },
  ];

  for (const file of overlayFiles) {
    const s3Key = `users/user_${userId}/${file.name}`;
    validateS3Key(userId, s3Key);

    const exists = await headObject(s3Key);

    if (!exists) {
      if (file.seedFrom) {
        const seedExists = await headObject(file.seedFrom);
        if (seedExists) {
          await copyObject(file.seedFrom, s3Key);
        } else {
          // Base file missing - create empty
          await putObject(s3Key, '');
        }
      } else {
        // MEMORY, USER, TASKS start empty
        await putObject(s3Key, '');
      }
    }

    const content = await getObject(s3Key);
    await writeFile(join(scratchDir, file.name), content, 'utf-8');
  }

  // Step 3: Return UserFiles with local paths and S3 prefixes
  return {
    soulPath: join(scratchDir, 'SOUL.md'),
    agentsPath: join(scratchDir, 'AGENTS.md'),
    memoryPath: join(scratchDir, 'MEMORY.md'),
    userProfilePath: join(scratchDir, 'USER.md'),
    tasksPath: join(scratchDir, 'TASKS.md'),
    uploadsS3Prefix: `users/user_${userId}/uploads/`,
    conversationsS3Prefix: `users/user_${userId}/conversations/`,
    logsS3Prefix: `users/user_${userId}/logs/`,
    tmpDir,
  };
}
