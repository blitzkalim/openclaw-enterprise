# Permissions & RBAC

## Purpose
Document existing RBAC / ACL if any.

## Findings

### No Granular RBAC Detected

OpenClaw is designed as a **personal single-user assistant**. There is **no traditional RBAC system** with roles, permissions, or ACLs.

### Access Control Models Found

1. **DM / Group Policy (Channel-Level)**
   - File: `src/security/dm-policy-shared.ts`
   - Policies: `open`, `pairing`, `allowlist`, `disabled`
   - `allowFrom` arrays control who can DM the bot
   - Group chats use `groupPolicy` with `allowlist`
   - Pairing system: unknown senders get a pairing code

2. **Sandbox Policy (Agent-Level)**
   - File: `src/agents/sandbox/tool-policy.ts`
   - Controls which tools are allowed in sandboxed vs non-sandboxed sessions
   - Default sandbox allows: `bash`, `process`, `read`, `write`, `edit`
   - Default sandbox denies: `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway`

3. **Command Gating**
   - File: `src/channels/command-gating.ts`
   - Controls which CLI-equivalent commands can be executed from channels
   - `/status`, `/new`, `/reset`, etc. are gated

4. **Group Access Evaluation**
   - File: `src/plugin-sdk/group-access.ts` (via import)
   - `evaluateMatchedGroupAccessForPolicy()` for group chat allowlist logic

5. **Windows ACL (File System)**
   - File: `src/security/windows-acl.test.ts`
   - Platform-specific file permission checks for Windows

6. **Operator Scopes**
   - File: `src/gateway/server/plugin-route-runtime-scopes.ts`
   - Plugin routes can declare required operator scopes
   - Limited scope model for gateway method access

### No Multi-User Concepts

- No `role`, `permission`, `acl` tables or collections
- No user management interface
- No admin vs user distinction
- The "user" is always the owner of the local machine

## Evidence
- `src/security/dm-policy-shared.ts` — DM/group access policies
- `src/agents/sandbox/tool-policy.ts` — sandbox tool restrictions
- `src/channels/command-gating.ts` — command access control
- `src/security/windows-acl.test.ts` — OS-level ACL
- `src/gateway/server/plugin-route-runtime-scopes.ts` — operator scopes

## Notes
- Security model is "single owner + untrusted inbound DMs"
- All local files and processes are accessible to the main session
- Enterprise RBAC would need to be built from scratch
