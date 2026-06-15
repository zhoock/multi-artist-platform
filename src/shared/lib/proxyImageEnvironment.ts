export const NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH = '/.netlify/functions/proxy-image';
export const NETLIFY_API_PROXY_IMAGE_PATH = '/api/proxy-image';

export function isLocalDevHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized.includes('localhost') ||
    normalized.includes('127.0.0.1')
  );
}

export function shouldUseNetlifyApiProxy(hostname?: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  const host = hostname ?? window.location.hostname;
  return !isLocalDevHostname(host);
}

export function getProxyImagePath(hostname?: string): string {
  return shouldUseNetlifyApiProxy(hostname)
    ? NETLIFY_API_PROXY_IMAGE_PATH
    : NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH;
}

/** Origin for absolute proxy-image URLs (browser or build/server fallback). */
export function resolveProxyImageOrigin(): string {
  if (typeof window !== 'undefined') {
    if (shouldUseNetlifyApiProxy()) {
      const { protocol, hostname, port } = window.location;
      return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    }
    return window.location.origin;
  }

  const fromEnv = (process.env.NETLIFY_SITE_URL || process.env.URL || '').trim();
  return fromEnv.replace(/\/+$/, '');
}
