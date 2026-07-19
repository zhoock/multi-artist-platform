/**
 * Client fetch for mid-weight album page payload.
 * Does not touch Redux — wiring into Album.tsx is a later stage.
 */

import { getToken } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { normalizeAlbumDetails, type AlbumDetails } from '../model/albumDetails';

export class AlbumDetailsFetchError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AlbumDetailsFetchError';
    this.status = status;
    this.code = code;
  }
}

export type FetchAlbumDetailsOptions = {
  signal?: AbortSignal;
};

/**
 * GET /api/artists/:slug/albums/:albumId → AlbumDetails
 */
export async function fetchAlbumDetails(
  artistSlug: string,
  albumId: string,
  options: FetchAlbumDetailsOptions = {}
): Promise<AlbumDetails> {
  const slug = artistSlug.trim();
  const id = albumId.trim();
  if (!slug) {
    throw new AlbumDetailsFetchError('Missing artist slug', 400);
  }
  if (!id) {
    throw new AlbumDetailsFetchError('Missing albumId', 400);
  }

  const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithAuthSession(
    `/api/artists/${encodeURIComponent(slug)}/albums/${encodeURIComponent(id)}`,
    {
      signal: options.signal,
      cache: 'no-store',
      headers,
    }
  );

  if (response.status === 404) {
    let code: string | undefined;
    try {
      const payload = (await response.json()) as { code?: string };
      code = payload.code;
    } catch {
      // ignore body parse errors
    }
    throw new AlbumDetailsFetchError('Album not found', 404, code);
  }

  if (!response.ok) {
    throw new AlbumDetailsFetchError(
      `Failed to load album details (${response.status})`,
      response.status
    );
  }

  const result = (await response.json()) as { success?: boolean; data?: unknown };
  if (!result.success) {
    throw new AlbumDetailsFetchError('Invalid album details response', 500);
  }

  const album = normalizeAlbumDetails(result.data);
  if (!album) {
    throw new AlbumDetailsFetchError('Album details failed validation', 500);
  }

  return album;
}
