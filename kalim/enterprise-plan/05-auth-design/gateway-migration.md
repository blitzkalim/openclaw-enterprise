# Gateway Token Migration

## Current State

OpenClaw uses a single `OPENCLAW_GATEWAY_TOKEN` for all access:

```typescript
// src/gateway/auth.ts (current)
function authorizeHttpGatewayConnect(req) {
  const token = extractBearerToken(req);
  if (!safeEqualSecret(token, config.gatewayToken)) {
    throw new UnauthorizedError();
  }
}
```

## Target State

Support both JWT (multi-tenant) and legacy token (single-user) simultaneously.

## Migration Path

### Step 1: Add Enterprise Auth Adapter (No upstream changes yet)

Create `src/enterprise/auth-adapter.ts`:

```typescript
import { verify } from 'jsonwebtoken';
import { safeEqualSecret } from '../gateway/auth';

interface AuthContext {
  mode: 'jwt' | 'legacy';
  tenantId: string;
  userId: string;
  roles: string[];
  permissions: string[];
}

export function resolveAuthContext(req: Request): AuthContext {
  // 1. Try JWT (Authorization: Bearer <jwt>)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = verify(token, JWKS_PUBLIC_KEY, { audience: 'openclaw-gateway' });
      return {
        mode: 'jwt',
        tenantId: decoded.tid as string,
        userId: decoded.sub as string,
        roles: decoded.roles as string[],
        permissions: decoded.perms as string[],
      };
    } catch {
      // Fall through to legacy
    }
  }

  // 2. Try legacy OPENCLAW_GATEWAY_TOKEN
  const legacyToken = req.headers['x-openclaw-token'] || extractBearerToken(req);
  if (legacyToken && safeEqualSecret(legacyToken, config.gatewayToken)) {
    return {
      mode: 'legacy',
      tenantId: 'default',
      userId: 'admin',
      roles: ['owner'],
      permissions: ['*'],
    };
  }

  throw new UnauthorizedError();
}
```

### Step 2: Patch Gateway Auth (Minimal upstream edit)

Modify `src/gateway/auth.ts`:

```typescript
// Add at top of authorizeHttpGatewayConnect
import { resolveAuthContext } from '../enterprise/auth-adapter';

export function authorizeHttpGatewayConnect(req) {
  try {
    const ctx = resolveAuthContext(req);
    req.authContext = ctx;
    return true;
  } catch (e) {
    // Fall back to original logic for backward compat
    const token = extractBearerToken(req);
    if (safeEqualSecret(token, config.gatewayToken)) {
      req.authContext = { mode: 'legacy', tenantId: 'default', userId: 'admin', roles: ['owner'] };
      return true;
    }
    throw e;
  }
}
```

Lines changed: ~20 lines in `src/gateway/auth.ts`

### Step 3: WebSocket Auth

Modify `src/gateway/server-ws-runtime.ts`:

```typescript
// In WS connection handler
ws.on('connection', (socket, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  const ctx = resolveAuthContext({ headers: { authorization: `Bearer ${token}` } });
  socket.authContext = ctx;
});
```

### Step 4: Inject Tenant Context to All Handlers

Modify `src/gateway/server-http.ts`:

```typescript
// Before route dispatch
app.use((req, res, next) => {
  try {
    const ctx = resolveAuthContext(req);
    req.tenantId = ctx.tenantId;
    req.userId = ctx.userId;
    req.userRoles = ctx.roles;
  } catch {
    // Let route handlers decide if auth is required
  }
  next();
});
```

### Step 5: Config Adapter Selection

Modify `src/config/io.ts`:

```typescript
// In readConfig / writeConfig
export async function loadConfig(tenantId?: string): Promise<Config> {
  if (process.env.DATABASE_URL && tenantId && tenantId !== 'default') {
    return loadConfigFromPostgres(tenantId);
  }
  // Legacy file-based
  return loadConfigFromFile();
}
```

### Step 6: Session Store Selection

Modify `src/sessions/session-store.ts`:

```typescript
export async function getSession(sessionKey: string, tenantId?: string) {
  if (process.env.REDIS_URL && tenantId) {
    return redis.get(`tenant:${tenantId}:session:${sessionKey}`);
  }
  // Legacy file-based
  return readSessionFile(sessionKey);
}
```

## Environment-Based Mode Selection

| Variable | Mode | Behavior |
|----------|------|----------|
| `DATABASE_URL` set | Multi-tenant | JWT auth, Postgres config, Redis sessions |
| `DATABASE_URL` unset | Single-user | Legacy token, file config, file sessions |

This means a single binary works for both modes — zero config change for existing users.

## Rollback Plan

If JWT auth causes issues:
1. Unset `DATABASE_URL` — instant fallback to single-user mode
2. Or set `OPENCLAW_AUTH_MODE=legacy` to force legacy auth even with DB configured
3. Existing `OPENCLAW_GATEWAY_TOKEN` continues to work in both modes
