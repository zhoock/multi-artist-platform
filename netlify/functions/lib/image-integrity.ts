/**
 * Validates hero (header) image buffers before and after Sharp processing.
 * Rejects empty, undecodable, and uniform blank (e.g. all-black) outputs.
 */

import sharp from 'sharp';

export class HeroImageIntegrityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HeroImageIntegrityError';
    this.code = code;
  }
}

const MIN_HERO_SOURCE_WIDTH = 1920;
const MIN_HERO_SOURCE_HEIGHT = 1140;

function assertChannelsNotBlank(stats: sharp.Stats, label: string, code: string): void {
  const channels = stats.channels;
  if (!channels?.length) {
    throw new HeroImageIntegrityError(code, `${label}: no image channels`);
  }

  const maxOfMax = Math.max(...channels.map((c) => c.max ?? 0));
  const meanMax = Math.max(...channels.map((c) => c.mean ?? 0));
  const stdevMax = Math.max(...channels.map((c) => (c as { stdev?: number }).stdev ?? 0));

  if (maxOfMax <= 0) {
    throw new HeroImageIntegrityError(
      code,
      `${label}: image is completely black (max channel value is 0)`
    );
  }

  if (meanMax < 1 && stdevMax < 0.75) {
    throw new HeroImageIntegrityError(
      code,
      `${label}: image appears blank (near-uniform black or empty)`
    );
  }
}

export async function assertDecodableHeroSource(buffer: Buffer): Promise<{
  width: number;
  height: number;
}> {
  if (!buffer.length) {
    throw new HeroImageIntegrityError(
      'HERO_INPUT_EMPTY',
      'Hero upload body decoded to an empty buffer'
    );
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).rotate().metadata();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HeroImageIntegrityError(
      'HERO_INPUT_DECODE_FAILED',
      `Hero source image could not be decoded: ${msg}`
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1) {
    throw new HeroImageIntegrityError(
      'HERO_INPUT_INVALID_DIMENSIONS',
      `Hero source has invalid dimensions (${width}×${height})`
    );
  }

  if (width < MIN_HERO_SOURCE_WIDTH || height < MIN_HERO_SOURCE_HEIGHT) {
    throw new HeroImageIntegrityError(
      'HERO_INPUT_TOO_SMALL',
      `Hero source must be at least ${MIN_HERO_SOURCE_WIDTH}×${MIN_HERO_SOURCE_HEIGHT} (got ${width}×${height})`
    );
  }

  const stats = await sharp(buffer, { failOn: 'error' }).rotate().stats();
  assertChannelsNotBlank(stats, 'Hero source', 'HERO_INPUT_BLANK');

  return { width, height };
}

export async function assertHeroVariantOutput(
  buffer: Buffer,
  variantFileName: string,
  expectedWidth: number
): Promise<void> {
  if (!buffer.length) {
    throw new HeroImageIntegrityError('HERO_VARIANT_EMPTY', `Variant ${variantFileName} is empty`);
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HeroImageIntegrityError(
      'HERO_VARIANT_DECODE_FAILED',
      `Variant ${variantFileName} is not a valid image: ${msg}`
    );
  }

  if ((metadata.width ?? 0) !== expectedWidth) {
    throw new HeroImageIntegrityError(
      'HERO_VARIANT_WRONG_WIDTH',
      `Variant ${variantFileName} width is ${metadata.width}, expected ${expectedWidth}`
    );
  }

  const stats = await sharp(buffer, { failOn: 'error' }).stats();
  assertChannelsNotBlank(stats, `Variant ${variantFileName}`, 'HERO_VARIANT_BLANK');
}
