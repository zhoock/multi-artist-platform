/**
 * Server-side cover palette extraction (upload only).
 * Uses Sharp for decode/resize and colorthief/internals MMCQ — no DOM ImageData / browser loader.
 */

import sharp from 'sharp';
import { extractPalette, MmcqQuantizer } from 'colorthief/internals';
import type { AlbumCoverPlayerBackground } from '../../../src/shared/lib/imageColor/albumCoverPlayerBackground';
import { selectBackgroundColors } from '../../../src/shared/lib/imageColor/selectBackgroundColors';

const COLOR_COUNT = 10;
const QUALITY = 10;
const ANALYSIS_WIDTH = 448;

const quantizer = new MmcqQuantizer();

type RgbTuple = [number, number, number];

export type CoverPaletteExtractionStep = 'sharp-decode' | 'quantize' | 'select-background-colors';

export class CoverPaletteExtractionError extends Error {
  readonly step: CoverPaletteExtractionStep;
  readonly causeDetail: unknown;

  constructor(step: CoverPaletteExtractionStep, message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'CoverPaletteExtractionError';
    this.step = step;
    this.causeDetail = causeDetail;
  }
}

async function decodeCoverPixels(
  imageBuffer: Buffer
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .rotate()
      .resize(ANALYSIS_WIDTH, ANALYSIS_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height || data.length === 0) {
      throw new CoverPaletteExtractionError('sharp-decode', 'Sharp produced empty image data', {
        width: info.width,
        height: info.height,
        byteLength: data.length,
      });
    }

    return {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof CoverPaletteExtractionError) throw error;
    throw new CoverPaletteExtractionError(
      'sharp-decode',
      error instanceof Error ? error.message : 'Sharp decode failed',
      error
    );
  }
}

export async function extractCoverPlayerBackgroundFromBuffer(
  imageBuffer: Buffer
): Promise<AlbumCoverPlayerBackground> {
  const inputMeta = await sharp(imageBuffer)
    .metadata()
    .catch((error) => {
      throw new CoverPaletteExtractionError(
        'sharp-decode',
        'Invalid image buffer for palette extraction',
        error
      );
    });

  const { data, width, height } = await decodeCoverPixels(imageBuffer);

  let paletteColors;
  try {
    paletteColors = extractPalette(
      data,
      width,
      height,
      {
        colorCount: COLOR_COUNT,
        quality: QUALITY,
        colorSpace: 'rgb',
      },
      quantizer,
      'srgb'
    );
  } catch (error) {
    throw new CoverPaletteExtractionError(
      'quantize',
      error instanceof Error ? error.message : 'Palette quantization failed',
      { inputFormat: inputMeta.format, inputSize: inputMeta.width, cause: error }
    );
  }

  if (!paletteColors || paletteColors.length === 0) {
    throw new CoverPaletteExtractionError('quantize', 'extractPalette returned no colors', {
      inputFormat: inputMeta.format,
      decoded: { width, height, byteLength: data.length },
    });
  }

  const rgbPalette: RgbTuple[] = paletteColors
    .map((color) => color.array() as RgbTuple)
    .filter((tuple) => tuple.length === 3);

  if (rgbPalette.length === 0) {
    throw new CoverPaletteExtractionError(
      'quantize',
      'No RGB tuples in quantized palette',
      paletteColors.length
    );
  }

  try {
    const { primary, secondary } = selectBackgroundColors(rgbPalette);
    return {
      primary: [primary[0], primary[1], primary[2]],
      secondary: [secondary[0], secondary[1], secondary[2]],
    };
  } catch (error) {
    throw new CoverPaletteExtractionError(
      'select-background-colors',
      error instanceof Error ? error.message : 'selectBackgroundColors failed',
      { paletteLength: rgbPalette.length, cause: error }
    );
  }
}
