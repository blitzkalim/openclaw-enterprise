# Secret Storage

## Problem

Each tenant needs to store API keys, OAuth tokens, webhook secrets for:
- WhatsApp providers (Gupshup, Twilio, Meta)
- Telegram bot tokens
- CRM integrations (Zoho, HubSpot, Salesforce)
- LLM providers (OpenAI, Anthropic)
- Email/SMS providers

These must be encrypted at rest and never exposed in logs/UI.

## Encryption Architecture

```
Tenant Secret
  -> AES-256-GCM encryption
    -> Master Key (environment variable)
      -> KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault)
        -> HSM (Enterprise)
```

## Master Key Management

### Self-Hosted (Community/Pro)

```bash
# .env
MASTER_KEY=$(openssl rand -hex 32)  # 256-bit key
```

Stored in:
- Docker secret
- Kubernetes secret
- Environment variable (last resort)

### SaaS (Managed)

```
AWS KMS / GCP Cloud KMS
  -> Key rotation every 90 days
  -> IAM-based access control
  -> Audit logging
```

## Encryption Implementation

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function encrypt(plaintext: string, masterKey: string): string {
  const iv = randomBytes(16);
  const salt = randomBytes(32);
  const key = scryptSync(masterKey, salt, 32);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Store: salt:iv:authTag:encrypted
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(ciphertext: string, masterKey: string): string {
  const [saltHex, ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = scryptSync(masterKey, salt, 32);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## Database Schema

```sql
CREATE TABLE tenant_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,  -- 'channel', 'crm', 'llm', 'email'
    provider VARCHAR(50) NOT NULL,   -- 'gupshup', 'zoho', 'openai'
    encrypted_value TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    auth_tag VARCHAR(64) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);
```

## Secret Access Patterns

| Access Pattern | Who | How |
|---------------|-----|-----|
| Store new secret | Admin | POST /api/secrets (encrypted in transit via TLS) |
| Use in API call | Gateway | Decrypt at runtime, use in memory only |
| Update secret | Admin | Overwrite with new encrypted value |
| Delete secret | Admin | Hard delete (or soft delete for audit) |
| View secret | NEVER | Only metadata shown in UI (last 4 chars, creation date) |

## UI Masking

```typescript
function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

// UI shows: "Token: abcd...wxyz (created 2024-01-01)"
// Never: "Token: actual_token_value_here"
```

## Logging Rules

```typescript
// NEVER log secrets
const SANITIZED_HEADERS = ['authorization', 'x-api-key', 'x-webhook-secret', 'cookie'];

function sanitizeForLog(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SANITIZED_HEADERS.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
```

## Rotation Strategy

### Automatic (SaaS)

```sql
-- Alert on secrets older than 90 days
SELECT tenant_id, name, created_at
FROM tenant_secrets
WHERE created_at < NOW() - INTERVAL '90 days';
```

- Email admin: "Your Zoho token expires in 7 days. Please re-authenticate."
- Graceful degradation: if refresh fails, queue for retry, alert admin

### Manual (Self-Hosted)

- Admin rotates via UI
- Old secret kept for 24 hours (graceful transition)
- New secret takes effect immediately

## Environment Variable Fallback

For single-user mode (backward compatibility):

```typescript
function getSecret(tenantId: string, name: string): string | null {
  // Multi-tenant mode
  if (process.env.DATABASE_URL) {
    const row = await db('tenant_secrets')
      .where({ tenant_id: tenantId, name })
      .first();
    return row ? decrypt(row.encrypted_value) : null;
  }

  // Legacy single-user mode
  return process.env[name.toUpperCase()];
}
```

## Audit

```sql
CREATE TABLE secret_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    secret_name VARCHAR(100),
    accessed_by UUID REFERENCES users(id),
    action VARCHAR(50),  -- 'create', 'read', 'update', 'delete', 'use'
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
