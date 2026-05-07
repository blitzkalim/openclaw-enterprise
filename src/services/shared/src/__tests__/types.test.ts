import { describe, it, expect } from 'vitest';
import type { User, UserSession, ApiToken, ChannelIdentity, ChannelClaim, TeamCtx, AgentJobPayload } from '../types/team-ctx.js';

describe('types/team-ctx', () => {
  it('should satisfy User type shape', () => {
    const user: User = {
      id: 'uuid-1',
      email: 'test@example.com',
      passwordHash: 'argon2id$...',
      name: 'Test User',
      isAdmin: false,
      workspaceId: 'ws-1',
      status: 'active',
      createdAt: new Date(),
    };
    expect(user.email).toBe('test@example.com');
    expect(user.status).toBe('active');
  });

  it('should satisfy AgentJobPayload type shape', () => {
    const payload: AgentJobPayload = {
      userId: 'user-1',
      workspaceId: 'ws-1',
      isAdmin: false,
      source: 'cookie',
      channel: 'whatsapp',
      threadId: '+919876543210',
      sessionKey: 'u:user-1:wa:+919876543210',
      text: 'Hello',
      attachments: [],
      webhookMessageId: 'wamid.abc',
      timestamp: new Date().toISOString(),
    };
    expect(payload.sessionKey).toBe('u:user-1:wa:+919876543210');
  });

  it('should satisfy TeamCtx type shape', () => {
    const ctx: TeamCtx = {
      userId: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
      isAdmin: true,
      workspaceId: 'ws-1',
      source: 'api-token',
    };
    expect(ctx.source).toBe('api-token');
  });
});
