import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  buildArticleCoverSrcSet,
  getArticleCoverCacheVersion,
  pickArticleCoverJpgWidth,
  pickArticleCoverWebpWidth,
  withArticleCoverCacheBust,
} from '@shared/lib/articleCoverUrl';
import {
  getCatalogArticleCoverProps,
  pickCatalogArticleWebpVariantForDpr,
  pickEditorArticleWebpVariantForDpr,
} from '../catalogArticleCoverProps';

const USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const COVER_KEY = 'article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_photo.jpg';

describe('catalogArticleCoverProps', () => {
  it('grid layout: DPR1/2/3 capped at -896', () => {
    expect(pickCatalogArticleWebpVariantForDpr(1, true)).toBe(448);
    expect(pickCatalogArticleWebpVariantForDpr(2, true)).toBe(896);
    expect(pickCatalogArticleWebpVariantForDpr(3, true)).toBe(896);
  });

  it('mobile layout: DPR1=-448, DPR2/3=-896', () => {
    expect(pickCatalogArticleWebpVariantForDpr(1, false)).toBe(448);
    expect(pickCatalogArticleWebpVariantForDpr(2, false)).toBe(896);
    expect(pickCatalogArticleWebpVariantForDpr(3, false)).toBe(896);
  });
});

describe('editor article cover props', () => {
  it('desktop preview picks -896 at 1x and -1344 at 2x', () => {
    expect(pickEditorArticleWebpVariantForDpr(1)).toBe(896);
    expect(pickEditorArticleWebpVariantForDpr(2)).toBe(1344);
  });
});

describe('article cover URL helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: 'https://jhpvetvfnsklpwswadle.supabase.co' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('dashboard thumb width resolves to -128', () => {
    expect(pickArticleCoverWebpWidth(79)).toBe(128);
    expect(pickArticleCoverJpgWidth(79)).toBe(128);
  });

  it('stable cache version uses baseName not Date.now', () => {
    const version = getArticleCoverCacheVersion(COVER_KEY);
    expect(version).toBe(
      encodeURIComponent('article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_photo')
    );
    const url = withArticleCoverCacheBust('https://example.com/cover.webp', COVER_KEY);
    expect(url).toContain(`v=${version}`);
    expect(url).not.toMatch(/v=\d{13}/);
  });

  it('srcset uses direct CDN without proxy', () => {
    const grid = getCatalogArticleCoverProps(true);
    const srcSet = buildArticleCoverSrcSet({
      coverKey: COVER_KEY,
      userId: USER_ID,
      baseSize: grid.size,
      format: 'webp',
      densities: [1, 2, 3],
      maxVariantWidth: grid.maxVariantWidth,
    });

    expect(srcSet).toContain('-448.webp');
    expect(srcSet).toContain('-896.webp');
    expect(srcSet).not.toContain('-1344.webp');
    expect(srcSet).not.toContain('proxy-image');
    expect(srcSet).toContain('supabase.co/storage/v1/object/public/');
  });
});
