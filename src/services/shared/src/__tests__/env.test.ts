import { describe, it, expect, vi } from 'vitest';
import { validateEnv, GATEWAY_REQUIRED, AGENT_WORKER_REQUIRED, BOOTSTRAP_REQUIRED } from '../config/env.js';

describe('config/env', () => {
  const originalEnv = { ...process.env };

  it('should pass when all required env vars are present', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    process.env.TEST_VAR_A = 'a';
    process.env.TEST_VAR_B = 'b';
    expect(() => validateEnv(['TEST_VAR_A', 'TEST_VAR_B'], 'Test')).not.toThrow();
    mockExit.mockRestore();
  });

  it('should exit when required env vars are missing', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    delete process.env.MISSING_VAR_X;
    expect(() => validateEnv(['MISSING_VAR_X'], 'Test')).toThrow('exit');
    mockExit.mockRestore();
  });

  it('should print all missing vars at once', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.MISSING_A;
    delete process.env.MISSING_B;
    try {
      validateEnv(['MISSING_A', 'MISSING_B'], 'Test');
    } catch {}
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('MISSING_A'));
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('MISSING_B'));
    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('GATEWAY_REQUIRED should include expected keys', () => {
    expect(GATEWAY_REQUIRED).toContain('DATABASE_URL');
    expect(GATEWAY_REQUIRED).toContain('REDIS_URL');
    expect(GATEWAY_REQUIRED).toContain('OPENCLAW_JWT_PRIVATE_KEY');
    expect(GATEWAY_REQUIRED).toContain('OPENCLAW_TEAM_MODE');
  });

  it('AGENT_WORKER_REQUIRED should include expected keys', () => {
    expect(AGENT_WORKER_REQUIRED).toContain('DATABASE_URL');
    expect(AGENT_WORKER_REQUIRED).toContain('REDIS_URL');
    expect(AGENT_WORKER_REQUIRED).not.toContain('OPENCLAW_JWT_PRIVATE_KEY');
  });

  it('BOOTSTRAP_REQUIRED should be minimal', () => {
    expect(BOOTSTRAP_REQUIRED).toEqual(['DATABASE_URL', 'OPENCLAW_S3_BUCKET']);
  });
});
