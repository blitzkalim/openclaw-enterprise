import { describe, it, expect } from 'vitest';
import { resolveUserFiles } from '../file-resolver-s3.js';

// Mock the S3 helpers
vi.mock('@openclaw/enterprise-shared/s3/helpers.js', () => ({
  getObject: vi.fn(() => Promise.resolve('')),
  putObject: vi.fn(() => Promise.resolve()),
  headObject: vi.fn(() => Promise.resolve(false)),
  copyObject: vi.fn(() => Promise.resolve()),
}));

describe('File Resolver S3', () => {
  it('should create UserFiles with correct paths', async () => {
    const files = await resolveUserFiles('test-user-1');
    
    expect(files.soulPath).toContain('SOUL.md');
    expect(files.agentsPath).toContain('AGENTS.md');
    expect(files.memoryPath).toContain('MEMORY.md');
    expect(files.userProfilePath).toContain('USER.md');
    expect(files.tasksPath).toContain('TASKS.md');
    expect(files.uploadsS3Prefix).toBe('users/user_test-user-1/uploads/');
    expect(files.conversationsS3Prefix).toBe('users/user_test-user-1/conversations/');
    expect(files.logsS3Prefix).toBe('users/user_test-user-1/logs/');
    expect(files.tmpDir).toContain('/tmp/agent-scratch/test-user-1/tmp');
  });
});
