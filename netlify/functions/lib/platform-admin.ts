import type { UserRole } from './jwt';

export interface AdminPrivilegeRow {
  role: string | null;
  is_admin: boolean;
}

/** JWT `role` claim: admin when is_admin or legacy users.role = 'admin'. */
export function jwtRoleFromDbUser(row: Pick<AdminPrivilegeRow, 'role' | 'is_admin'>): UserRole {
  if (row.is_admin === true || row.role === 'admin') return 'admin';
  return 'user';
}

export function isPlatformAdminFromRow(row: Pick<AdminPrivilegeRow, 'role' | 'is_admin'>): boolean {
  return jwtRoleFromDbUser(row) === 'admin';
}
