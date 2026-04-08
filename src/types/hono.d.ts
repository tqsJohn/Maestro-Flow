// Hono context type extensions for TeamForge
// This file uses module augmentation (has export) to extend ContextVariableMap

export {};

declare module 'hono' {
  interface ContextVariableMap {
    validatedBody: any;
    user: { id: string; email: string };
    tenant: { orgId: string; slug: string; role: string };
    tenantDb: any;
    tenantClient: any;
  }
}
