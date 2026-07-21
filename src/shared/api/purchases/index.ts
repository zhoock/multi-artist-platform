/**
 * API functions for purchases (account-owned library).
 */

import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { invalidateMyPurchasesCache } from './cache';
import type { ApiMessageResponse, GetMyPurchasesResponse, Purchase, PurchaseTrack } from './types';

export type { ApiMessageResponse, GetMyPurchasesResponse, Purchase, PurchaseTrack };
export { getMyPurchasesCached, invalidateMyPurchasesCache } from './cache';
export { getMyPurchasesCacheEpoch, subscribeMyPurchasesCache } from './cache';

async function parsePurchasesResponse(response: Response): Promise<Purchase[]> {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as GetMyPurchasesResponse;
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as GetMyPurchasesResponse;

  if (!data.success || !data.purchases) {
    throw new Error(data.error || 'Failed to get purchases');
  }

  return data.purchases;
}

/** Load purchases for the authenticated account. */
export async function getMyPurchases(): Promise<Purchase[]> {
  const response = await fetchWithAuthSession('/api/my-purchases', {
    headers: {
      ...getAuthHeader(),
    },
  });
  return parsePurchasesResponse(response);
}

/** Soft-revoke a purchase from the authenticated library. */
export async function revokePurchase(purchaseId: string): Promise<void> {
  const response = await fetchWithAuthSession(
    `/api/my-purchases?purchaseId=${encodeURIComponent(purchaseId)}`,
    {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    }
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as ApiMessageResponse;
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  // Без этого hook `useAlbumOwnedByViewer` продолжит видеть удалённую покупку
  // и страница артиста не покажет Buy-кнопку до перезагрузки страницы.
  invalidateMyPurchasesCache();
}

/** Download URL for a track by purchase token */
export function getTrackDownloadUrl(purchaseToken: string, trackId: string): string {
  return `/api/download?token=${encodeURIComponent(purchaseToken)}&track=${encodeURIComponent(trackId)}`;
}

function buildAlbumZipFileName(artist: string, album: string): string {
  const slug = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const artistPart = slug(artist) || 'artist';
  const albumPart = slug(album) || 'album';
  return `${artistPart}-${albumPart}.zip`;
}

function buildZipEntryFileName(
  orderIndex: number,
  trackId: string,
  title: string,
  ext: string
): string {
  const safeTitle = title
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const index = String(orderIndex + 1).padStart(2, '0');
  return `${index}-${safeTitle || trackId}${ext}`;
}

function guessExtensionFromResponse(response: Response, fallback = '.mp3'): string {
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    const match = disposition.match(/filename\*=UTF-8''(.+)|filename="(.+)"/i);
    const raw = match?.[1] || match?.[2];
    if (raw) {
      const name = decodeURIComponent(raw);
      const dot = name.lastIndexOf('.');
      if (dot >= 0) {
        return name.slice(dot);
      }
    }
  }

  const type = response.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (type.includes('wav')) return '.wav';
  if (type.includes('mpeg') || type.includes('mp3')) return '.mp3';
  if (type.includes('flac')) return '.flac';
  return fallback;
}

export type AlbumDownloadProgress = {
  percent: number | null;
};

/** Download full album as zip via per-track entitlement-checked downloads. */
export async function downloadAlbumZip(
  purchase: Purchase,
  options?: { onProgress?: (progress: AlbumDownloadProgress) => void }
): Promise<{
  blob: Blob;
  filename: string;
}> {
  if (purchase.tracks.length === 0) {
    throw new Error('No tracks available for download');
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const totalTracks = purchase.tracks.length;
  const trackProgressCap = 90;

  for (let index = 0; index < totalTracks; index += 1) {
    options?.onProgress?.({
      percent: Math.max(1, Math.round((index / totalTracks) * trackProgressCap)),
    });

    const track = purchase.tracks[index];
    const response = await fetch(getTrackDownloadUrl(purchase.purchaseToken, track.trackId));

    if (!response.ok) {
      throw new Error(`Failed to download track: ${track.title}`);
    }

    const blob = await response.blob();
    const ext = guessExtensionFromResponse(response);
    zip.file(buildZipEntryFileName(index, track.trackId, track.title, ext), blob);

    options?.onProgress?.({
      percent: Math.round(((index + 1) / totalTracks) * trackProgressCap),
    });
  }

  options?.onProgress?.({ percent: 92 });

  const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    options?.onProgress?.({
      percent: 90 + Math.round(metadata.percent * 0.1),
    });
  });

  options?.onProgress?.({ percent: 100 });

  return {
    blob,
    filename: buildAlbumZipFileName(purchase.artist, purchase.album),
  };
}

export interface OwnedAlbumDownloadTrack {
  trackId: string;
  title: string;
}

/** Download owned album zip with per-track progress (session auth). */
export async function downloadOwnedAlbumZipByAuth(
  params: {
    albumId: string;
    artist: string;
    album: string;
    tracks: OwnedAlbumDownloadTrack[];
  },
  options?: { onProgress?: (progress: AlbumDownloadProgress) => void }
): Promise<void> {
  const { albumId, artist, album, tracks } = params;

  if (tracks.length === 0) {
    throw new Error('No tracks available for download');
  }

  options?.onProgress?.({ percent: null });

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const totalTracks = tracks.length;
  const trackProgressCap = 90;

  for (let index = 0; index < totalTracks; index += 1) {
    options?.onProgress?.({
      percent: Math.max(1, Math.round((index / totalTracks) * trackProgressCap)),
    });

    const track = tracks[index];
    const response = await fetchWithAuthSession(
      getTrackDownloadUrlForAlbumWithAuth(albumId, track.trackId),
      {
        headers: {
          ...getAuthHeader(),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download track: ${track.title}`);
    }

    const blob = await response.blob();
    const ext = guessExtensionFromResponse(response);
    zip.file(buildZipEntryFileName(index, track.trackId, track.title, ext), blob);

    options?.onProgress?.({
      percent: Math.round(((index + 1) / totalTracks) * trackProgressCap),
    });
  }

  options?.onProgress?.({ percent: 92 });

  const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    options?.onProgress?.({
      percent: 90 + Math.round(metadata.percent * 0.1),
    });
  });

  options?.onProgress?.({ percent: 100 });
  triggerBlobDownload(zipBlob, buildAlbumZipFileName(artist, album));
}

/** Session download: allowed when album was purchased or subscription is active (backend). */
export function getTrackDownloadUrlForAlbumWithAuth(albumId: string, trackId: string): string {
  return `/api/download?albumId=${encodeURIComponent(albumId)}&track=${encodeURIComponent(trackId)}`;
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const match = header.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  const raw = match?.[1] || match?.[2];
  if (!raw) {
    return null;
  }

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

/** @deprecated Prefer downloadOwnedAlbumZipByAuth for UI progress. Server zip has no byte progress until ready. */
export async function downloadAlbumByAuth(
  albumId: string,
  fallbackFilename: string,
  options?: { onProgress?: (progress: AlbumDownloadProgress) => void }
): Promise<void> {
  options?.onProgress?.({ percent: null });

  const response = await fetchWithAuthSession(
    `/api/download-album?albumId=${encodeURIComponent(albumId)}`,
    {
      headers: {
        ...getAuthHeader(),
      },
    }
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as ApiMessageResponse;
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const filename =
    parseFilenameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    fallbackFilename;
  const contentLengthHeader = response.headers.get('Content-Length');
  const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN;
  const hasKnownSize = Number.isFinite(totalBytes) && totalBytes > 0;

  if (!response.body) {
    options?.onProgress?.({ percent: 100 });
    const blob = await response.blob();
    triggerBlobDownload(blob, filename);
    return;
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value);
    receivedBytes += value.byteLength;

    if (hasKnownSize) {
      options?.onProgress?.({
        percent: Math.min(99, Math.round((receivedBytes / totalBytes) * 100)),
      });
    } else {
      options?.onProgress?.({ percent: null });
    }
  }

  options?.onProgress?.({ percent: 100 });

  const blob = new Blob(chunks, {
    type: response.headers.get('Content-Type') ?? 'application/zip',
  });
  triggerBlobDownload(blob, filename);
}
