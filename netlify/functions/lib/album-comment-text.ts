export const MAX_COMMENT_BODY_CHARS = 1000;

export function normalizeCommentBody(raw: unknown): { ok: true; body: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const body = raw;
  if (body.length > MAX_COMMENT_BODY_CHARS) return { ok: false };
  if (body.trim().length === 0) return { ok: false };
  return { ok: true, body };
}

export function resolveCommentDisplayName(row: {
  site_name: string | null;
  name: string | null;
  username: string | null;
}): string {
  return row.site_name?.trim() || row.name?.trim() || row.username?.trim() || 'Listener';
}

/** Public handle for @mentions (Instagram-style). */
export function resolveCommentMentionUsername(row: {
  username: string | null;
  public_slug: string | null;
}): string | null {
  const fromSlug = row.public_slug?.trim();
  if (fromSlug) return fromSlug;
  const fromUsername = row.username?.trim();
  return fromUsername || null;
}
