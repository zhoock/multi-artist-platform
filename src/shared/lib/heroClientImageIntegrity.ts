/**
 * Browser-side checks for cropped hero JPEG before upload (catches blank canvas output).
 */

const MIN_HERO_SOURCE_WIDTH = 1920;
const MIN_HERO_SOURCE_HEIGHT = 1140;

export class HeroClientImageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HeroClientImageError';
    this.code = code;
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new HeroClientImageError('HERO_CLIENT_DECODE_FAILED', 'Failed to decode cropped image')
      );
    };
    img.src = url;
  });
}

function sampleMaxRgb(data: Uint8ClampedArray): number {
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    max = Math.max(max, data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
  }
  return max;
}

/**
 * Ensure the blob decodes, meets minimum hero dimensions, and is not a uniform black frame.
 */
export async function assertHeroUploadBlobHasContent(blob: Blob): Promise<void> {
  if (!blob.size) {
    throw new HeroClientImageError('HERO_CLIENT_EMPTY_BLOB', 'Cropped image is empty');
  }

  const img = await loadImageFromBlob(blob);
  const { naturalWidth: width, naturalHeight: height } = img;
  if (width < MIN_HERO_SOURCE_WIDTH || height < MIN_HERO_SOURCE_HEIGHT) {
    throw new HeroClientImageError(
      'HERO_CLIENT_TOO_SMALL',
      `Cropped image is ${width}×${height}; minimum is ${MIN_HERO_SOURCE_WIDTH}×${MIN_HERO_SOURCE_HEIGHT}`
    );
  }

  const sampleW = Math.min(128, width);
  const sampleH = Math.min(128, height);
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new HeroClientImageError('HERO_CLIENT_CANVAS', 'Cannot validate cropped image');
  }
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  const maxRgb = sampleMaxRgb(data);
  if (maxRgb === 0) {
    throw new HeroClientImageError(
      'HERO_CLIENT_BLANK_IMAGE',
      'Cropped image is completely black — check the crop step and try again'
    );
  }
}
