/**
 * Album `cover` column shape in Postgres (JSONB).
 * New covers: `{ img, playerBackground }`. Plain string = legacy img base (no player bg).
 */

import {
  parseAlbumCoverPlayerBackground,
  type AlbumCoverPlayerBackground,
} from '@shared/lib/imageColor/albumCoverPlayerBackground';
import { getAlbumStorageBaseName } from '@shared/lib/albumCoverUrl';

function normalizeCoverImg(value: string): string {
  return getAlbumStorageBaseName(value.trim());
}

export interface AlbumCoverStorageValue {
  img: string;
  playerBackground: AlbumCoverPlayerBackground;
  backImg?: string;
}

/** Serialized `albums.cover` JSONB (front may be legacy string or full object with optional back). */
export type AlbumCoverDbValue = AlbumCoverStorageValue | { img: string; backImg?: string } | string;

export interface ParsedAlbumCoverField {
  img: string;
  playerBackground?: AlbumCoverPlayerBackground;
  /** Storage base name for album back cover (optional second side). */
  backImg?: string;
}

/** Unwrap JSONB string values and plain JSON text before reading `img`. */
export function normalizeAlbumCoverRaw(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return raw;
}

function readImgFromUnknown(value: unknown): string {
  const normalized = normalizeAlbumCoverRaw(value);
  if (typeof normalized === 'string') {
    return normalizeCoverImg(normalized);
  }
  if (normalized && typeof normalized === 'object' && 'img' in normalized) {
    const img = (normalized as { img?: unknown }).img;
    return typeof img === 'string' ? normalizeCoverImg(img.trim()) : '';
  }
  return '';
}

function readBackImgFromUnknown(value: unknown): string {
  const normalized = normalizeAlbumCoverRaw(value);
  if (normalized && typeof normalized === 'object' && 'backImg' in normalized) {
    const backImg = (normalized as { backImg?: unknown }).backImg;
    return typeof backImg === 'string' ? normalizeCoverImg(backImg.trim()) : '';
  }
  return '';
}

export function parseAlbumCoverField(raw: unknown): ParsedAlbumCoverField {
  const normalized = normalizeAlbumCoverRaw(raw);
  const img = readImgFromUnknown(normalized);
  const backImg = readBackImgFromUnknown(normalized) || undefined;
  let playerBackground: AlbumCoverPlayerBackground | undefined;
  if (normalized && typeof normalized === 'object' && 'playerBackground' in normalized) {
    playerBackground =
      parseAlbumCoverPlayerBackground(
        (normalized as { playerBackground?: unknown }).playerBackground
      ) ?? undefined;
  }
  return {
    img,
    ...(playerBackground ? { playerBackground } : {}),
    ...(backImg ? { backImg } : {}),
  };
}

export function backImgFromStorageField(raw: unknown): string {
  return parseAlbumCoverField(raw).backImg ?? '';
}

/** Canonical cover base name for Storage URLs and player meta. */
export function coverImgFromStorageField(raw: unknown): string {
  return parseAlbumCoverField(raw).img;
}

export function isAlbumCoverStorageValue(value: unknown): value is AlbumCoverStorageValue {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const img = typeof row.img === 'string' ? row.img.trim() : '';
  if (!img) return false;
  return parseAlbumCoverPlayerBackground(row.playerBackground) !== null;
}

export function buildAlbumCoverStorageValue(
  img: string,
  playerBackground: AlbumCoverPlayerBackground,
  backImg?: string
): AlbumCoverStorageValue {
  const base = normalizeCoverImg(img.trim());
  if (!base) {
    throw new Error('Album cover img is required');
  }
  if (!parseAlbumCoverPlayerBackground(playerBackground)) {
    throw new Error('Invalid album cover playerBackground');
  }
  const normalizedBack = backImg?.trim() ? normalizeCoverImg(backImg) : undefined;
  return {
    img: base,
    playerBackground,
    ...(normalizedBack ? { backImg: normalizedBack } : {}),
  };
}

/** Merge front/back cover updates for albums.cover JSONB without dropping the other side. */
export function mergeAlbumCoverPayloadForSave(opts: {
  prior?: ParsedAlbumCoverField;
  front?: AlbumCoverStorageValue | null;
  backBaseName?: string | null;
}): AlbumCoverDbValue | undefined {
  const hasBackUpdate = opts.backBaseName != null && opts.backBaseName.trim() !== '';
  if (!opts.front && !hasBackUpdate) {
    return undefined;
  }

  const prior = opts.prior ?? { img: '' };
  const img = (opts.front?.img ?? prior.img).trim();
  if (!img) return undefined;

  const playerBackground = opts.front?.playerBackground ?? prior.playerBackground;
  const backFromFront = opts.front?.backImg;
  const backImg =
    opts.backBaseName != null && opts.backBaseName.trim() !== ''
      ? normalizeCoverImg(opts.backBaseName)
      : (backFromFront ?? prior.backImg);

  if (playerBackground) {
    return buildAlbumCoverStorageValue(img, playerBackground, backImg);
  }
  if (backImg) {
    return { img: normalizeCoverImg(img), backImg };
  }
  return normalizeCoverImg(img);
}

/** Value for Postgres JSONB `cover` column (prefer object; node-pg serializes to jsonb). */
export function coerceAlbumCoverForDb(cover: unknown): AlbumCoverDbValue | null {
  if (cover === undefined || cover === null) return null;
  const normalized = normalizeAlbumCoverRaw(cover);
  if (isAlbumCoverStorageValue(normalized)) {
    const row = normalized as AlbumCoverStorageValue & { backImg?: string };
    return buildAlbumCoverStorageValue(normalized.img, normalized.playerBackground, row.backImg);
  }
  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    return trimmed ? normalizeCoverImg(trimmed) : null;
  }
  if (normalized && typeof normalized === 'object') {
    const parsed = parseAlbumCoverField(normalized);
    if (parsed.img && parsed.playerBackground) {
      return buildAlbumCoverStorageValue(parsed.img, parsed.playerBackground, parsed.backImg);
    }
    if (parsed.img && parsed.backImg) {
      return { img: normalizeCoverImg(parsed.img), backImg: parsed.backImg };
    }
    if (parsed.img) {
      return parsed.img;
    }
  }
  return null;
}

export function coverImgBaseForStorageCleanup(cover: unknown): string | null {
  const parsed = parseAlbumCoverField(cover);
  return parsed.img || null;
}
