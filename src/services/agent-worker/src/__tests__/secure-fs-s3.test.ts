import { describe, it, expect, beforeEach } from 'vitest';
import { SecureFsViolationError, validateS3Key, validateS3WriteKey } from '../secure-fs-s3.js';

describe('Secure FS S3', () => {
  describe('validateS3Key', () => {
    it('should allow user prefix', () => {
      const result = validateS3Key('abc', 'users/user_abc/SOUL.md');
      expect(result).toBe('users/user_abc/SOUL.md');
    });

    it('should allow base prefix', () => {
      const result = validateS3Key('abc', 'base/SOUL.md');
      expect(result).toBe('base/SOUL.md');
    });

    it('should reject cross-user access', () => {
      expect(() => validateS3Key('abc', 'users/user_xyz/SOUL.md')).toThrow(SecureFsViolationError);
    });

    it('should reject path traversal with ..', () => {
      expect(() => validateS3Key('abc', 'users/user_abc/../../../etc/passwd')).toThrow(SecureFsViolationError);
    });

    it('should reject path traversal with //', () => {
      expect(() => validateS3Key('abc', 'users/user_abc//secret')).toThrow(SecureFsViolationError);
    });

    it('should reject outside user and base prefix', () => {
      expect(() => validateS3Key('abc', 'other/path.md')).toThrow(SecureFsViolationError);
    });
  });

  describe('validateS3WriteKey', () => {
    it('should allow user prefix writes', () => {
      const result = validateS3WriteKey('abc', 'users/user_abc/MEMORY.md');
      expect(result).toBe('users/user_abc/MEMORY.md');
    });

    it('should reject base/ writes', () => {
      expect(() => validateS3WriteKey('abc', 'base/SOUL.md')).toThrow(SecureFsViolationError);
    });

    it('should still reject cross-user writes', () => {
      expect(() => validateS3WriteKey('abc', 'users/user_xyz/MEMORY.md')).toThrow(SecureFsViolationError);
    });
  });
});
