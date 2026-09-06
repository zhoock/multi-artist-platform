import { describe, test, expect } from '@jest/globals';
import sharp from 'sharp';
import { generateHeroImageVariants } from '../image-processor';

describe('generateHeroImageVariants', () => {
  async function createLandscapeSource(): Promise<Buffer> {
    return sharp({
      create: {
        width: 2560,
        height: 1522,
        channels: 3,
        background: { r: 40, g: 60, b: 120 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  test('generates 896 / 1280 / 1920 avif, webp, and jpg variants', async () => {
    const source = await createLandscapeSource();
    const baseName = 'hero-1769199944514-ztdiqdk';
    const variants = await generateHeroImageVariants(source, baseName);

    expect(Object.keys(variants).sort()).toEqual(
      [
        `${baseName}-896.avif`,
        `${baseName}-896.webp`,
        `${baseName}-896.jpg`,
        `${baseName}-1280.avif`,
        `${baseName}-1280.webp`,
        `${baseName}-1280.jpg`,
        `${baseName}-1920.avif`,
        `${baseName}-1920.webp`,
        `${baseName}-1920.jpg`,
      ].sort()
    );

    const metadata896 = await sharp(variants[`${baseName}-896.avif`]).metadata();
    const metadata1280 = await sharp(variants[`${baseName}-1280.webp`]).metadata();
    const metadata1920 = await sharp(variants[`${baseName}-1920.jpg`]).metadata();

    expect(metadata896.width).toBe(896);
    expect(metadata1280.width).toBe(1280);
    expect(metadata1920.width).toBe(1920);
  });
});
