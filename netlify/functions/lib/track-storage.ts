/**
 * Resolve Supabase Storage public URLs for album tracks.
 */

import { createSupabaseClient } from '../../../src/config/supabase';
import { STORAGE_BUCKET_NAME } from '../../../src/config/supabaseStorageUrl';

export async function resolveTrackPublicUrl(
  src: string,
  resolvedAlbumId: string,
  storageUserId: string | null
): Promise<string | null> {
  let audioUrl = src.trim();

  if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
    return audioUrl;
  }

  if (!audioUrl) {
    return null;
  }

  let normalizedPath = audioUrl;
  if (normalizedPath.startsWith('/audio/')) {
    normalizedPath = normalizedPath.slice(7);
  } else if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  if (!storageUserId && !normalizedPath.startsWith('users/')) {
    return null;
  }

  const possiblePaths: string[] = [];

  if (normalizedPath && storageUserId) {
    possiblePaths.push(`users/${storageUserId}/audio/${normalizedPath}`);
  }

  const fileName = normalizedPath.includes('/')
    ? normalizedPath.split('/').pop() || normalizedPath
    : normalizedPath;

  const albumIdVariants = [
    resolvedAlbumId,
    resolvedAlbumId.replace(/-remastered/i, '-Remastered'),
    resolvedAlbumId.replace(/-remastered/i, ' Remastered'),
    resolvedAlbumId.replace(/-remastered/i, 'Remastered'),
    resolvedAlbumId.replace(/-/g, '_'),
  ];

  if (storageUserId) {
    possiblePaths.push(
      ...albumIdVariants.map((albumId) => `users/${storageUserId}/audio/${albumId}/${fileName}`)
    );
  }

  if (normalizedPath.startsWith('users/')) {
    possiblePaths.push(normalizedPath);
  }

  const uniquePaths = [...new Set(possiblePaths)];
  const supabase = createSupabaseClient();
  if (!supabase) {
    return null;
  }

  for (const storagePath of uniquePaths) {
    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(storagePath);
    if (!urlData?.publicUrl) {
      continue;
    }

    try {
      const headResponse = await fetch(urlData.publicUrl, { method: 'HEAD' });
      if (headResponse.ok) {
        return urlData.publicUrl;
      }
    } catch {
      // try next path
    }
  }

  return null;
}

export function buildZipEntryFileName(
  orderIndex: number,
  trackId: string,
  title: string,
  src?: string | null
): string {
  const srcFileName = src?.split('/').pop()?.trim();
  const srcExt = srcFileName?.includes('.')
    ? srcFileName.slice(srcFileName.lastIndexOf('.'))
    : '.wav';
  const safeTitle = title
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const index = String(orderIndex + 1).padStart(2, '0');
  return `${index}-${safeTitle || trackId}${srcExt}`;
}

export function buildAlbumZipFileName(artist: string, album: string): string {
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
