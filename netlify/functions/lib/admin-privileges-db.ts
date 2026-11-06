import type { PoolClient } from 'pg';
import type { AdminPrivilegeRow } from './platform-admin';
import { isPlatformAdminFromRow } from './platform-admin';
import { query, withClient } from './db';

export async function fetchAdminPrivileges(userId: string): Promise<AdminPrivilegeRow | null> {
  const result = await query<AdminPrivilegeRow>(
    `SELECT role, is_admin FROM users WHERE id = $1::uuid LIMIT 1`,
    [userId],
    0
  );
  return result.rows[0] ?? null;
}

export async function assertUserIsPlatformAdmin(userId: string): Promise<boolean> {
  const row = await fetchAdminPrivileges(userId);
  if (!row) return false;
  return isPlatformAdminFromRow(row);
}

export async function withUserPrivilegeMutationAllowed<T>(fn: (client: PoolClient) => Promise<T>) {
  return withClient(async (client) => {
    await client.query(`SET LOCAL app.allow_user_privilege_mutation = 'on'`);
    return fn(client);
  });
}
