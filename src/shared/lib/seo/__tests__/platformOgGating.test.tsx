/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';
import { waitFor } from '@testing-library/react';
import { Helmet } from 'react-helmet-async';

import { renderWithProviders } from '@shared/lib/test-utils';

function readMetaContents(selector: string): string[] {
  return Array.from(document.querySelectorAll<HTMLMetaElement>(selector)).map(
    (meta) => meta.content
  );
}

/** Mirrors App.tsx: platform OG/twitter title+description omitted when page owns SEO. */
function PlatformAppHelmet({
  pageOwnsHreflang,
  title,
  description,
}: {
  pageOwnsHreflang: boolean;
  title: string;
  description: string;
}) {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      {!pageOwnsHreflang ? <meta property="og:title" content={title} /> : null}
      {!pageOwnsHreflang ? <meta property="og:description" content={description} /> : null}
      {!pageOwnsHreflang ? <meta name="twitter:title" content={title} /> : null}
      {!pageOwnsHreflang ? <meta name="twitter:description" content={description} /> : null}
      <meta property="og:image" content="https://example.com/og/default.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://example.com/og/default.jpg" />
    </Helmet>
  );
}

describe('platform OG gating (SEO-001 P2)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  test('home route emits single platform og:title and twitter:title', async () => {
    renderWithProviders(
      <PlatformAppHelmet
        pageOwnsHreflang={false}
        title="Platform home"
        description="Platform description"
      />
    );

    await waitFor(() => expect(readMetaContents('meta[property="og:title"]')).toHaveLength(1));

    expect(readMetaContents('meta[property="og:title"]')).toEqual(['Platform home']);
    expect(readMetaContents('meta[property="og:description"]')).toEqual(['Platform description']);
    expect(readMetaContents('meta[name="twitter:title"]')).toEqual(['Platform home']);
    expect(readMetaContents('meta[name="twitter:description"]')).toEqual(['Platform description']);
  });

  test('deep route with page Helmet yields single page-specific og:title', async () => {
    renderWithProviders(
      <>
        <PlatformAppHelmet
          pageOwnsHreflang
          title="Platform home"
          description="Platform description"
        />
        <Helmet>
          <title>Beatles — Platform</title>
          <meta name="description" content="Artist description" />
          <meta property="og:title" content="Beatles — Platform" />
          <meta property="og:description" content="Artist description" />
          <meta name="twitter:title" content="Beatles — Platform" />
          <meta name="twitter:description" content="Artist description" />
        </Helmet>
      </>
    );

    await waitFor(() =>
      expect(readMetaContents('meta[property="og:title"]')).toEqual(['Beatles — Platform'])
    );

    expect(readMetaContents('meta[property="og:description"]')).toEqual(['Artist description']);
    expect(readMetaContents('meta[name="twitter:title"]')).toEqual(['Beatles — Platform']);
    expect(readMetaContents('meta[name="twitter:description"]')).toEqual(['Artist description']);
    expect(readMetaContents('meta[property="og:image"]')).toEqual([
      'https://example.com/og/default.jpg',
    ]);
  });
});
