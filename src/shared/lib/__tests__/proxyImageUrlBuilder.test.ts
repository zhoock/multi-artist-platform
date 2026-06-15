jest.mock('@shared/lib/proxyImageEnvironment', () => ({
  NETLIFY_API_PROXY_IMAGE_PATH: '/api/proxy-image',
  NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH: '/.netlify/functions/proxy-image',
  resolveProxyImageOrigin: jest.fn(),
  getProxyImagePath: jest.fn(),
  isLocalDevHostname: jest.requireActual('@shared/lib/proxyImageEnvironment').isLocalDevHostname,
  shouldUseNetlifyApiProxy: jest.requireActual('@shared/lib/proxyImageEnvironment')
    .shouldUseNetlifyApiProxy,
}));

import {
  NETLIFY_API_PROXY_IMAGE_PATH,
  NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH,
  getProxyImagePath,
  resolveProxyImageOrigin,
} from '@shared/lib/proxyImageEnvironment';
import { buildProxyImageUrlFromStoragePath, normalizeProxyImageUrl } from '@shared/api/storage';

const storagePath = 'users/uuid/hero/hero-1-1920.jpg';

describe('buildProxyImageUrlFromStoragePath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds dev proxy URL for localhost', () => {
    (resolveProxyImageOrigin as jest.Mock).mockReturnValue('http://localhost:8080');
    (getProxyImagePath as jest.Mock).mockReturnValue(NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH);

    expect(buildProxyImageUrlFromStoragePath(storagePath)).toBe(
      `http://localhost:8080${NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH}?path=${encodeURIComponent(storagePath)}`
    );
  });

  it('builds production proxy URL for custom domain', () => {
    (resolveProxyImageOrigin as jest.Mock).mockReturnValue('https://artists.example.com');
    (getProxyImagePath as jest.Mock).mockReturnValue(NETLIFY_API_PROXY_IMAGE_PATH);

    expect(buildProxyImageUrlFromStoragePath(storagePath)).toBe(
      `https://artists.example.com${NETLIFY_API_PROXY_IMAGE_PATH}?path=${encodeURIComponent(storagePath)}`
    );
  });

  it('builds production proxy URL for netlify.app host', () => {
    (resolveProxyImageOrigin as jest.Mock).mockReturnValue(
      'https://multi-artist-platform.netlify.app'
    );
    (getProxyImagePath as jest.Mock).mockReturnValue(NETLIFY_API_PROXY_IMAGE_PATH);

    expect(buildProxyImageUrlFromStoragePath(storagePath)).toContain(NETLIFY_API_PROXY_IMAGE_PATH);
  });
});

describe('normalizeProxyImageUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveProxyImageOrigin as jest.Mock).mockReturnValue(
      'https://multi-artist-platform.netlify.app'
    );
    (getProxyImagePath as jest.Mock).mockReturnValue(NETLIFY_API_PROXY_IMAGE_PATH);
  });

  it('rewrites bare hero storage paths', () => {
    expect(normalizeProxyImageUrl(storagePath)).toBe(
      `https://multi-artist-platform.netlify.app${NETLIFY_API_PROXY_IMAGE_PATH}?path=${encodeURIComponent(storagePath)}`
    );
  });

  it('rewrites stale localhost proxy URLs', () => {
    const stale = `http://localhost:8080${NETLIFY_FUNCTIONS_PROXY_IMAGE_PATH}?path=${encodeURIComponent(storagePath)}`;
    const normalized = normalizeProxyImageUrl(stale);

    expect(normalized).toContain(NETLIFY_API_PROXY_IMAGE_PATH);
    expect(normalized).not.toContain('localhost');
  });

  it('leaves unrelated URLs unchanged', () => {
    const url = 'https://cdn.example.com/cover.jpg';
    expect(normalizeProxyImageUrl(url)).toBe(url);
  });
});
