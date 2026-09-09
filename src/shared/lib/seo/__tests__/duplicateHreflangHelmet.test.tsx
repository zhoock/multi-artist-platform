/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { Helmet } from 'react-helmet-async';

import { renderWithProviders } from '@shared/lib/test-utils';
import { publicPageHreflangLinks } from '../PublicPageHreflangLinks';

const homeHreflang = {
  ru: 'https://example.com/ru',
  en: 'https://example.com/en',
  xDefault: 'https://example.com/ru',
};

const albumHreflang = {
  ru: 'https://example.com/ru/albums/rubber-soul?artist=beatles',
  en: 'https://example.com/en/albums/rubber-soul?artist=beatles',
  xDefault: 'https://example.com/ru/albums/rubber-soul?artist=beatles',
};

function readAlternateLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll('link[rel="alternate"]'));
}

describe('duplicate hreflang prevention', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('page-level Helmet alone yields exactly three album alternates', async () => {
    renderWithProviders(
      <Helmet>
        <link rel="canonical" href={albumHreflang.ru} />
        {publicPageHreflangLinks(albumHreflang)}
      </Helmet>
    );

    await waitFor(() => expect(readAlternateLinks()).toHaveLength(3));

    expect(
      Object.fromEntries(
        readAlternateLinks().map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ])
      )
    ).toEqual({
      ru: albumHreflang.ru,
      en: albumHreflang.en,
      'x-default': albumHreflang.xDefault,
    });
  });

  test('nested Helmets without App hreflang do not duplicate alternates', async () => {
    renderWithProviders(
      <>
        <Helmet>
          <link rel="canonical" href={homeHreflang.ru} />
        </Helmet>
        <Helmet>
          <link rel="canonical" href={albumHreflang.ru} />
          {publicPageHreflangLinks(albumHreflang)}
        </Helmet>
      </>
    );

    await waitFor(() => expect(readAlternateLinks()).toHaveLength(3));

    const hrefs = readAlternateLinks().map((link) => link.getAttribute('href'));
    expect(hrefs).not.toContain(homeHreflang.ru);
    expect(hrefs).not.toContain(homeHreflang.en);
  });
});
