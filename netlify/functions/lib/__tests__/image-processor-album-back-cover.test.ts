import { describe, expect, test } from '@jest/globals';
import sharp from 'sharp';
import { ALBUM_COVER_PRIMARY_WIDTH, generateAlbumBackCoverWebp } from '../image-processor';

describe('generateAlbumBackCoverWebp', () => {
  test('produces a single WebP at primary album width', async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 20, g: 40, b: 80 },
      },
    })
      .jpeg()
      .toBuffer();

    const baseName = 'album_cover_uuid_test-Back-Cover-demo';
    const variants = await generateAlbumBackCoverWebp(source, baseName);

    expect(Object.keys(variants)).toEqual([`${baseName}.webp`]);

    const meta = await sharp(variants[`${baseName}.webp`]).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(ALBUM_COVER_PRIMARY_WIDTH);
  });
});
