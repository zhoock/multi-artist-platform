import { describe, test, expect } from '@jest/globals';

import {
  DEFAULT_ROUTE_LANG,
  SUPPORTED_LANGS,
  isRouteLang,
  parseLangFromPath,
  stripLangPrefix,
  withLangPrefix,
} from '../index';

describe('supportedLangs', () => {
  test('SUPPORTED_LANGS lists ru and en', () => {
    expect(SUPPORTED_LANGS).toEqual(['ru', 'en']);
  });

  test('DEFAULT_ROUTE_LANG is ru', () => {
    expect(DEFAULT_ROUTE_LANG).toBe('ru');
  });

  test('isRouteLang accepts supported locales only', () => {
    expect(isRouteLang('ru')).toBe(true);
    expect(isRouteLang('en')).toBe(true);
    expect(isRouteLang('de')).toBe(false);
    expect(isRouteLang('')).toBe(false);
    expect(isRouteLang('RU')).toBe(false);
  });
});

describe('parseLangFromPath', () => {
  test('returns null lang for unprefixed platform paths', () => {
    expect(parseLangFromPath('/')).toEqual({ lang: null, pathnameWithoutLang: '/' });
    expect(parseLangFromPath('/albums')).toEqual({ lang: null, pathnameWithoutLang: '/albums' });
    expect(parseLangFromPath('/articles/post-1')).toEqual({
      lang: null,
      pathnameWithoutLang: '/articles/post-1',
    });
    expect(parseLangFromPath('/dashboard-new/albums')).toEqual({
      lang: null,
      pathnameWithoutLang: '/dashboard-new/albums',
    });
    expect(parseLangFromPath('/pay/success')).toEqual({
      lang: null,
      pathnameWithoutLang: '/pay/success',
    });
  });

  test('parses locale-only home paths', () => {
    expect(parseLangFromPath('/ru')).toEqual({ lang: 'ru', pathnameWithoutLang: '/' });
    expect(parseLangFromPath('/en')).toEqual({ lang: 'en', pathnameWithoutLang: '/' });
    expect(parseLangFromPath('/ru/')).toEqual({ lang: 'ru', pathnameWithoutLang: '/' });
    expect(parseLangFromPath('/en/')).toEqual({ lang: 'en', pathnameWithoutLang: '/' });
  });

  test('parses locale-prefixed public paths', () => {
    expect(parseLangFromPath('/ru/albums')).toEqual({
      lang: 'ru',
      pathnameWithoutLang: '/albums',
    });
    expect(parseLangFromPath('/en/albums/debut')).toEqual({
      lang: 'en',
      pathnameWithoutLang: '/albums/debut',
    });
    expect(parseLangFromPath('/ru/articles')).toEqual({
      lang: 'ru',
      pathnameWithoutLang: '/articles',
    });
    expect(parseLangFromPath('/en/stems/mix/uuid')).toEqual({
      lang: 'en',
      pathnameWithoutLang: '/stems/mix/uuid',
    });
    expect(parseLangFromPath('/ru/offer')).toEqual({ lang: 'ru', pathnameWithoutLang: '/offer' });
    expect(parseLangFromPath('/en/privacy')).toEqual({
      lang: 'en',
      pathnameWithoutLang: '/privacy',
    });
  });

  test('does not treat similar segments as locales', () => {
    expect(parseLangFromPath('/enable/albums')).toEqual({
      lang: null,
      pathnameWithoutLang: '/enable/albums',
    });
    expect(parseLangFromPath('/english')).toEqual({ lang: null, pathnameWithoutLang: '/english' });
    expect(parseLangFromPath('/ru-extra/albums')).toEqual({
      lang: null,
      pathnameWithoutLang: '/ru-extra/albums',
    });
  });

  test('normalizes empty and relative-looking input', () => {
    expect(parseLangFromPath('')).toEqual({ lang: null, pathnameWithoutLang: '/' });
    expect(parseLangFromPath('albums')).toEqual({ lang: null, pathnameWithoutLang: '/albums' });
    expect(parseLangFromPath('  /en/albums  ')).toEqual({
      lang: 'en',
      pathnameWithoutLang: '/albums',
    });
  });
});

describe('stripLangPrefix', () => {
  test('removes supported locale prefixes', () => {
    expect(stripLangPrefix('/ru')).toBe('/');
    expect(stripLangPrefix('/en/albums')).toBe('/albums');
    expect(stripLangPrefix('/ru/articles/post-1')).toBe('/articles/post-1');
  });

  test('leaves unprefixed paths unchanged', () => {
    expect(stripLangPrefix('/')).toBe('/');
    expect(stripLangPrefix('/albums')).toBe('/albums');
    expect(stripLangPrefix('/auth')).toBe('/auth');
  });
});

describe('withLangPrefix', () => {
  test('adds locale prefix to unprefixed paths', () => {
    expect(withLangPrefix('ru', '/')).toBe('/ru');
    expect(withLangPrefix('en', '/albums')).toBe('/en/albums');
    expect(withLangPrefix('ru', '/articles/post-1')).toBe('/ru/articles/post-1');
    expect(withLangPrefix('en', '/stems')).toBe('/en/stems');
  });

  test('preserves query string and hash', () => {
    expect(withLangPrefix('ru', '/?artist=my-band')).toBe('/ru?artist=my-band');
    expect(withLangPrefix('en', '/albums?artist=my-band')).toBe('/en/albums?artist=my-band');
    expect(withLangPrefix('ru', '/articles/post-1?artist=my-band')).toBe(
      '/ru/articles/post-1?artist=my-band'
    );
    expect(withLangPrefix('en', '/albums#tracks')).toBe('/en/albums#tracks');
    expect(withLangPrefix('ru', '/albums?artist=a#tracks')).toBe('/ru/albums?artist=a#tracks');
  });

  test('replaces an existing locale prefix', () => {
    expect(withLangPrefix('en', '/ru/albums')).toBe('/en/albums');
    expect(withLangPrefix('ru', '/en/albums/debut')).toBe('/ru/albums/debut');
    expect(withLangPrefix('en', '/ru?artist=my-band')).toBe('/en?artist=my-band');
    expect(withLangPrefix('ru', '/en/albums?artist=my-band')).toBe('/ru/albums?artist=my-band');
  });

  test('is idempotent for the same locale', () => {
    expect(withLangPrefix('en', '/en/albums')).toBe('/en/albums');
    expect(withLangPrefix('ru', '/ru?artist=slug')).toBe('/ru?artist=slug');
  });
});
