import { getProxyImagePath, resolveProxyImageOrigin } from '@shared/lib/proxyImageEnvironment';

/**
 * Локальный URL для proxy-image по пути в bucket `users/...`.
 * Единственная точка построения proxy URL для storage paths.
 */
export function buildProxyImageUrlFromStoragePath(storagePath: string): string {
  const origin = resolveProxyImageOrigin();
  const proxyPath = getProxyImagePath();
  return `${origin}${proxyPath}?path=${encodeURIComponent(storagePath)}`;
}

function extractStoragePathFromProxyInput(input: string): string | null {
  if (input.startsWith('users/')) {
    return input;
  }

  const pathMatch = input.match(/[?&]path=([^&]+)/);
  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return null;
}

/** Rewrites stale dev proxy URLs or bare hero storage paths into a current proxy URL. */
export function normalizeProxyImageUrl(url: string): string {
  if (!url) {
    return url;
  }

  const isStaleLocal =
    url.includes('localhost') || url.includes('127.0.0.1') || url.includes(':8080');

  if (isStaleLocal) {
    const path = extractStoragePathFromProxyInput(url);
    if (path) {
      return buildProxyImageUrlFromStoragePath(path);
    }
    return url;
  }

  if (url.startsWith('users/') && url.includes('/hero/')) {
    return buildProxyImageUrlFromStoragePath(url);
  }

  return url;
}
