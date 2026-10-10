/**
 * Refuses local dev tooling against non-local Postgres (e.g. production Supabase).
 * Pure: reads only the passed URL / process.env.DATABASE_URL, no I/O, no bypass flag.
 * Anything that cannot be classified with certainty is treated as remote.
 */

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'host.docker.internal',
  'postgres',
]);

/** pg-connection-string lets query params override the URL host. */
const HOST_OVERRIDE_PARAMS = ['host', 'hostaddr'];

export type DatabaseUrlHostResolution = { host: string } | { host: null; reason: string };

export function isLocalDatabaseHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (LOCAL_DATABASE_HOSTS.has(normalized)) return true;
  return normalized.endsWith('.local');
}

/** Host that pg will actually connect to, or null when it cannot be determined reliably. */
export function resolveDatabaseUrlHost(databaseUrl: string): DatabaseUrlHostResolution {
  const trimmed = databaseUrl.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return { host: null, reason: 'not a postgres:// or postgresql:// URL' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { host: null, reason: 'unparseable connection string' };
  }

  for (const param of HOST_OVERRIDE_PARAMS) {
    if (url.searchParams.has(param)) {
      return { host: null, reason: `host override query parameter "${param}"` };
    }
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    return { host: null, reason: 'empty host (pg would fall back to PGHOST / unix socket)' };
  }
  return { host };
}

/** Null when DATABASE_URL is a local Postgres; otherwise a reason without credentials. */
export function getLocalDatabaseBlockReason(
  databaseUrl: string | undefined = process.env.DATABASE_URL
): string | null {
  if (!databaseUrl?.trim()) return 'DATABASE_URL is not set';

  const resolved = resolveDatabaseUrlHost(databaseUrl);
  if (resolved.host === null) return `cannot verify DATABASE_URL host: ${resolved.reason}`;
  if (!isLocalDatabaseHost(resolved.host)) {
    return `DATABASE_URL host "${resolved.host}" is not a local database`;
  }
  return null;
}

/**
 * Call first in local scripts that write billing data, before importing db or any write helper.
 * No env flag (DEV_PAYMENT_MODE, NETLIFY_DEV, CONTEXT, …) can override it.
 */
export function assertLocalDatabaseForScript(scriptName: string): void {
  const reason = getLocalDatabaseBlockReason();
  if (reason) {
    throw new Error(
      `${scriptName} refuses to run: ${reason}. ` +
        'Point DATABASE_URL at a local Postgres (localhost / docker) — there is no override.'
    );
  }
}
