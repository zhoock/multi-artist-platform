/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';

import { platformSeoForLang } from '@shared/constants/platformBranding';
import { useArtistPageSeo } from '../useArtistPageSeo';

jest.mock('@shared/lib/publicSiteOrigin', () => ({
  buildPublicSiteUrl: (path: string) => `https://example.com${path}`,
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: jest.fn(() => ({
    displayName: 'Published Artist',
    displayLabel: 'Published Artist',
    isLoading: false,
  })),
}));

jest.mock('@entities/user/lib', () => ({
  loadTheBandFromDatabase: jest.fn(async () => ['Artist bio excerpt.']),
}));

describe('useArtistPageSeo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses platform fallback title/description and platform home canonical when artist not found', () => {
    const { result } = renderHook(() =>
      useArtistPageSeo({
        lang: 'ru',
        artistSlug: 'missing-artist',
        enabled: true,
        forcePlatformFallback: true,
      })
    );

    const platform = platformSeoForLang('ru');
    expect(result.current.title).toBe(platform.title);
    expect(result.current.description).toBe(platform.description);
    expect(result.current.canonical).toBe('https://example.com/ru');
    expect(result.current.isArtistSpecific).toBe(false);
  });

  it('keeps artist URL canonical for a published public artist', async () => {
    const { result } = renderHook(() =>
      useArtistPageSeo({
        lang: 'en',
        artistSlug: 'published-artist',
        enabled: true,
        forcePlatformFallback: false,
      })
    );

    await waitFor(() => {
      expect(result.current.description).toBe('Artist bio excerpt.');
    });

    expect(result.current.title).toBe('Published Artist — Site Name');
    expect(result.current.canonical).toBe('https://example.com/en?artist=published-artist');
    expect(result.current.isArtistSpecific).toBe(true);
  });

  it('keeps artist URL canonical for under-construction artists without forcePlatformFallback', () => {
    const { result } = renderHook(() =>
      useArtistPageSeo({
        lang: 'en',
        artistSlug: 'draft-artist',
        enabled: true,
        forcePlatformFallback: false,
      })
    );

    expect(result.current.canonical).toBe('https://example.com/en?artist=draft-artist');
    expect(result.current.isArtistSpecific).toBe(true);
  });
});
