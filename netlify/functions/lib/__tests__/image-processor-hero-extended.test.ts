import { describe, test, expect } from '@jest/globals';
import sharp from 'sharp';
import { heroVariantFileNamesForBaseName } from '../hero-variants';
import { generateHeroImageVariants, HeroImageIntegrityError } from '../image-processor';

describe('generateHeroImageVariants — integrity and errors', () => {
  async function landscapeJpeg(): Promise<Buffer> {
    return sharp({
      create: {
        width: 2560,
        height: 1522,
        channels: 3,
        background: { r: 30, g: 90, b: 180 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  test('rejects undecodable sharp input', async () => {
    await expect(
      generateHeroImageVariants(Buffer.from('not-a-jpeg'), 'hero-bad')
    ).rejects.toBeInstanceOf(HeroImageIntegrityError);
  });

  test('all variants are non-blank for valid JPEG', async () => {
    const source = await landscapeJpeg();
    const baseName = 'hero-extended-test';
    const variants = await generateHeroImageVariants(source, baseName);
    expect(Object.keys(variants).sort()).toEqual(heroVariantFileNamesForBaseName(baseName).sort());
    for (const [name, buf] of Object.entries(variants)) {
      const stats = await sharp(buf).stats();
      expect(Math.max(...stats.channels.map((c) => c.max))).toBeGreaterThan(0);
      expect(name).toContain(baseName);
      expect(name).not.toMatch(/\.avif$/);
    }
  });

  test('rejects source smaller than hero minimum', async () => {
    const small = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 50 } },
    })
      .jpeg()
      .toBuffer();
    await expect(generateHeroImageVariants(small, 'hero-small')).rejects.toMatchObject({
      code: 'HERO_INPUT_TOO_SMALL',
    });
  });
});
