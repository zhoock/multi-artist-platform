/**
 * Pure mappers for GET /api/artists/:slug/albums/:albumId (AlbumDetails).
 * No lyrics / content / authorship — those stay on /api/track-lyrics.
 */

import type { detailsProps } from '../../../src/models';
import { normalizeTrackVisibility } from '../../../src/shared/lib/tracks/trackVisibility';
import { normalizeStemsVisibility } from '../../../src/shared/lib/stems/stemsVisibility';
import { resolveEffectiveContentVisibility } from '../../../src/shared/lib/payment/artistMonetization';
import { normalizeTrackIdString } from '../../../src/shared/lib/tracks/normalizeTrackIdString';
import { resolveAssetForPlayback, type TrackAssetRecord } from './assetResolver';
import type { ProcessingStatus } from '../../../src/shared/lib/audio/audioAssetPipelineConfig';
import type { SupportedLang } from './types';

export interface AlbumDetailsArtworkDto {
  photographer: string;
  photographerURL: string;
  designer: string;
  designerURL: string;
}

export interface AlbumDetailsPurchaseDto {
  allowDownloadSale: string;
  regularPrice: string;
  currency: string;
}

export interface AlbumDetailsVisibilityDto {
  isPublished: boolean;
  isPublic: boolean;
}

export interface TrackDetailsDto {
  id: string;
  title: string;
  duration: number;
  src: string;
  orderIndex: number;
  playbackLocked: boolean;
  visibility: 'public' | 'subscribers_only' | 'hidden';
  stemsAvailability: 'public' | 'subscribers_only' | 'hidden';
  audioContainer: string | null;
  audioCodec: string | null;
  audioBitrate: number | null;
  audioSampleRate: number | null;
  audioBitDepth: number | null;
  audioChannels: number | null;
  audioDuration: number | null;
  audioFileSize: number | null;
  processingStatus?: ProcessingStatus | null;
  waveformUrl?: string | null;
  waveformStatus?: ProcessingStatus | null;
  translations?: Partial<Record<'en' | 'ru', { title: string }>>;
}

export interface AlbumDetailsLocaleDto {
  description: string;
  details: detailsProps[];
  artwork: AlbumDetailsArtworkDto;
  fullName: string;
}

export interface AlbumDetailsDto {
  albumId: string;
  slug: string;
  title: string;
  cover: string;
  userId: string;
  dbAlbumId: string;
  description: string;
  details: detailsProps[];
  release: Record<string, unknown>;
  artwork: AlbumDetailsArtworkDto;
  purchase: AlbumDetailsPurchaseDto;
  serviceButtons: Record<string, string>;
  visibility: AlbumDetailsVisibilityDto;
  tracks: TrackDetailsDto[];
  translations?: Partial<Record<'en' | 'ru', AlbumDetailsLocaleDto>>;
}

export interface AlbumDetailsLocaleSource {
  lang: string;
  dbAlbumId: string;
  userId: string;
  albumId: string;
  title: string;
  fullName: string;
  description: string;
  cover: string;
  release: unknown;
  buttons: unknown;
  details: unknown;
  photographer: string;
  photographerURL: string;
  designer: string;
  designerURL: string;
  isPublic: boolean;
  isPublished: boolean;
  updatedAt: string | null;
  tracks: AlbumDetailsTrackSource[];
}

export interface AlbumDetailsTrackSource {
  trackId: string;
  title: string;
  duration: number | null;
  src: string | null;
  orderIndex: number;
  visibility: string | null;
  stemsVisibility: string | null;
  audioContainer: string | null;
  audioCodec: string | null;
  audioBitrate: number | null;
  audioSampleRate: number | null;
  audioBitDepth: number | null;
  audioChannels: number | null;
  audioDuration: number | null;
  audioFileSize: number | null;
  processingStatus?: ProcessingStatus | null;
}

export interface AlbumDetailsMapperContext {
  hasPremiumAccess: boolean;
  monetizationEnabled: boolean;
  userId: string;
  assetsByTrackId?: Map<string, TrackAssetRecord[]>;
  pipelineAvailable?: boolean;
}

const RELEASE_COVER_KEYS = ['photographer', 'photographerURL', 'designer', 'designerURL'] as const;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function parseDetails(raw: unknown): detailsProps[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as detailsProps[]) : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw as detailsProps[];
  if (typeof raw === 'object') return [raw as detailsProps];
  return [];
}

function stripReleaseCoverCredits(release: Record<string, unknown>): Record<string, unknown> {
  const next = { ...release };
  for (const key of RELEASE_COVER_KEYS) {
    delete next[key];
  }
  return next;
}

function parseButtons(raw: unknown): Record<string, string> {
  const obj = parseJsonObject(raw);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

function parseDuration(raw: number | null | undefined): number {
  if (raw == null) return 0;
  const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function optionalPositiveInt(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

function optionalPositiveDuration(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

function langRank(lang: string): number {
  if (lang === 'ru') return 0;
  if (lang === 'en') return 1;
  return 2;
}

function isSupportedLang(lang: string): lang is SupportedLang {
  return lang === 'en' || lang === 'ru';
}

function artworkFromLocale(locale: AlbumDetailsLocaleSource): AlbumDetailsArtworkDto {
  return {
    photographer: locale.photographer,
    photographerURL: locale.photographerURL,
    designer: locale.designer,
    designerURL: locale.designerURL,
  };
}

function purchaseFromRelease(release: Record<string, unknown>): AlbumDetailsPurchaseDto {
  return {
    allowDownloadSale: asString(release.allowDownloadSale),
    regularPrice: asString(release.regularPrice, '0.99'),
    currency: asString(release.currency, 'RUB'),
  };
}

function findWaveformAsset(assets: TrackAssetRecord[]): TrackAssetRecord | undefined {
  return assets.find(
    (a) => a.type === 'waveform' && a.format === 'json' && a.variant === 'default'
  );
}

function parseWaveformStatus(raw: string | undefined): ProcessingStatus | null {
  if (raw === 'pending' || raw === 'processing' || raw === 'ready' || raw === 'failed') {
    return raw;
  }
  return null;
}

function mergeTracks(
  locales: AlbumDetailsLocaleSource[],
  ctx: AlbumDetailsMapperContext
): TrackDetailsDto[] {
  const sorted = [...locales].sort((a, b) => langRank(a.lang) - langRank(b.lang));

  const orderById = new Map<string, number>();
  const sourceById = new Map<string, AlbumDetailsTrackSource>();
  const titlesById = new Map<string, Partial<Record<'en' | 'ru', { title: string }>>>();

  for (const locale of sorted) {
    for (const track of locale.tracks) {
      const id = normalizeTrackIdString(track.trackId) || String(track.trackId);
      if (!orderById.has(id)) {
        orderById.set(id, track.orderIndex);
        sourceById.set(id, track);
      } else {
        orderById.set(id, Math.min(orderById.get(id)!, track.orderIndex));
      }
      if (isSupportedLang(locale.lang)) {
        const prev = titlesById.get(id) ?? {};
        prev[locale.lang] = { title: track.title };
        titlesById.set(id, prev);
      }
    }
  }

  const ids = [...orderById.keys()].sort((a, b) => {
    const oa = orderById.get(a) ?? 0;
    const ob = orderById.get(b) ?? 0;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });

  const mapped: TrackDetailsDto[] = [];

  for (const id of ids) {
    const track = sourceById.get(id)!;
    const trackVis = normalizeTrackVisibility(track.visibility);
    const stemsVis = normalizeStemsVisibility(track.stemsVisibility);

    // Public album page: hide fully-hidden tracks (no Mixer stems either).
    if (trackVis === 'hidden' && stemsVis === 'hidden') {
      continue;
    }

    const visibility = resolveEffectiveContentVisibility(trackVis, ctx.monetizationEnabled);
    const stemsAvailability = resolveEffectiveContentVisibility(stemsVis, ctx.monetizationEnabled);
    const needLock = visibility === 'subscribers_only' && !ctx.hasPremiumAccess;
    const trackKey = normalizeTrackIdString(track.trackId) || String(track.trackId);
    const assets = ctx.assetsByTrackId?.get(trackKey) ?? [];
    const processingStatus = (track.processingStatus ?? 'ready') as ProcessingStatus;
    const pipelineAvailable = ctx.pipelineAvailable === true;

    const resolved = resolveAssetForPlayback(
      assets,
      {
        purpose: 'playback',
        processingStatus,
        hasPremiumAccess: ctx.hasPremiumAccess,
      },
      ctx.userId
    );

    const resolvedSrc = resolved.url ?? '';

    const waveformAsset = findWaveformAsset(assets);
    const resolvedWaveform = resolveAssetForPlayback(
      assets,
      {
        purpose: 'waveform',
        processingStatus,
        hasPremiumAccess: ctx.hasPremiumAccess,
      },
      ctx.userId
    );
    const waveformUrl = needLock ? null : resolvedWaveform.url;
    const waveformStatus = pipelineAvailable
      ? parseWaveformStatus(waveformAsset?.status)
      : undefined;

    const translations = titlesById.get(id);

    mapped.push({
      id,
      title: track.title,
      duration: parseDuration(track.duration),
      src: needLock ? '' : resolvedSrc,
      orderIndex: orderById.get(id) ?? 0,
      playbackLocked: needLock,
      visibility,
      stemsAvailability,
      audioContainer: track.audioContainer?.trim() || null,
      audioCodec: track.audioCodec?.trim() || null,
      audioBitrate: optionalPositiveInt(track.audioBitrate),
      audioSampleRate: optionalPositiveInt(track.audioSampleRate),
      audioBitDepth: optionalPositiveInt(track.audioBitDepth),
      audioChannels: optionalPositiveInt(track.audioChannels),
      audioDuration: optionalPositiveDuration(track.audioDuration),
      audioFileSize: optionalPositiveInt(track.audioFileSize),
      processingStatus: pipelineAvailable ? processingStatus : undefined,
      waveformUrl: pipelineAvailable ? waveformUrl : undefined,
      waveformStatus,
      translations: translations && (translations.en || translations.ru) ? translations : undefined,
    });
  }

  return mapped;
}

/**
 * Merge locale rows + apply public track access policy → AlbumDetailsDto.
 */
export function mapLocalesToAlbumDetails(
  locales: AlbumDetailsLocaleSource[],
  ctx: {
    hasPremiumAccess: boolean;
    monetizationEnabled: boolean;
    assetsByTrackId?: Map<string, TrackAssetRecord[]>;
    pipelineAvailable?: boolean;
  }
): AlbumDetailsDto | null {
  if (locales.length === 0) return null;

  const sortedForShared = [...locales].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
  const shared = sortedForShared[0];
  const en = locales.find((l) => l.lang === 'en');
  const ru = locales.find((l) => l.lang === 'ru');
  const title =
    (en?.title && en.title.trim()) ||
    (ru?.title && ru.title.trim()) ||
    (shared.title && shared.title.trim()) ||
    '';

  const sortedForText = [...locales].sort((a, b) => langRank(a.lang) - langRank(b.lang));
  const textRoot = sortedForText[0] ?? shared;
  const release = stripReleaseCoverCredits(parseJsonObject(shared.release));
  const userId = shared.userId;

  const translations: NonNullable<AlbumDetailsDto['translations']> = {};
  for (const locale of sortedForText) {
    if (!isSupportedLang(locale.lang)) continue;
    translations[locale.lang] = {
      description: locale.description,
      details: parseDetails(locale.details),
      artwork: artworkFromLocale(locale),
      fullName: locale.fullName,
    };
  }

  const tracks = mergeTracks(locales, {
    hasPremiumAccess: ctx.hasPremiumAccess,
    monetizationEnabled: ctx.monetizationEnabled,
    userId,
    assetsByTrackId: ctx.assetsByTrackId,
    pipelineAvailable: ctx.pipelineAvailable,
  });

  return {
    albumId: shared.albumId,
    slug: shared.albumId,
    title,
    cover: asString(shared.cover),
    userId,
    dbAlbumId: shared.dbAlbumId,
    description: textRoot.description,
    details: parseDetails(textRoot.details),
    release,
    artwork: artworkFromLocale(textRoot),
    purchase: purchaseFromRelease(release),
    serviceButtons: parseButtons(shared.buttons),
    visibility: {
      isPublished: shared.isPublished === true,
      isPublic: shared.isPublic !== false,
    },
    tracks,
    translations: translations.en || translations.ru ? translations : undefined,
  };
}

export function isAlbumDetailsVisibleToPublicViewer(album: AlbumDetailsDto): boolean {
  return (
    album.visibility.isPublished &&
    album.visibility.isPublic &&
    Boolean(album.title.trim()) &&
    album.tracks.length > 0
  );
}
