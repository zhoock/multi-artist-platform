import type { AlbumCommentDto } from '@shared/api/albumComments';

export type MentionTarget = {
  displayName: string;
  publicSlug: string | null;
  isArtist: boolean;
};

export type CommentBodySegment =
  | { kind: 'text'; value: string }
  | {
      kind: 'mention';
      label: string;
      publicSlug: string | null;
      isArtist: boolean;
    };

const LEGACY_SLUG_MENTION_RE = /@([A-Za-z0-9_.-]+)/g;

export function collectMentionTargets(comments: AlbumCommentDto[]): MentionTarget[] {
  const map = new Map<string, MentionTarget>();

  const walkComments = (list: AlbumCommentDto[]) => {
    for (const comment of list) {
      if (!comment.deletedAt) {
        const displayName = comment.author.displayName.trim();
        if (displayName) {
          map.set(comment.author.userId, {
            displayName,
            publicSlug: comment.author.publicSlug?.trim() || null,
            isArtist: comment.author.isArtist,
          });
        }
      }
      if (comment.replies.length > 0) {
        walkComments(comment.replies);
      }
    }
  };

  walkComments(comments);
  return [...map.values()];
}

export function buildReplyDraftWithMention(displayName: string | null | undefined): string {
  const name = displayName?.trim();
  if (!name) return '';
  return `@${name} `;
}

function sortMentionTargetsByDisplayName(targets: MentionTarget[]): MentionTarget[] {
  return [...targets].sort((a, b) => b.displayName.length - a.displayName.length);
}

function splitWithLegacySlugMentions(body: string): CommentBodySegment[] {
  const segments: CommentBodySegment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(LEGACY_SLUG_MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: 'text', value: body.slice(lastIndex, index) });
    }
    segments.push({
      kind: 'mention',
      label: match[0],
      publicSlug: null,
      isArtist: false,
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: 'text', value: body.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: body }];
}

export function splitCommentBodyIntoSegments(
  body: string,
  mentionTargets: MentionTarget[] = []
): CommentBodySegment[] {
  if (!body) return [{ kind: 'text', value: '' }];

  if (mentionTargets.length === 0) {
    return splitWithLegacySlugMentions(body);
  }

  const sorted = sortMentionTargetsByDisplayName(mentionTargets);
  const slugToTarget = new Map<string, MentionTarget>();
  for (const target of mentionTargets) {
    const slug = target.publicSlug?.trim().toLowerCase();
    if (slug) slugToTarget.set(slug, target);
  }

  const segments: CommentBodySegment[] = [];
  let i = 0;

  while (i < body.length) {
    const at = body.indexOf('@', i);
    if (at === -1) {
      segments.push({ kind: 'text', value: body.slice(i) });
      break;
    }

    if (at > i) {
      segments.push({ kind: 'text', value: body.slice(i, at) });
    }

    let matched = false;

    for (const target of sorted) {
      const prefix = `@${target.displayName}`;
      if (!body.startsWith(prefix, at)) continue;
      const next = at + prefix.length;
      if (next < body.length && !/\s/.test(body[next])) continue;
      segments.push({
        kind: 'mention',
        label: prefix,
        publicSlug: target.publicSlug,
        isArtist: target.isArtist,
      });
      i = next;
      matched = true;
      break;
    }

    if (!matched) {
      const rest = body.slice(at);
      const legacy = rest.match(/^@([A-Za-z0-9_.-]+)/);
      if (legacy) {
        const slugKey = legacy[1].toLowerCase();
        const target = slugToTarget.get(slugKey);
        if (target) {
          segments.push({
            kind: 'mention',
            label: `@${target.displayName}`,
            publicSlug: target.publicSlug,
            isArtist: target.isArtist,
          });
        } else {
          segments.push({
            kind: 'mention',
            label: legacy[0],
            publicSlug: null,
            isArtist: false,
          });
        }
        i = at + legacy[0].length;
        matched = true;
      }
    }

    if (!matched) {
      segments.push({ kind: 'text', value: body[at] });
      i = at + 1;
    }
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value: body }];
}
