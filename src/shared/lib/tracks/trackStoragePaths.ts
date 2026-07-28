/**
 * Storage path helpers for Audio Asset Pipeline (master + derived outputs).
 */

import type {
  AssetFormat,
  AssetType,
  AssetVariant,
} from '@shared/lib/audio/audioAssetPipelineConfig';

export type TrackStorageAssetKind = 'master' | 'derived';

export function buildTrackAudioBasePrefix(userId: string, albumId: string): string {
  return `users/${userId}/audio/${albumId}`;
}

/** Master upload: users/{userId}/audio/{albumId}/original/{fileName} */
export function buildMasterStoragePath(userId: string, albumId: string, fileName: string): string {
  const base = buildTrackAudioBasePrefix(userId, albumId);
  return `${base}/original/${fileName}`;
}

/** Derived output: users/{userId}/audio/{albumId}/derived/{type}/{format}_{variant}/{fileName} */
export function buildDerivedStoragePath(
  userId: string,
  albumId: string,
  type: AssetType,
  format: AssetFormat,
  variant: AssetVariant,
  fileName: string
): string {
  const base = buildTrackAudioBasePrefix(userId, albumId);
  const folder = `${type}/${format}_${variant}`;
  return `${base}/derived/${folder}/${fileName}`;
}

/** Replace file extension while keeping track id + slug base. */
export function replaceStorageFileExtension(fileName: string, extension: string): string {
  const ext = extension.replace(/^\./, '').toLowerCase();
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return `${withoutExt}.${ext}`;
}

export function isMasterStoragePath(storagePath: string): boolean {
  return storagePath.includes('/original/');
}

export function isDerivedStoragePath(storagePath: string): boolean {
  return storagePath.includes('/derived/');
}
