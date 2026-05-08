# RBAC Enforcement

## Middleware Stack

```
Request
  -> ingress (TLS, rate limit)
    -> auth-adapter (JWT validation)
      -> tenant-context (resolve tenant_id)
        -> rbac-middleware (check permission)
          -> route handler
```

## Auth Middleware

```typescript
// src/enterprise/rbac-middleware.ts
import { Request, Response, NextFunction } from 'express';

interface AuthContext {
  tenantId: string;
  userId: string;
  roles: string[];
  permissions: string[];
}

interface PermissionCheck {
  resource: string;
  action: string;
  scope?: 'tenant' | 'workspace' | 'own';
}

export function requirePermission(...checks: PermissionCheck[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = req.authContext as AuthContext;

    if (!ctx) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Platform super admin bypass
    if (ctx.roles.includes('platform_super_admin')) {
      return next();
    }

    // Check if user has any of the required permissions
    const hasPermission = checks.some(check => {
      const perm = `${check.resource}.${check.action}`;
      return ctx.permissions.includes(perm) ||
             ctx.permissions.includes(`${check.resource}.*`) ||
             ctx.permissions.includes('*');
    });

    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

// Convenience helpers
export const requireAdmin = requirePermission({ resource: 'settings', action: 'manage' });
export const requireManager = requirePermission({ resource: 'leads', action: 'manage' });
export const requireAgent = requirePermission({ resource: 'leads', action: 'own' });
```

## Route-Level Enforcement

```typescript
// Example: Lead routes
import { Router } from 'express';
import { requirePermission, requireManager } from '../enterprise/rbac-middleware';

const router = Router();

// Create lead (agent can create own, manager can create any)
router.post('/leads',
  requirePermission(
    { resource: 'leads', action: 'own' },
    { resource: 'leads', action: 'manage' }
  ),
  createLeadHandler
);

// Assign lead (manager only)
router.post('/leads/:id/assign',
  requirePermission({ resource: 'leads', action: 'assign' }),
  assignLeadHandler
);

// View all leads (manager/admin), own leads (agent)
router.get('/leads',
  requirePermission(
    { resource: 'leads', action: 'manage' },
    { resource: 'leads', action: 'own' },
    { resource: 'leads', action: 'read' }
  ),
  listLeadsHandler
);

// Export data (admin only)
router.get('/export',
  requirePermission({ resource: 'export_data', action: 'manage' }),
  exportDataHandler
);
```

## Data-Level Enforcement (Row-Level Security)

### Postgres RLS (Recommended for Enterprise)

```sql
-- Enable RLS on all tenant tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's data
CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Policy: Agents can only see their assigned leads
CREATE POLICY lead_assignment ON leads
  USING (
    tenant_id = current_setting('app.current_tenant')::UUID
    AND (
      assigned_to = current_setting('app.current_user')::UUID
      OR current_setting('app.current_role') IN ('tenant_owner', 'tenant_admin', 'manager')
    )
  );

-- Set tenant context per query
SET LOCAL app.current_tenant = 'tenant-uuid';
SET LOCAL app.current_user = 'user-uuid';
SET LOCAL app.current_role = 'manager';
```

### Application-Level Filtering (MVP / OSS)

If RLS is too complex for self-hosted Community edition:

```typescript
// src/enterprise/tenant-filter.ts
export function withTenantFilter<T extends { tenant_id: string }>(
  query: Knex.QueryBuilder,
  tenantId: string,
  userId?: string,
  role?: string
): Knex.QueryBuilder {
  query.where('tenant_id', tenantId);

  // Agents only see their own records
  if (role === 'agent') {
    query.andWhere('assigned_to', userId);
  }

  return query;
}

// Usage
const leads = await withTenantFilter(
  db('leads').select('*'),
  ctx.tenantId,
  ctx.userId,
  ctx.roles[0]
);
```

## WebSocket Permission Enforcement

```typescript
// In WebSocket connection handler
ws.on('connection', (socket, req) => {
  const ctx = req.authContext;

  // Subscribe only to tenant-scoped events
  socket.join(`tenant:${ctx.tenantId}`);

  // For agent-scoped events
  if (ctx.roles.includes('agent')) {
    socket.join(`agent:${ctx.userId}`);
  }

  socket.on('subscribe', (channel) => {
    // Verify user can access this channel
    if (channel.startsWith('tenant:') && channel !== `tenant:${ctx.tenantId}`) {
      socket.emit('error', 'Unauthorized channel');
      return;
    }
    socket.join(channel);
  });
});
```

## Permission Caching

```typescript
// Cache user permissions in Redis to avoid DB lookup per request
const PERMISSIONS_CACHE_TTL = 300; // 5 minutes

async function getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
  const cacheKey = `permissions:${tenantId}:${userId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const permissions = await db('roles')
    .join('memberships', 'roles.id', 'memberships.role_id')
    .where('memberships.user_id', userId)
    .where('memberships.tenant_id', tenantId)
    .select('roles.permissions')
    .first();

  const perms = permissions?.permissions || [];
  await redis.setex(cacheKey, PERMISSIONS_CACHE_TTL, JSON.stringify(perms));
  return perms;
}
```

## Audit Trail for Permission Denials

```typescript
// Log all 403s for compliance
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function(body) {
    if (res.statusCode === 403) {
      auditLogger.log({
        tenantId: req.authContext?.tenantId,
        userId: req.authContext?.userId,
        action: 'permission_denied',
        resource: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    }
    return originalJson.call(this, body);
  };
  next();
});
```
