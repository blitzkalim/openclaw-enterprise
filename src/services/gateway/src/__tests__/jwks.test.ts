import { describe, it, expect, beforeEach } from 'vitest';
import { getJwks } from '../auth/jwks.js';

describe('JWKS endpoint', () => {
  beforeEach(() => {
    // Set required env var for tests
    process.env.OPENCLAW_JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo
4lgOEePzNm0tRgeLezV6ffAt0gunVTLw7onLRnrqLlx9cSBOtyZ+rYx6YVCm2Fzm
8MlPtm2YLA7GzCkQK8YC3b0XJ1E7Z5m5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X
5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X
5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X
5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X
5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X5X
wIDAQAB
-----END PUBLIC KEY-----`;
  });

  it('should return JWKS with keys array', async () => {
    const jwks = await getJwks();
    
    expect(jwks).toHaveProperty('keys');
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
  });

  it('should include required JWK fields', async () => {
    const jwks = await getJwks();
    const key = jwks.keys[0];
    
    expect(key).toHaveProperty('kty');
    expect(key).toHaveProperty('kid');
    expect(key).toHaveProperty('alg');
    expect(key).toHaveProperty('use');
    expect(key).toHaveProperty('n');
    expect(key).toHaveProperty('e');
  });

  it('should set correct algorithm', async () => {
    const jwks = await getJwks();
    const key = jwks.keys[0];
    
    expect(key.alg).toBe('RS256');
  });

  it('should set kid', async () => {
    const jwks = await getJwks();
    const key = jwks.keys[0];
    
    expect(key.kid).toBe('openclaw-gateway-key');
  });

  it('should set use to sig', async () => {
    const jwks = await getJwks();
    const key = jwks.keys[0];
    
    expect(key.use).toBe('sig');
  });
});
