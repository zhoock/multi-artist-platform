/**
 * Миграция на стороне ответа API: если нет translations.ru, копируем с плоских полей
 * (legacy до полного выноса переводимых данных в translations).
 * Не пишет в БД — только обогащает объект для клиента.
 */

import type {
  AlbumEditable,
  IAlbumTranslationsLocale,
  IAlbumTrackTranslationsLocale,
  TracksProps,
} from '@models';

function cloneDetails(details: unknown[]): IAlbumTranslationsLocale['details'] {
  if (!Array.isArray(details)) return [];
  try {
    return JSON.parse(JSON.stringify(details)) as IAlbumTranslationsLocale['details'];
  } catch {
    return [];
  }
}

function hydrateTrack<T extends TracksProps>(track: T): T {
  if (track.translations?.ru) return track;
  const ru: IAlbumTrackTranslationsLocale = {
    title: track.title ?? '',
    authorship: track.authorship,
  };
  return {
    ...track,
    translations: { ...track.translations, ru },
  };
}

/** Дополняет translations.ru и по трекам, если слот ru отсутствует. */
export function hydrateMissingRuTranslationsOnAlbum<T extends AlbumEditable>(album: T): T {
  const tracksHydrated = (album.tracks ?? []).map((t) =>
    (t as TracksProps).translations?.ru ? t : hydrateTrack(t as TracksProps)
  ) as T['tracks'];

  if (album.translations?.ru) {
    return { ...album, tracks: tracksHydrated };
  }

  const ru: IAlbumTranslationsLocale = {
    fullName: album.fullName ?? '',
    description: album.description ?? '',
    details: cloneDetails(album.details ?? []),
  };

  return {
    ...album,
    translations: { ...album.translations, ru },
    tracks: tracksHydrated,
  };
}
