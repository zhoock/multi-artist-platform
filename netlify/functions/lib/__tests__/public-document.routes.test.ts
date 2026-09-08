import { describe, expect, test } from '@jest/globals';

import { classifyDocumentRoute, isStaticAssetPath } from '../public-document/routes';

describe('public-document route classification', () => {
  test('valid locale home without artist → fast200', () => {
    expect(classifyDocumentRoute('/ru', null)).toEqual({ type: 'fast200' });
    expect(classifyDocumentRoute('/en', '')).toEqual({ type: 'fast200' });
  });

  test('valid locale home with artist → artistRequired', () => {
    expect(classifyDocumentRoute('/ru', 'my-band')).toEqual({
      type: 'artistRequired',
      artistSlug: 'my-band',
    });
  });

  test('invalid locale path → unknown', () => {
    expect(classifyDocumentRoute('/xx/foo', null)).toEqual({ type: 'unknown' });
  });

  test('unknown localized path → unknown', () => {
    expect(classifyDocumentRoute('/ru/totally-unknown', null)).toEqual({ type: 'unknown' });
  });

  test('album detail with artist → albumDetail', () => {
    expect(classifyDocumentRoute('/en/albums/debut', 'my-band')).toEqual({
      type: 'albumDetail',
      albumId: 'debut',
      artistSlug: 'my-band',
    });
  });

  test('album detail without artist → albumDetailNoArtist', () => {
    expect(classifyDocumentRoute('/ru/albums/debut', null)).toEqual({
      type: 'albumDetailNoArtist',
      albumId: 'debut',
    });
  });

  test('article detail → articleDetail', () => {
    expect(classifyDocumentRoute('/ru/articles/post-1', 'my-band')).toEqual({
      type: 'articleDetail',
      articleId: 'post-1',
      artistSlug: 'my-band',
    });
    expect(classifyDocumentRoute('/ru/articles/post-1', null)).toEqual({
      type: 'articleDetail',
      articleId: 'post-1',
      artistSlug: null,
    });
  });

  test('internal unprefixed routes → fast200', () => {
    expect(classifyDocumentRoute('/dashboard/albums', null)).toEqual({ type: 'fast200' });
    expect(classifyDocumentRoute('/auth', null)).toEqual({ type: 'fast200' });
    expect(classifyDocumentRoute('/pay/success', null)).toEqual({ type: 'fast200' });
    expect(classifyDocumentRoute('/email-verified', null)).toEqual({ type: 'fast200' });
  });

  test('internal prefixed routes → fast200', () => {
    expect(classifyDocumentRoute('/ru/dashboard', null)).toEqual({ type: 'fast200' });
    expect(classifyDocumentRoute('/en/auth/reset-password', null)).toEqual({ type: 'fast200' });
  });

  test('help routes', () => {
    expect(classifyDocumentRoute('/ru/help', null)).toEqual({ type: 'fast200' });
    expect(classifyDocumentRoute('/ru/help/publishing', null)).toEqual({
      type: 'helpCategory',
      categorySlug: 'publishing',
      lang: 'ru',
    });
    expect(classifyDocumentRoute('/en/help/publishing/albums', null)).toEqual({
      type: 'helpArticle',
      categorySlug: 'publishing',
      articleSlug: 'albums',
      lang: 'en',
    });
  });

  test('static asset paths', () => {
    expect(isStaticAssetPath('/scripts/main.abc123.js')).toBe(true);
    expect(isStaticAssetPath('/styles/app.css')).toBe(true);
    expect(isStaticAssetPath('/ru/albums/foo')).toBe(false);
  });
});
