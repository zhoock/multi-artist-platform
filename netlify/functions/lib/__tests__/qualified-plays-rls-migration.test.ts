import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('083 qualified_track_plays RLS migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../database/migrations/083_harden_qualified_track_plays_rls.sql'),
    'utf8'
  );

  test('enables RLS without policies', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  test('revokes public and Supabase API roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON qualified_track_plays FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL ON qualified_track_plays FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL ON qualified_track_plays FROM authenticated/i);
  });

  test('does not add GRANT statements', () => {
    expect(sql).not.toMatch(/^\s*GRANT\b/im);
  });
});

/**
 * Netlify uses DATABASE_URL (PostgreSQL), not PostgREST roles.
 * On Supabase, that role is typically BYPASSRLS — RLS blocks anon/authenticated only.
 * Verify on staging after applying 083:
 *   SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user;
 */
