import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/password.js';

describe('auth/password', () => {
  it('should hash and verify a password', async () => {
    const password = 'my-secret-password';
    const hash = await hashPassword(password);
    expect(hash).toContain('argon2id');
    const valid = await verifyPassword(hash, password);
    expect(valid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const password = 'correct-horse';
    const hash = await hashPassword(password);
    const valid = await verifyPassword(hash, 'wrong-password');
    expect(valid).toBe(false);
  });
});
