/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { Helmet } from 'react-helmet-async';

import { renderWithProviders } from '@shared/lib/test-utils';
import { platformSeoForLang } from '@shared/constants/platformBranding';
import { ArtistPageSeoHelmet } from '@pages/Home/ui/ArtistPageSeoHelmet';
import { ArtistNotFound } from '@shared/ui/artistNotFound/ArtistNotFound';
import {
  expectNoindexRobotsMeta,
  expectNoRobotsMeta,
  readRenderedRobotsContent,
} from './helmetRobotsTestUtils';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

function readRenderedTitle(): string | null {
  return document.querySelector('title')?.textContent ?? null;
}

function readRenderedDescription(): string | null {
  return document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;
}

function readRenderedCanonical(): string | null {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
}

describe('SEO-005 artist-not-found canonical', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('artist not found renders platform fallback SEO with platform home canonical and noindex', async () => {
    const platform = platformSeoForLang('ru');

    renderWithProviders(
      <>
        <Helmet>
          <title>Platform default</title>
          <meta name="description" content="Platform description" />
          <link rel="canonical" href="https://example.com/ru" />
        </Helmet>
        <ArtistPageSeoHelmet
          seo={{
            title: platform.title,
            description: platform.description,
            canonical: 'https://example.com/ru',
            isArtistSpecific: false,
          }}
          hreflang={{
            ru: 'https://example.com/ru?artist=missing-artist',
            en: 'https://example.com/en?artist=missing-artist',
            xDefault: 'https://example.com/en?artist=missing-artist',
          }}
        />
        <ArtistNotFound />
      </>
    );

    await waitFor(() => {
      expect(readRenderedTitle()).toBe(platform.title);
      expect(readRenderedDescription()).toBe(platform.description);
      expect(readRenderedCanonical()).toBe('https://example.com/ru');
    });

    await expectNoindexRobotsMeta();
  });

  test('published public artist SEO remains indexable with artist canonical', async () => {
    renderWithProviders(
      <ArtistPageSeoHelmet
        seo={{
          title: 'Published Artist — Site Name',
          description: 'Artist bio excerpt.',
          canonical: 'https://example.com/en?artist=published-artist',
          isArtistSpecific: true,
        }}
        hreflang={{
          ru: 'https://example.com/ru?artist=published-artist',
          en: 'https://example.com/en?artist=published-artist',
          xDefault: 'https://example.com/en?artist=published-artist',
        }}
      />
    );

    await waitFor(() => {
      expect(readRenderedTitle()).toBe('Published Artist — Site Name');
      expect(readRenderedDescription()).toBe('Artist bio excerpt.');
      expect(readRenderedCanonical()).toBe('https://example.com/en?artist=published-artist');
      expect(readRenderedRobotsContent()).toBeNull();
    });

    await expectNoRobotsMeta();
  });
});
