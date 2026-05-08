import { getPool } from './pool.js';
import type { User, UserSession, ApiToken, ChannelIdentity, ChannelClaim, StoredFile } from '../types/team-ctx.js';

/* ------------------------------------------------------------------ */
/*  Users                                                              */
/* ------------------------------------------------------------------ */

export async function createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, is_admin, workspace_id, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, password_hash AS "passwordHash", name, is_admin AS "isAdmin",
               workspace_id AS "workspaceId", status, created_at AS "createdAt"`,
    [user.email, user.passwordHash, user.name, user.isAdmin, user.workspaceId, user.status],
  );
  return result.rows[0] as User;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, email, password_hash AS "passwordHash", name, is_admin AS "isAdmin",
            workspace_id AS "workspaceId", status, created_at AS "createdAt"
     FROM users WHERE email = $1`,
    [email],
  );
  return (result.rows[0] as User | undefined) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, email, password_hash AS "passwordHash", name, is_admin AS "isAdmin",
            workspace_id AS "workspaceId", status, created_at AS "createdAt"
     FROM users WHERE id = $1`,
    [id],
  );
  return (result.rows[0] as User | undefined) ?? null;
}

export async function listUsers(): Promise<Pick<User, 'id' | 'email' | 'name' | 'isAdmin' | 'status' | 'createdAt'>[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, email, name, is_admin AS "isAdmin", status, created_at AS "createdAt"
     FROM users ORDER BY created_at DESC`,
  );
  return result.rows as Pick<User, 'id' | 'email' | 'name' | 'isAdmin' | 'status' | 'createdAt'>[];
}

export async function updateUserStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE users SET status = $1 WHERE id = $2`, [status, id]);
}

export async function setUserAdmin(id: string, isAdmin: boolean): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE users SET is_admin = $1 WHERE id = $2`, [isAdmin, id]);
}

/* ------------------------------------------------------------------ */
/*  Sessions                                                           */
/* ------------------------------------------------------------------ */

export async function createSession(session: Omit<UserSession, 'id' | 'createdAt'>): Promise<UserSession> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO user_sessions (user_id, token_hash, ip, user_agent, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id AS "userId", token_hash AS "tokenHash", ip, user_agent AS "userAgent",
               created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
    [session.userId, session.tokenHash, session.ip, session.userAgent, session.expiresAt, session.revokedAt],
  );
  return result.rows[0] as UserSession;
}

export async function findSessionByTokenHash(hash: string): Promise<UserSession | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id AS "userId", token_hash AS "tokenHash", ip, user_agent AS "userAgent",
            created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"
     FROM user_sessions WHERE token_hash = $1`,
    [hash],
  );
  return (result.rows[0] as UserSession | undefined) ?? null;
}

export async function revokeSession(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE user_sessions SET revoked_at = now() WHERE id = $1`, [id]);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1`, [userId]);
}

/* ------------------------------------------------------------------ */
/*  API Tokens                                                         */
/* ------------------------------------------------------------------ */

export async function createApiToken(token: Omit<ApiToken, 'id' | 'createdAt' | 'lastUsedAt'>): Promise<ApiToken> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO api_tokens (user_id, name, hash)
     VALUES ($1, $2, $3)
     RETURNING id, user_id AS "userId", name, hash, created_at AS "createdAt", last_used_at AS "lastUsedAt"`,
    [token.userId, token.name, token.hash],
  );
  return result.rows[0] as ApiToken;
}

export async function findApiTokenByHash(hash: string): Promise<ApiToken | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id AS "userId", name, hash, created_at AS "createdAt", last_used_at AS "lastUsedAt"
     FROM api_tokens WHERE hash = $1`,
    [hash],
  );
  return (result.rows[0] as ApiToken | undefined) ?? null;
}

export async function listApiTokensByUser(userId: string): Promise<Pick<ApiToken, 'id' | 'name' | 'createdAt' | 'lastUsedAt'>[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, name, created_at AS "createdAt", last_used_at AS "lastUsedAt"
     FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows as Pick<ApiToken, 'id' | 'name' | 'createdAt' | 'lastUsedAt'>[];
}

export async function deleteApiToken(id: string, userId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM api_tokens WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function touchApiTokenLastUsed(hash: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE api_tokens SET last_used_at = now() WHERE hash = $1`,
    [hash],
  );
}

/* ------------------------------------------------------------------ */
/*  Channel Identities                                                 */
/* ------------------------------------------------------------------ */

export async function createChannelIdentity(identity: Omit<ChannelIdentity, 'id' | 'createdAt'>): Promise<ChannelIdentity> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO channel_identities (user_id, channel, external_id, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id AS "userId", channel, external_id AS "externalId",
               display_name AS "displayName", created_at AS "createdAt"`,
    [identity.userId, identity.channel, identity.externalId, identity.displayName],
  );
  return result.rows[0] as ChannelIdentity;
}

export async function findChannelIdentity(channel: string, externalId: string): Promise<ChannelIdentity | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id AS "userId", channel, external_id AS "externalId",
            display_name AS "displayName", created_at AS "createdAt"
     FROM channel_identities WHERE channel = $1 AND external_id = $2`,
    [channel, externalId],
  );
  return (result.rows[0] as ChannelIdentity | undefined) ?? null;
}

export async function listChannelIdentitiesByUser(userId: string): Promise<ChannelIdentity[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id AS "userId", channel, external_id AS "externalId",
            display_name AS "displayName", created_at AS "createdAt"
     FROM channel_identities WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows as ChannelIdentity[];
}

/* ------------------------------------------------------------------ */
/*  Channel Claims                                                     */
/* ------------------------------------------------------------------ */

export async function createChannelClaim(claim: Omit<ChannelClaim, 'id' | 'createdAt' | 'claimedAt'>): Promise<ChannelClaim> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO channel_claims (channel, external_id, claim_code, mode, workspace_id, expires_at, claimed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, channel, external_id AS "externalId", claim_code AS "claimCode", mode,
               workspace_id AS "workspaceId", expires_at AS "expiresAt",
               claimed_by AS "claimedBy", claimed_at AS "claimedAt", created_at AS "createdAt"`,
    [claim.channel, claim.externalId, claim.claimCode, claim.mode, claim.workspaceId, claim.expiresAt, claim.claimedBy],
  );
  return result.rows[0] as ChannelClaim;
}

export async function findChannelClaimByCode(claimCode: string): Promise<ChannelClaim | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, channel, external_id AS "externalId", claim_code AS "claimCode", mode,
            workspace_id AS "workspaceId", expires_at AS "expiresAt",
            claimed_by AS "claimedBy", claimed_at AS "claimedAt", created_at AS "createdAt"
     FROM channel_claims WHERE claim_code = $1`,
    [claimCode],
  );
  return (result.rows[0] as ChannelClaim | undefined) ?? null;
}

export async function claimChannelClaim(claimId: string, userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE channel_claims SET claimed_by = $1, claimed_at = now() WHERE id = $2`,
    [userId, claimId],
  );
}

export async function deleteExpiredClaims(): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM channel_claims WHERE expires_at < now()`);
}

/* ------------------------------------------------------------------ */
/*  Workspace Secrets                                                  */
/* ------------------------------------------------------------------ */

export async function upsertWorkspaceSecret(params: { workspaceId: string; secretType: string; encryptedHex: string; ivHex: string }): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO workspace_secrets (workspace_id, secret_type, encrypted_val, iv)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, secret_type)
     DO UPDATE SET encrypted_val = EXCLUDED.encrypted_val, iv = EXCLUDED.iv, updated_at = now()`,
    [params.workspaceId, params.secretType, params.encryptedHex, params.ivHex],
  );
}

export async function findWorkspaceSecret(workspaceId: string, secretType: string): Promise<{ encryptedVal: string; iv: string } | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT encrypted_val AS "encryptedVal", iv FROM workspace_secrets
     WHERE workspace_id = $1 AND secret_type = $2`,
    [workspaceId, secretType],
  );
  return (result.rows[0] as { encryptedVal: string; iv: string } | undefined) ?? null;
}

export async function loadAllWorkspaceSecrets(): Promise<WorkspaceSecret[]> {
  const pool = getPool();
  const result = await pool.query<WorkspaceSecret>(`SELECT workspace_id AS "workspaceId", secret_type AS "secretType", encrypted_val AS "encryptedVal", iv FROM workspace_secrets`);
  return result.rows;
}

export async function logRateLimit(
  ip: string,
  method: string,
  path: string,
  blocked: boolean,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO rate_limit_log (ip, method, path, blocked) VALUES ($1, $2, $3, $4)`,
    [ip, method, path, blocked],
  );
}

/* ------------------------------------------------------------------ */
/*  Files                                                              */
/* ------------------------------------------------------------------ */

export async function createFile(file: Omit<StoredFile, 'id' | 'createdAt'>): Promise<StoredFile> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO files (user_id, name, s3_key, mime_type, size)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id AS "userId", name, s3_key AS "s3Key", mime_type AS "mimeType", size, created_at AS "createdAt"`,
    [file.userId, file.name, file.s3Key, file.mimeType, file.size],
  );
  return result.rows[0] as StoredFile;
}

export async function findFileById(id: string, userId: string): Promise<StoredFile | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id AS "userId", name, s3_key AS "s3Key", mime_type AS "mimeType", size, created_at AS "createdAt"
     FROM files WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (result.rows[0] as StoredFile | undefined) ?? null;
}

export async function listFilesByUser(userId: string): Promise<StoredFile[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id AS "userId", name, s3_key AS "s3Key", mime_type AS "mimeType", size, created_at AS "createdAt"
     FROM files WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows as StoredFile[];
}

export async function deleteFile(id: string, userId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM files WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
