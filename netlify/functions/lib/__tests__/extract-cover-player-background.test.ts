import { extractCoverPlayerBackgroundFromBuffer } from '../extract-cover-player-background';
import sharp from 'sharp';
import { generateImageVariants } from '../image-processor';

describe('extractCoverPlayerBackgroundFromBuffer', () => {
  test('returns primary and secondary rgb triples from -448.jpg pipeline buffer', async () => {
    const original = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 200, g: 80, b: 40 },
      },
    })
      .jpeg()
      .toBuffer();

    const variants = await generateImageVariants(original, 'rubber-soul-test');
    const jpgKey = Object.keys(variants).find((name) => name.endsWith('-448.jpg'));
    expect(jpgKey).toBeDefined();

    const jpgMeta = await sharp(variants[jpgKey!]).metadata();
    expect(jpgMeta.format).toBe('jpeg');
    expect(jpgMeta.width).toBeGreaterThan(0);

    const result = await extractCoverPlayerBackgroundFromBuffer(variants[jpgKey!]!);
    expect(result.primary).toHaveLength(3);
    expect(result.secondary).toHaveLength(3);
    expect(result.primary.every((n) => n >= 0 && n <= 255)).toBe(true);
  });

  test('throws on invalid buffer', async () => {
    await expect(
      extractCoverPlayerBackgroundFromBuffer(Buffer.from('not-an-image'))
    ).rejects.toThrow(/palette|Sharp|Invalid/i);
  });
});
