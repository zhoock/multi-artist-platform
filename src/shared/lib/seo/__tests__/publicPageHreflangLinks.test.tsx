/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { Helmet } from 'react-helmet-async';

import { renderWithProviders } from '@shared/lib/test-utils';
import { publicPageHreflangLinks } from '../PublicPageHreflangLinks';

const hreflang = {
  ru: 'https://example.com/ru/offer',
  en: 'https://example.com/en/offer',
  xDefault: 'https://example.com/ru/offer',
};

function readAlternateLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll('link[rel="alternate"]'));
}

function readRenderedCanonical(): string | null {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
}

describe('publicPageHreflangLinks Helmet rendering', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('renders ru, en, and x-default alternates alongside canonical', async () => {
    renderWithProviders(
      <Helmet>
        <link rel="canonical" href={hreflang.ru} />
        {publicPageHreflangLinks(hreflang)}
      </Helmet>
    );

    await waitFor(() => {
      expect(readRenderedCanonical()).toBe(hreflang.ru);
      expect(readAlternateLinks()).toHaveLength(3);
    });

    const byLang = Object.fromEntries(
      readAlternateLinks().map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')])
    );

    expect(byLang).toEqual({
      ru: hreflang.ru,
      en: hreflang.en,
      'x-default': hreflang.xDefault,
    });
  });
});
