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
