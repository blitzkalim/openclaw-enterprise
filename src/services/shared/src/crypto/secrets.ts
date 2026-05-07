import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedSecret {
  encryptedHex: string;
  ivHex: string;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns hex-encoded ciphertext (includes auth tag) and IV.
 */
export function encryptSecret(plaintext: string, keyBase64: string): EncryptedSecret {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length}`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // ciphertext + authTag concatenated, then hex-encoded
  const encryptedHex = Buffer.concat([encrypted, authTag]).toString('hex');
  const ivHex = iv.toString('hex');

  return { encryptedHex, ivHex };
}

/**
 * Decrypt a ciphertext using AES-256-GCM.
 * Throws if the auth tag does not verify (tamper detection).
 */
export function decryptSecret(encryptedHex: string, ivHex: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${key.length}`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }

  const encryptedWithTag = Buffer.from(encryptedHex, 'hex');
  if (encryptedWithTag.length < AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext too short to contain auth tag');
  }

  const authTag = encryptedWithTag.subarray(encryptedWithTag.length - AUTH_TAG_LENGTH);
  const encrypted = encryptedWithTag.subarray(0, encryptedWithTag.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}
