import { getObject, putObject } from '@openclaw/enterprise-shared/s3/helpers.js';

export class SecureFsViolationError extends Error {
  userId: string;
  key: string;
  reason: string;

  constructor(userId: string, key: string, reason: string) {
    super(`[SecureFS-S3] user=${userId} key=${key} reason=${reason}`);
    this.name = 'SecureFsViolationError';
    this.userId = userId;
    this.key = key;
    this.reason = reason;
  }
}

/**
 * Validates that a user can read the given S3 key.
 * Rules:
 * - Key must start with 'users/user_{userId}/' OR 'base/'
 * - Key must NOT contain '..' or '//' (path traversal)
 * - Cross-user access is blocked
 */
export function validateS3Key(userId: string, key: string): string {
  const userPrefix = `users/user_${userId}/`;
  const basePrefix = 'base/';

  // Check prefix
  if (!key.startsWith(userPrefix) && !key.startsWith(basePrefix)) {
    throw new SecureFsViolationError(userId, key, 'outside user and base prefix');
  }

  // Check path traversal
  if (key.includes('..')) {
    throw new SecureFsViolationError(userId, key, 'path traversal detected');
  }

  if (key.includes('//')) {
    throw new SecureFsViolationError(userId, key, 'path traversal detected');
  }

  return key;
}

/**
 * Validates that a user can write to the given S3 key.
 * Rules:
 * - All validateS3Key rules apply
 * - Key must NOT start with 'base/' (base is read-only)
 */
export function validateS3WriteKey(userId: string, key: string): string {
  validateS3Key(userId, key);

  if (key.startsWith('base/')) {
    throw new SecureFsViolationError(userId, key, 'writes to base/ forbidden');
  }

  return key;
}

/**
 * Secure read from S3 with user isolation.
 */
export async function secureRead(userId: string, key: string): Promise<string> {
  const validatedKey = validateS3Key(userId, key);
  return await getObject(validatedKey);
}

/**
 * Secure write to S3 with user isolation.
 * Supports append mode for MEMORY.md with memory cap.
 */
export async function secureWrite(
  userId: string,
  key: string,
  content: string,
  options?: { append?: boolean; memoryCap?: number }
): Promise<void> {
  const validatedKey = validateS3WriteKey(userId, key);

  let finalContent = content;

  // Handle append mode
  if (options?.append) {
    const existing = await getObject(validatedKey).catch(() => '');
    finalContent = existing + content;

    // Apply memory cap if specified
    if (options.memoryCap && finalContent.length > options.memoryCap) {
      const lines = finalContent.split('\n');
      // Remove oldest lines from the start
      while (finalContent.length > options.memoryCap && lines.length > 0) {
        lines.shift();
        finalContent = lines.join('\n');
      }
    }
  }

  await putObject(validatedKey, finalContent);
}
