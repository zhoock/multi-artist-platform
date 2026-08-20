import { describe, test, expect } from '@jest/globals';
import sharp from 'sharp';
import {
  articleCoverHeightForWidth,
  generateArticleCoverVariants,
  ARTICLE_COVER_CACHE_CONTROL,
  ARTICLE_COVER_VARIANT_WIDTHS,
} from '../image-processor';

describe('generateArticleCoverVariants', () => {
  async function createPortraitSource(): Promise<Buffer> {
    return sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 120, g: 80, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  test('generates 8 variants with canonical 3:2 dimensions', async () => {
    const source = await createPortraitSource();
    const baseName = 'article_cover_test_uuid_photo';
    const variants = await generateArticleCoverVariants(source, baseName);

    expect(Object.keys(variants).sort()).toEqual(
      [
        `${baseName}-128.webp`,
        `${baseName}-128.jpg`,
        `${baseName}-448.webp`,
        `${baseName}-448.jpg`,
        `${baseName}-896.webp`,
        `${baseName}-896.jpg`,
        `${baseName}-1344.webp`,
        `${baseName}-1344.jpg`,
      ].sort()
    );

    for (const width of ARTICLE_COVER_VARIANT_WIDTHS) {
      const expectedHeight = articleCoverHeightForWidth(width);
      const webpMeta = await sharp(variants[`${baseName}-${width}.webp`]).metadata();
      const jpgMeta = await sharp(variants[`${baseName}-${width}.jpg`]).metadata();

      expect(webpMeta.width).toBe(width);
      expect(webpMeta.height).toBe(expectedHeight);
      expect(jpgMeta.width).toBe(width);
      expect(jpgMeta.height).toBe(expectedHeight);
      expect(webpMeta.format).toBe('webp');
      expect(jpgMeta.format).toBe('jpeg');
    }
  });

  test('portrait source is center-cropped to 3:2 (not source aspect)', async () => {
    const source = await createPortraitSource();
    const variants = await generateArticleCoverVariants(source, 'article_cover_crop_test');
    const meta = await sharp(variants['article_cover_crop_test-448.webp']).metadata();

    expect(meta.width).toBe(448);
    expect(meta.height).toBe(299);
    expect(meta.width! / meta.height!).toBeCloseTo(1.5, 2);
  });

  test('height helper matches spec table', () => {
    expect(articleCoverHeightForWidth(128)).toBe(85);
    expect(articleCoverHeightForWidth(448)).toBe(299);
    expect(articleCoverHeightForWidth(896)).toBe(597);
    expect(articleCoverHeightForWidth(1344)).toBe(896);
  });

  test('cache control constant is immutable long-lived', () => {
    expect(ARTICLE_COVER_CACHE_CONTROL).toBe('max-age=31536000, immutable');
  });
});
