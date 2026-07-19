/**
 * Mid-weight album page model — open-album payload without lyrics.
 * Not interchangeable with full `IAlbums` (Dashboard / fat `/api/albums`).
 */

import type { detailsProps, IAlbums, TracksProps } from '@models';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { normalizeStemsVisibility } from '@shared/lib/stems/stemsVisibility';

export type AlbumContentVisibility = TrackVisibility;

export interface AlbumArtworkCredits {
  photographer: string;
  photographerURL: string;
  designer: string;
  designerURL: string;
}

export interface AlbumPurchaseInfo {
  allowDownloadSale: string;
  regularPrice: string;
  currency: string;
}

export interface AlbumVisibilityInfo {
  isPublished: boolean;
  isPublic: boolean;
}

/** Track row for the album page (list + player queue + purchase labels). */
export interface TrackDetails {
  id: string;
  title: string;
  duration: number;
  src: string;
  orderIndex: number;
  playbackLocked: boolean;
  visibility: AlbumContentVisibility;
  /** Mixer stems access — same enum as track visibility (renamed from stemsVisibility). */
  stemsAvailability: AlbumContentVisibility;
  audioContainer: string | null;
  audioCodec: string | null;
  audioBitrate: number | null;
  audioSampleRate: number | null;
  audioBitDepth: number | null;
  audioChannels: number | null;
  audioDuration: number | null;
  audioFileSize: number | null;
  /** Title per locale only — no lyrics / authorship blobs. */
  translations?: Partial<Record<'en' | 'ru', { title: string }>>;
}

export interface AlbumDetailsLocale {
  description: string;
  details: detailsProps[];
  artwork: AlbumArtworkCredits;
  fullName: string;
}

/**
 * Semantic album-page contract.
 * `credits` from the brief = music blocks in `details` + cover people in `artwork`.
 * Track/album ownership (`purchaseState`) stays on the purchases API / client hooks.
 */
export interface AlbumDetails {
  albumId: string;
  /** Public album slug — same as albumId in the current data model. */
  slug: string;
  title: string;
  cover: string;
  userId: string;
  /** DB primary key — payment APIs. */
  dbAlbumId: string;
  description: string;
  details: detailsProps[];
  /** Shared release JSON (date, UPC, sale flags, genreCodes, …) without cover credits. */
  release: Record<string, unknown>;
  artwork: AlbumArtworkCredits;
  purchase: AlbumPurchaseInfo;
  serviceButtons: Record<string, string>;
  visibility: AlbumVisibilityInfo;
  tracks: TrackDetails[];
  translations?: Partial<Record<'en' | 'ru', AlbumDetailsLocale>>;
}

const EMPTY_ARTWORK: AlbumArtworkCredits = {
  photographer: '',
  photographerURL: '',
  designer: '',
  designerURL: '',
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value.trim() || null : null;
}

function asNullablePositiveNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function parseDetails(raw: unknown): detailsProps[] {
  if (!Array.isArray(raw)) return [];
  return raw as detailsProps[];
}

function parseButtons(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) {
      out[key] = value;
    }
  }
  return out;
}

function parseRelease(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const release = { ...(raw as Record<string, unknown>) };
  delete release.photographer;
  delete release.photographerURL;
  delete release.designer;
  delete release.designerURL;
  return release;
}

function parsePurchase(release: Record<string, unknown>): AlbumPurchaseInfo {
  return {
    allowDownloadSale: asString(release.allowDownloadSale),
    regularPrice: asString(release.regularPrice, '0.99'),
    currency: asString(release.currency, 'RUB'),
  };
}

function parseArtwork(raw: unknown): AlbumArtworkCredits {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ARTWORK };
  const v = raw as Record<string, unknown>;
  return {
    photographer: asString(v.photographer),
    photographerURL: asString(v.photographerURL),
    designer: asString(v.designer),
    designerURL: asString(v.designerURL),
  };
}

function normalizeTrackDetails(raw: unknown): TrackDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const id = asString(v.id).trim();
  if (!id) return null;

  const durationRaw = v.duration;
  const duration =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? durationRaw
      : typeof durationRaw === 'string' && Number.isFinite(Number(durationRaw))
        ? Number(durationRaw)
        : 0;

  const orderIndex =
    typeof v.orderIndex === 'number' && Number.isFinite(v.orderIndex)
      ? v.orderIndex
      : typeof v.order_index === 'number' && Number.isFinite(v.order_index)
        ? v.order_index
        : 0;

  let translations: TrackDetails['translations'];
  if (v.translations && typeof v.translations === 'object') {
    const t = v.translations as Record<string, unknown>;
    const en = t.en && typeof t.en === 'object' ? (t.en as Record<string, unknown>) : null;
    const ru = t.ru && typeof t.ru === 'object' ? (t.ru as Record<string, unknown>) : null;
    translations = {};
    if (en && typeof en.title === 'string') translations.en = { title: en.title };
    if (ru && typeof ru.title === 'string') translations.ru = { title: ru.title };
    if (!translations.en && !translations.ru) translations = undefined;
  }

  return {
    id,
    title: asString(v.title),
    duration,
    src: asString(v.src),
    orderIndex,
    playbackLocked: v.playbackLocked === true,
    visibility: normalizeTrackVisibility(v.visibility),
    stemsAvailability: normalizeStemsVisibility(v.stemsAvailability ?? v.stemsVisibility),
    audioContainer: asNullableString(v.audioContainer),
    audioCodec: asNullableString(v.audioCodec),
    audioBitrate: asNullablePositiveNumber(v.audioBitrate),
    audioSampleRate: asNullablePositiveNumber(v.audioSampleRate),
    audioBitDepth: asNullablePositiveNumber(v.audioBitDepth),
    audioChannels: asNullablePositiveNumber(v.audioChannels),
    audioDuration: asNullablePositiveNumber(v.audioDuration),
    audioFileSize: asNullablePositiveNumber(v.audioFileSize),
    translations,
  };
}

export function isAlbumDetails(value: unknown): value is AlbumDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.albumId === 'string' &&
    v.albumId.trim().length > 0 &&
    typeof v.title === 'string' &&
    typeof v.cover === 'string' &&
    typeof v.userId === 'string' &&
    Array.isArray(v.tracks)
  );
}

export function normalizeAlbumDetails(raw: unknown): AlbumDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const albumId = asString(v.albumId).trim();
  if (!albumId) return null;

  const release = parseRelease(v.release);
  const purchaseRaw =
    v.purchase && typeof v.purchase === 'object' ? (v.purchase as Record<string, unknown>) : null;
  const visibilityRaw =
    v.visibility && typeof v.visibility === 'object'
      ? (v.visibility as Record<string, unknown>)
      : null;

  const tracks = Array.isArray(v.tracks)
    ? v.tracks.map(normalizeTrackDetails).filter((t): t is TrackDetails => t !== null)
    : [];

  let translations: AlbumDetails['translations'];
  if (v.translations && typeof v.translations === 'object') {
    const t = v.translations as Record<string, unknown>;
    translations = {};
    for (const lang of ['en', 'ru'] as const) {
      const locale = t[lang];
      if (!locale || typeof locale !== 'object') continue;
      const loc = locale as Record<string, unknown>;
      translations[lang] = {
        description: asString(loc.description),
        details: parseDetails(loc.details),
        artwork: parseArtwork(loc.artwork),
        fullName: asString(loc.fullName),
      };
    }
    if (!translations.en && !translations.ru) translations = undefined;
  }

  return {
    albumId,
    slug: asString(v.slug).trim() || albumId,
    title: asString(v.title),
    cover: asString(v.cover),
    userId: asString(v.userId),
    dbAlbumId: asString(v.dbAlbumId),
    description: asString(v.description),
    details: parseDetails(v.details),
    release,
    artwork: parseArtwork(v.artwork),
    purchase: purchaseRaw
      ? {
          allowDownloadSale: asString(purchaseRaw.allowDownloadSale),
          regularPrice: asString(purchaseRaw.regularPrice, '0.99'),
          currency: asString(purchaseRaw.currency, 'RUB'),
        }
      : parsePurchase(release),
    serviceButtons: parseButtons(v.serviceButtons ?? v.buttons),
    visibility: {
      isPublished: visibilityRaw ? visibilityRaw.isPublished === true : v.isPublished === true,
      isPublic: visibilityRaw ? visibilityRaw.isPublic !== false : v.isPublic !== false,
    },
    tracks,
    translations,
  };
}

/**
 * Map a fat `IAlbums` (or equivalent) into AlbumDetails for parity checks.
 * Explicitly drops lyrics / content / authorship / stems-only dashboard fields.
 */
export function mapFatAlbumToAlbumDetails(album: IAlbums): AlbumDetails {
  const release = parseRelease(album.release);
  const rootArtwork = parseArtwork({
    photographer: (album.release as Record<string, unknown> | undefined)?.photographer,
    photographerURL: (album.release as Record<string, unknown> | undefined)?.photographerURL,
    designer: (album.release as Record<string, unknown> | undefined)?.designer,
    designerURL: (album.release as Record<string, unknown> | undefined)?.designerURL,
  });

  const translations: AlbumDetails['translations'] = {};
  for (const lang of ['en', 'ru'] as const) {
    const locale = album.translations?.[lang];
    if (!locale) continue;
    translations[lang] = {
      description: asString(locale.description),
      details: parseDetails(locale.details),
      artwork: parseArtwork({
        photographer: locale.photographer,
        photographerURL: locale.photographerURL,
        designer: locale.designer,
        designerURL: locale.designerURL,
      }),
      fullName: asString(locale.fullName),
    };
  }

  const tracks: TrackDetails[] = (album.tracks ?? []).map((track: TracksProps) => {
    const trackTranslations: TrackDetails['translations'] = {};
    if (track.translations?.en?.title != null) {
      trackTranslations.en = { title: String(track.translations.en.title) };
    }
    if (track.translations?.ru?.title != null) {
      trackTranslations.ru = { title: String(track.translations.ru.title) };
    }

    return {
      id: String(track.id),
      title: asString(track.title),
      duration: typeof track.duration === 'number' ? track.duration : 0,
      src: asString(track.src),
      orderIndex:
        typeof track.order_index === 'number' && Number.isFinite(track.order_index)
          ? track.order_index
          : 0,
      playbackLocked: track.playbackLocked === true,
      visibility: normalizeTrackVisibility(track.visibility),
      stemsAvailability: normalizeStemsVisibility(track.stemsVisibility),
      audioContainer: track.audioContainer ?? null,
      audioCodec: track.audioCodec ?? null,
      audioBitrate: track.audioBitrate ?? null,
      audioSampleRate: track.audioSampleRate ?? null,
      audioBitDepth: track.audioBitDepth ?? null,
      audioChannels: track.audioChannels ?? null,
      audioDuration: track.audioDuration ?? null,
      audioFileSize: track.audioFileSize ?? null,
      translations: trackTranslations.en || trackTranslations.ru ? trackTranslations : undefined,
    };
  });

  return {
    albumId: asString(album.albumId),
    slug: asString(album.albumId),
    title: asString(album.album),
    cover: asString(album.cover),
    userId: asString(album.userId),
    dbAlbumId: asString(album.dbAlbumId),
    description: asString(album.description),
    details: parseDetails(album.details),
    release,
    artwork: rootArtwork,
    purchase: parsePurchase(release),
    serviceButtons: parseButtons(album.buttons),
    visibility: {
      isPublished: album.isPublished === true,
      isPublic: album.isPublic !== false,
    },
    tracks,
    translations: translations.en || translations.ru ? translations : undefined,
  };
}

/** Fields present on fat `/api/albums` tracks that AlbumDetails intentionally omits. */
export const ALBUM_DETAILS_EXCLUDED_TRACK_FIELDS = [
  'content',
  'lyrics',
  'authorship',
  'syncedLines',
] as const;

/** Fat album-level fields not carried into AlbumDetails (or reshaped). */
export const ALBUM_DETAILS_EXCLUDED_ALBUM_FIELDS = [
  'artist',
  'fullName',
  'hasDraftChanges',
  'album', // reshaped → title
  'buttons', // reshaped → serviceButtons
  'isPublished', // reshaped → visibility.isPublished
  'isPublic', // reshaped → visibility.isPublic
] as const;
