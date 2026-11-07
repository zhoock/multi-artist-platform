import { describe, expect, test } from '@jest/globals';
import sharp from 'sharp';
import {
  assertDecodableHeroSource,
  assertHeroVariantOutput,
  HeroImageIntegrityError,
} from '../image-integrity';

describe('image-integrity (hero)', () => {
  async function validHeroSource(): Promise<Buffer> {
    return sharp({
      create: {
        width: 2560,
        height: 1522,
        channels: 3,
        background: { r: 80, g: 120, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  test('rejects empty buffer', async () => {
    await expect(assertDecodableHeroSource(Buffer.alloc(0))).rejects.toMatchObject({
      code: 'HERO_INPUT_EMPTY',
    });
  });

  test('rejects uniform black source', async () => {
    const black = await sharp({
      create: { width: 2560, height: 1522, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    await expect(assertDecodableHeroSource(black)).rejects.toBeInstanceOf(HeroImageIntegrityError);
    await expect(assertDecodableHeroSource(black)).rejects.toMatchObject({
      code: 'HERO_INPUT_BLANK',
    });
  });

  test('accepts normal JPEG source', async () => {
    const buf = await validHeroSource();
    const dims = await assertDecodableHeroSource(buf);
    expect(dims.width).toBe(2560);
    expect(dims.height).toBe(1522);
  });

  test('accepts JPEG with ICC profile (sRGB)', async () => {
    const buf = await sharp({
      create: { width: 2048, height: 1217, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const scaled = await sharp(buf).resize(2560, 1522, { fit: 'cover' }).jpeg().toBuffer();
    await expect(assertDecodableHeroSource(scaled)).resolves.toMatchObject({ width: 2560 });
  });

  test('accepts noisy/grainy JPEG', async () => {
    const noise = Buffer.alloc(2560 * 1522 * 3);
    for (let i = 0; i < noise.length; i += 3) {
      const v = (i * 17) % 256;
      noise[i] = v;
      noise[i + 1] = (v + 40) % 256;
      noise[i + 2] = (v + 80) % 256;
    }
    const buf = await sharp(noise, {
      raw: { width: 2560, height: 1522, channels: 3 },
    })
      .jpeg({ quality: 85 })
      .toBuffer();
    await expect(assertDecodableHeroSource(buf)).resolves.toBeDefined();
  });

  test('accepts PNG and WebP after conversion to decodable hero dimensions', async () => {
    const png = await sharp({
      create: { width: 2560, height: 1522, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    await expect(assertDecodableHeroSource(png)).resolves.toMatchObject({ width: 2560 });

    const webp = await sharp({
      create: { width: 2560, height: 1522, channels: 3, background: '#993366' },
    })
      .webp()
      .toBuffer();
    await expect(assertDecodableHeroSource(webp)).resolves.toMatchObject({ width: 2560 });
  });

  test('rejects variant that is uniform black', async () => {
    const black = await sharp({
      create: { width: 1920, height: 1142, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    await expect(assertHeroVariantOutput(black, 'hero-x-1920.jpg', 1920)).rejects.toMatchObject({
      code: 'HERO_VARIANT_BLANK',
    });
  });

  test('rejects invalid bytes as variant', async () => {
    const tiny = Buffer.from('not-an-image');
    await expect(assertHeroVariantOutput(tiny, 'hero-x-1920.jpg', 1920)).rejects.toMatchObject({
      code: 'HERO_VARIANT_DECODE_FAILED',
    });
  });

  test('rejects production-like black 1920 JPEG by pixel stats', async () => {
    const black = await sharp({
      create: { width: 1920, height: 1142, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    await expect(assertHeroVariantOutput(black, 'hero-prod-1920.jpg', 1920)).rejects.toMatchObject({
      code: 'HERO_VARIANT_BLANK',
    });
  });
});
