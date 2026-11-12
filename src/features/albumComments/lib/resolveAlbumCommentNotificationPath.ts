import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildPublicAlbumPagePathWithComment } from '@shared/lib/seo/publicPagePaths';

export type AlbumCommentNotificationTarget = {
  kind: 'album';
  albumId: string;
  artistSlug: string;
  commentId: string;
};

/**
 * Builds an in-app route for an album comment notification row (full row click / router navigate).
 * Track-level comment notifications should resolve to their album page until a dedicated track route exists.
 */
export function resolveAlbumCommentNotificationPath(
  lang: RouteLang,
  target: AlbumCommentNotificationTarget
): string {
  return buildPublicAlbumPagePathWithComment(
    lang,
    target.albumId,
    target.artistSlug,
    target.commentId
  );
}
