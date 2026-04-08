import { PERMISSION_MATRIX } from '../db/schema/core/permissions.js';

export type Role = 'owner' | 'admin' | 'member' | 'guest';
export type Permission = `${string}:${string}`;

export function checkPermission(role: Role, resource: string, action: string): boolean {
  const permissions = PERMISSION_MATRIX[role];
  if (!permissions) return false;

  // Global wildcard
  if (permissions.includes('*')) return true;

  // Exact match
  if (permissions.includes(`${resource}:${action}`)) return true;

  // Resource wildcard
  if (permissions.includes(`${resource}:*`)) return true;

  return false;
}

export function checkPermissions(role: Role, required: Permission[]): boolean {
  return required.every((p) => {
    const parts = p.split(':');
    const resource = parts[0];
    const action = parts.slice(1).join(':');
    return checkPermission(role, resource, action);
  });
}

export function getRolePermissions(role: Role): Permission[] {
  return (PERMISSION_MATRIX[role] || []) as Permission[];
}

export function hasAnyPermission(role: Role, resource: string): boolean {
  const permissions = PERMISSION_MATRIX[role];
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.some((p) => p.startsWith(`${resource}:`));
}
