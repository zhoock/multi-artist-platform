import type { AlbumEditable } from '@models';

import { isAlbumDraft } from './albumPublication';

function releaseString(release: Record<string, unknown>, key: string): string {
  const value = release?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function releaseGenreCodes(release: Record<string, unknown>): string[] {
  const raw = release?.genreCodes;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

export function resolveAlbumCoverKey(cover: AlbumEditable['cover']): string {
  if (typeof cover === 'string') return cover.trim();
  if (cover && typeof cover === 'object' && 'img' in cover) {
    return String((cover as { img?: string }).img ?? '').trim();
  }
  return '';
}

export { isAlbumDraft } from './albumPublication';

/** Черновик можно опубликовать: обязательные поля из мастера + обложка + минимум один трек. */
export function isAlbumReadyToPublish(album: AlbumEditable): boolean {
  if (!isAlbumDraft(album)) return false;
  if (!album.album?.trim()) return false;
  if (!resolveAlbumCoverKey(album.cover)) return false;
  if (!album.description?.trim()) return false;
  if ((album.tracks?.length ?? 0) < 1) return false;

  const release = (album.release ?? {}) as Record<string, unknown>;
  if (!releaseString(release, 'date')) return false;
  if (!releaseString(release, 'UPC')) return false;
  if (releaseGenreCodes(release).length === 0) return false;

  return true;
}

export type AlbumPublishHintKey = 'ready' | 'cover' | 'tracks' | 'fields';

/** Какой hint показать у кнопки Publish в дашборде. */
export function getAlbumPublishHintKey(album: AlbumEditable): AlbumPublishHintKey {
  if (!isAlbumDraft(album)) return 'ready';
  if (!resolveAlbumCoverKey(album.cover)) return 'cover';
  if ((album.tracks?.length ?? 0) < 1) return 'tracks';
  if (!isAlbumReadyToPublish(album)) return 'fields';
  return 'ready';
}
