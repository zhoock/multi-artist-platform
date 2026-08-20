import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { ArticleCoverImage } from '../ArticleCoverImage';

const TEST_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';
const COVER_KEY = 'article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_photo.jpg';
const CACHE_VERSION = encodeURIComponent(
  'article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_photo'
);

describe('ArticleCoverImage CDN variants', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: unknown) => ({
        matches: typeof query === 'string' && query.includes('768px'),
        media: String(query),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('dashboard admin role uses -128 CDN URL', () => {
    render(<ArticleCoverImage img={COVER_KEY} userId={TEST_USER_ID} role="admin" alt="Article" />);

    const img = screen.getByRole('img', { name: 'Article' });
    expect(img.getAttribute('src')).toContain(`${SUPABASE_URL}/storage/v1/object/public/`);
    expect(img.getAttribute('src')).toContain(`-128.jpg?v=${CACHE_VERSION}`);
    expect(img.getAttribute('src')).not.toContain('proxy-image');
  });

  test('public grid role builds srcset capped at -896', () => {
    render(<ArticleCoverImage img={COVER_KEY} userId={TEST_USER_ID} role="public" alt="Article" />);

    const source = document.querySelector('source[type="image/webp"]');
    expect(source?.getAttribute('srcset')).toContain('-448.webp');
    expect(source?.getAttribute('srcset')).toContain('-896.webp');
    expect(source?.getAttribute('srcset')).not.toContain('-1344.webp');
    expect(source?.getAttribute('srcset')).not.toContain('proxy-image');
  });

  test('editor role allows -1344 in webp srcset at 2x', () => {
    render(
      <ArticleCoverImage img={COVER_KEY} userId={TEST_USER_ID} role="editor" alt="Editor cover" />
    );

    const source = document.querySelector('source[type="image/webp"]');
    expect(source?.getAttribute('srcset')).toContain('-896.webp');
    expect(source?.getAttribute('srcset')).toContain('-1344.webp');
    expect(source?.getAttribute('srcset')).not.toContain('proxy-image');
  });

  test('legacy img key shows placeholder (no proxy fallback)', () => {
    render(
      <ArticleCoverImage
        img="recording_album_legacy"
        userId={TEST_USER_ID}
        role="public"
        alt="Legacy"
      />
    );

    expect(document.querySelector('.article-cover-placeholder')).toBeTruthy();
    expect(document.querySelector('source[type="image/webp"]')).toBeNull();
  });

  test('empty img shows placeholder', () => {
    render(<ArticleCoverImage img="" userId={TEST_USER_ID} role="admin" alt="No cover" />);

    expect(document.querySelector('.article-cover-placeholder')).toBeTruthy();
    expect(document.querySelector('picture')).toBeNull();
  });
});
