export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SELLER';
export type Permission = 'commercial' | 'administration' | 'dashboard' | 'technical' | 'team';

const permissions: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: ['commercial', 'administration', 'dashboard', 'technical', 'team'],
  ADMIN: ['commercial', 'technical', 'team'],
  SELLER: ['commercial'],
};

export function temPermissao(role: UserRole, permission: Permission) {
  return permissions[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super administrador', ADMIN: 'Administrador', SELLER: 'Vendedor',
};
