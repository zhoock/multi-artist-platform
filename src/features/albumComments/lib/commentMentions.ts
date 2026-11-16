export type CommentBodySegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string };

const MENTION_RE = /@[\w.]+/g;

export function buildReplyDraftWithMention(mentionUsername: string | null | undefined): string {
  const handle = mentionUsername?.trim();
  if (!handle) return '';
  return `@${handle} `;
}

export function splitCommentBodyIntoSegments(body: string): CommentBodySegment[] {
  if (!body) return [{ kind: 'text', value: '' }];

  const segments: CommentBodySegment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: 'text', value: body.slice(lastIndex, index) });
    }
    segments.push({ kind: 'mention', value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: 'text', value: body.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: body }];
}
