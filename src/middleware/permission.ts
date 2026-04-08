import type { Context, Next } from 'hono';
import { checkPermission, type Role } from '../services/rbac.service.js';
import type { TenantContext } from './tenant.js';

export function requirePermission(resource: string, action: string) {
  return async (c: Context, next: Next) => {
    const tenant = c.get('tenant') as TenantContext | undefined;
    if (!tenant) {
      return c.json({ error: 'Tenant context required' }, 400);
    }

    const allowed = checkPermission(tenant.role as Role, resource, action);
    if (!allowed) {
      return c.json(
        {
          error: 'Forbidden',
          required: `${resource}:${action}`,
          role: tenant.role,
        },
        403,
      );
    }

    await next();
  };
}
