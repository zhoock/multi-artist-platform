/**
 * First-party anonymous listener id for qualified play analytics (no IP/email).
 */

const STORAGE_KEY = 'listener_anon_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function getOrCreateListenerAnonId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return crypto.randomUUID();
  }

  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && isValidUuid(existing)) {
      return existing;
    }
    const created = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
