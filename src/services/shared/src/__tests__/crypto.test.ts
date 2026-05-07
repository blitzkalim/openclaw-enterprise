import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../crypto/secrets.js';
import { randomBytes } from 'node:crypto';

describe('crypto/secrets', () => {
  const key = randomBytes(32).toString('base64');

  it('should encrypt and decrypt round-trip', () => {
    const plaintext = 'my-super-secret-api-key';
    const { encryptedHex, ivHex } = encryptSecret(plaintext, key);
    const decrypted = decryptSecret(encryptedHex, ivHex, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext', () => {
    const plaintext = 'test';
    const a = encryptSecret(plaintext, key);
    const b = encryptSecret(plaintext, key);
    expect(a.encryptedHex).not.toBe(b.encryptedHex);
    expect(a.ivHex).not.toBe(b.ivHex);
  });

  it('should throw on tampered ciphertext', () => {
    const plaintext = 'test';
    const { encryptedHex, ivHex } = encryptSecret(plaintext, key);
    // Flip a bit in the ciphertext
    const tampered = encryptedHex.slice(0, -2) + (encryptedHex.slice(-2) === '00' ? '01' : '00');
    expect(() => decryptSecret(tampered, ivHex, key)).toThrow();
  });

  it('should throw on wrong key', () => {
    const plaintext = 'test';
    const { encryptedHex, ivHex } = encryptSecret(plaintext, key);
    const wrongKey = randomBytes(32).toString('base64');
    expect(() => decryptSecret(encryptedHex, ivHex, wrongKey)).toThrow();
  });

  it('should throw on invalid key length', () => {
    expect(() => encryptSecret('x', 'short')).toThrow('Invalid key length');
    expect(() => decryptSecret('00', '00', 'short')).toThrow('Invalid key length');
  });

  it('should throw on invalid iv length', () => {
    const { encryptedHex } = encryptSecret('x', key);
    expect(() => decryptSecret(encryptedHex, '00', key)).toThrow('Invalid IV length');
  });
});
