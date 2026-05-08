import { importSPKI, exportJWK } from 'jose';

const JWT_ALGORITHM = 'RS256';
let jwkCache: any = null;

/**
 * Export the public key in JWK format for JWKS endpoint.
 * This is used by external services to verify JWT signatures.
 */
export async function getJwk(): Promise<any> {
  if (jwkCache) return jwkCache;

  const pem = process.env.OPENCLAW_JWT_PUBLIC_KEY!;
  const publicKey = await importSPKI(pem, JWT_ALGORITHM);
  const jwk = await exportJWK(publicKey);
  
  // Add required JWKS fields
  jwk.kid = 'openclaw-gateway-key';
  jwk.alg = JWT_ALGORITHM;
  jwk.use = 'sig';
  
  jwkCache = jwk;
  return jwk;
}

/**
 * JWKS endpoint response format.
 */
export async function getJwks(): Promise<{ keys: any[] }> {
  const jwk = await getJwk();
  return {
    keys: [jwk]
  };
}
