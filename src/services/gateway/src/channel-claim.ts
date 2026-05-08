import { randomBytes } from 'node:crypto';
import { getRedis } from '@openclaw/enterprise-shared/redis/client.js';
import { createChannelClaim, findChannelClaim, consumeChannelClaim } from '@openclaw/enterprise-shared/db/queries.js';
import pino from 'pino';

const logger = pino({ name: 'channel-claim' });

export interface ClaimCodeResult {
  code: string;
  expiresAt: Date;
}

/**
 * Generate a 6-digit claim code for channel identity linking.
 */
export function generateClaimCode(): string {
  return randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
}

/**
 * Create a claim code for a user to link their channel identity.
 */
export async function createClaimCode(userId: string, channel: 'whatsapp' | 'telegram'): Promise<ClaimCodeResult> {
  const code = generateClaimCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  
  // Check Redis for recent codes to prevent reuse
  const redis = getRedis();
  const recentKey = `claim_recent:${userId}:${channel}`;
  const recentCodes = await redis.lrange(recentKey, 0, -1);
  if (recentCodes.includes(code)) {
    // Regenerate if collision
    return createClaimCode(userId, channel);
  }
  
  // Store in Redis for quick lookup
  await redis.setex(`claim:${code}`, 300, JSON.stringify({ userId, channel }));
  await redis.lpush(recentKey, code);
  await redis.ltrim(recentKey, 0, 9); // Keep last 10 codes
  await redis.expire(recentKey, 300);
  
  // Also store in Postgres as fallback
  await createChannelClaim({
    code,
    userId,
    channel,
    expiresAt,
  });
  
  logger.info({ userId, channel, code }, 'Claim code created');
  
  return { code, expiresAt };
}

/**
 * Redeem a claim code to link a channel identity.
 */
export async function redeemClaimCode(
  code: string,
  channel: 'whatsapp' | 'telegram',
  externalId: string,
  displayName?: string
): Promise<{ userId: string } | null> {
  // Check Redis first for fast path
  const redis = getRedis();
  const cached = await redis.get(`claim:${code}`);
  
  let userId: string | null = null;
  
  if (cached) {
    const claimData = JSON.parse(cached);
    if (claimData.channel !== channel) {
      logger.warn({ code, expectedChannel: claimData.channel, actualChannel: channel }, 'Claim code channel mismatch');
      return null;
    }
    userId = claimData.userId;
  } else {
    // Fallback to Postgres
    const claim = await findChannelClaim(code);
    if (!claim) {
      logger.warn({ code }, 'Claim code not found');
      return null;
    }
    if (claim.channel !== channel) {
      logger.warn({ code, expectedChannel: claim.channel, actualChannel: channel }, 'Claim code channel mismatch');
      return null;
    }
    if (new Date() > new Date(claim.expiresAt)) {
      logger.warn({ code }, 'Claim code expired');
      return null;
    }
    userId = claim.claimedBy;
  }
  
  if (!userId) {
    return null;
  }
  
  // Consume the claim
  await consumeChannelClaim(code);
  await redis.del(`claim:${code}`);
  
  // Create channel identity (caller must do this)
  logger.info({ userId, channel, externalId, displayName }, 'Claim code redeemed');
  
  return { userId };
}
