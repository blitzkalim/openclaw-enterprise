/* ------------------------------------------------------------------ */
/*  Core domain types used by Gateway and Agent Worker                 */
/* ------------------------------------------------------------------ */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  isAdmin: boolean;
  workspaceId: string | null;
  status: 'active' | 'disabled';
  createdAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  hash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface ChannelIdentity {
  id: string;
  userId: string;
  channel: string;
  externalId: string;
  displayName: string | null;
  createdAt: Date;
}

export interface ChannelClaim {
  id: string;
  channel: string;
  externalId: string;
  claimCode: string;
  mode: 'A' | 'B' | 'C';
  workspaceId: string | null;
  expiresAt: Date;
  claimedBy: string | null;
  claimedAt: Date | null;
  createdAt: Date;
}

export interface TeamCtx {
  userId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  workspaceId: string | null;
  source: 'cookie' | 'api-token' | 'legacy-token';
}

export interface AttachmentRef {
  s3Key: string;
  mimeType: string;
  error?: string;
}

export interface AgentJobPayload {
  userId: string;
  workspaceId: string | null;
  isAdmin: boolean;
  source: string;
  channel: string;
  threadId: string;
  sessionKey: string;
  text: string;
  attachments: AttachmentRef[];
  webhookMessageId: string | null;
  timestamp: string;
  replyChannel?: string;
  _sig?: string;
}

export interface AgentReplyMessage {
  sessionKey: string;
  channel: string;
  threadId: string;
  text: string;
  attachments?: AttachmentRef[];
  timestamp: string;
}

export interface UserFiles {
  soulMd: string | null;
  agentsMd: string | null;
  memoryMd: string | null;
  userMd: string | null;
  tasksMd: string | null;
}
