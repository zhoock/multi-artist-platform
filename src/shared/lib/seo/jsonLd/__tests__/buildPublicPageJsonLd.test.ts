import { describe, expect, test } from '@jest/globals';

import {
  buildAlbumJsonLd,
  buildArticleJsonLd,
  buildArtistJsonLd,
  buildPlatformHomeJsonLd,
} from '../buildPublicPageJsonLd';
import { serializeJsonLd } from '../serializeJsonLd';

describe('buildPublicPageJsonLd', () => {
  test('platform home emits WebSite and Organization for ru', () => {
    const graphs = buildPlatformHomeJsonLd({
      lang: 'ru',
      siteUrl: 'https://example.com/ru',
    });
    expect(graphs).toHaveLength(2);
    expect(graphs[0]['@type']).toBe('WebSite');
    expect(graphs[1]['@type']).toBe('Organization');
    expect(graphs[0].url).toBe('https://example.com/ru');
    expect(graphs[0].name).toBeTruthy();
    expect(graphs[0].description).toBeTruthy();
    expect(JSON.parse(serializeJsonLd(graphs[0]))).toEqual(graphs[0]);
  });

  test('platform home emits localized copy for en', () => {
    const graphs = buildPlatformHomeJsonLd({
      lang: 'en',
      siteUrl: 'https://example.com/en',
    });
    expect(String(graphs[0].name)).toContain('Site Name');
  });

  test('artist JSON-LD uses MusicGroup and canonical url', () => {
    const node = buildArtistJsonLd({
      name: 'Beatles',
      description: 'Legendary band.',
      url: 'https://example.com/ru?artist=beatles',
    });
    expect(node['@type']).toBe('MusicGroup');
    expect(node.url).toBe('https://example.com/ru?artist=beatles');
    expect(node).not.toHaveProperty('image');
  });

  test('album JSON-LD includes MusicAlbum and byArtist', () => {
    const node = buildAlbumJsonLd({
      name: 'Rubber Soul',
      description: '1965 album',
      url: 'https://example.com/ru/albums/rubber-soul?artist=beatles',
      artist: {
        name: 'Beatles',
        url: 'https://example.com/ru?artist=beatles',
      },
    });
    expect(node['@type']).toBe('MusicAlbum');
    expect(node.byArtist).toEqual({
      '@type': 'MusicGroup',
      name: 'Beatles',
      url: 'https://example.com/ru?artist=beatles',
    });
  });

  test('article JSON-LD includes headline, datePublished, author, mainEntityOfPage', () => {
    const node = buildArticleJsonLd({
      headline: 'Studio gear',
      datePublished: '2020-05-01',
      url: 'https://example.com/ru/articles/1?artist=foo',
      author: {
        name: 'Artist',
        url: 'https://example.com/ru?artist=foo',
      },
    });
    expect(node['@type']).toBe('Article');
    expect(node.headline).toBe('Studio gear');
    expect(node.datePublished).toBe('2020-05-01');
    expect(node.mainEntityOfPage).toBe('https://example.com/ru/articles/1?artist=foo');
    expect(node.author).toMatchObject({ name: 'Artist' });
  });

  test('omits empty optional fields', () => {
    const node = buildAlbumJsonLd({
      name: 'Title only',
      description: '   ',
      url: 'https://example.com/album',
      imageUrl: '',
      artist: { name: 'A', url: 'https://example.com/a' },
    });
    expect(node).not.toHaveProperty('description');
    expect(node).not.toHaveProperty('image');
  });

  test('user-controlled strings cannot break JSON-LD script serialization', () => {
    const malicious = '</script><script>alert(1)</script>';
    const node = buildArtistJsonLd({
      name: malicious,
      description: malicious,
      url: 'https://example.com/ru?artist=x',
    });
    const serialized = serializeJsonLd(node);
    expect(serialized).not.toContain('</script>');
    expect(() => JSON.parse(serialized)).not.toThrow();
    const parsed = JSON.parse(serialized) as { name: string };
    expect(parsed.name).toBe(malicious);
  });
});
