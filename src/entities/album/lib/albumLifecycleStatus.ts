import type { AlbumEditable } from '@models';

import { isAlbumPublished } from './albumPublication';
import { isAlbumReadyToPublish } from './isAlbumReadyToPublish';

/** Бейдж жизненного цикла в списке альбомов (не видимость). */
export type AlbumListDraftBadge = 'draft' | 'draft-changes' | 'ready-to-publish' | null;

export function getAlbumListDraftBadge(album: AlbumEditable): AlbumListDraftBadge {
  if (!isAlbumPublished(album)) {
    return isAlbumReadyToPublish(album) ? 'ready-to-publish' : 'draft';
  }

  if (album.hasDraftChanges === true) {
    return 'draft-changes';
  }

  return null;
}
