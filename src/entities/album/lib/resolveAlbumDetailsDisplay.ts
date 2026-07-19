/**
 * Locale flatten for AlbumDetails (album page) — lighter than resolveAlbumForDisplay(IAlbums).
 */

import type { SupportedLang } from '@shared/model/lang';
import type { detailsProps } from '@models';
import { CANONICAL_GENRES } from '@shared/constants/canonicalGenres';
import {
  isTranslationValueMissing,
  resolveTranslationString,
} from '@shared/lib/i18n/resolveTranslationFallback';
import type { AlbumDetails, TrackDetails } from '../model/albumDetails';
import { dedupeMergedAlbumDetailsForDisplay } from './albumDetailSemanticKind';
import { stripGenreDetailBlocks } from './resolveAlbumDisplay';

function readGenreCodesFromRelease(release: Record<string, unknown> | undefined): string[] {
  if (!release || typeof release !== 'object') return [];
  const raw = release.genreCodes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function formatGenreDetailLine(codes: string[], lang: SupportedLang): string {
  if (codes.length === 0) return '';
  const words = codes
    .map((code) => {
      const opt = CANONICAL_GENRES.find((g) => g.code === code.trim().toLowerCase());
      const raw = opt ? (lang === 'ru' ? opt.label.ru : opt.label.en) : code.trim();
      return raw.toLowerCase();
    })
    .filter((w) => w.length > 0);
  if (words.length === 0) return '';
  const first = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  const rest = words.slice(1);
  const body = rest.length > 0 ? [first, ...rest].join(', ') : first;
  return `${body}.`;
}

function injectGenreDetailIfNeeded(
  details: detailsProps[],
  release: Record<string, unknown>,
  lang: SupportedLang
): detailsProps[] {
  const codes = readGenreCodesFromRelease(release);
  if (codes.length === 0) return details;
  const line = formatGenreDetailLine(codes, lang);
  if (!line) return details;
  const base = stripGenreDetailBlocks(details);
  const title = lang === 'ru' ? 'Жанр' : 'Genre';
  return [{ id: 1, title, content: [line] }, ...base];
}

function resolveTrackTitle(track: TrackDetails, lang: SupportedLang): string {
  const fromTranslations = resolveTranslationString(
    {
      en: track.translations?.en?.title,
      ru: track.translations?.ru?.title,
    },
    lang
  );
  return !isTranslationValueMissing(fromTranslations) ? fromTranslations : track.title;
}

/**
 * Flat AlbumDetails snapshot for the current UI language.
 * Does not mutate stored translations; injects genre block + artwork credits for display.
 */
export function resolveAlbumDetailsForDisplay(
  album: AlbumDetails,
  lang: SupportedLang
): AlbumDetails {
  const locale = album.translations?.[lang];
  const description =
    locale && !isTranslationValueMissing(locale.description)
      ? locale.description
      : album.description;

  const localeDetails = locale?.details?.length ? locale.details : album.details;
  const details = injectGenreDetailIfNeeded(
    dedupeMergedAlbumDetailsForDisplay(localeDetails ?? [], lang),
    album.release,
    lang
  );

  const artwork = locale?.artwork ?? album.artwork;

  const tracks = album.tracks.map((track) => ({
    ...track,
    title: resolveTrackTitle(track, lang),
  }));

  return {
    ...album,
    description,
    details,
    artwork,
    tracks,
  };
}
