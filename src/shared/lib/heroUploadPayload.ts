/**
 * Hero header images: keep JSON body under Netlify's ~6MB function limit
 * (base64 expands ~4/3; client guard in uploadFile matches ~5.5MB JSON).
 */

/** Netlify request body limit is ~6MB; stay below with margin */
export const HERO_UPLOAD_MAX_JSON_PAYLOAD_CHARS = Math.floor(5.5 * 1024 * 1024 * 0.96);

const CROP_ASPECT = 2560 / 1522;

const MIN_UPLOAD_WIDTH = 1920;
const MIN_UPLOAD_HEIGHT = 1140;

async function blobToBase64Pure(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Mirrors the fields sent by uploadFile() for size estimation (hero category).
 */
export function estimateHeroUploadJsonPayloadChars(
  fileBase64: string,
  opts: { fileName: string; userId: string; originalFileSize: number }
): number {
  const payload: Record<string, unknown> = {
    fileBase64,
    fileName: opts.fileName,
    userId: opts.userId,
    category: 'hero',
    contentType: 'image/jpeg',
    originalFileSize: opts.originalFileSize,
  };
  return JSON.stringify(payload).length;
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
      reject(new Error('Failed to decode hero image for compression'));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

/**
 * Re-encode cropped hero JPEG so JSON(base64) payload stays under the Netlify-safe cap,
 * by lowering quality first, then dimensions (down to minimum recommended 1920×1140).
 */
export async function compressHeroJpegForNetlifyPayload(
  source: Blob,
  opts: {
    fileName: string;
    userId: string;
    maxJsonPayloadChars?: number;
  }
): Promise<Blob> {
  const maxChars = opts.maxJsonPayloadChars ?? HERO_UPLOAD_MAX_JSON_PAYLOAD_CHARS;
  const qualities = [0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.48, 0.44, 0.4];

  const sourceImg = await loadImageFromBlob(source);
  let width = sourceImg.naturalWidth;
  let height = sourceImg.naturalHeight;

  if (width < MIN_UPLOAD_WIDTH || height < MIN_UPLOAD_HEIGHT) {
    console.warn('[compressHeroJpegForNetlifyPayload] Unexpected small dimensions', {
      width,
      height,
    });
  }

  const encodeFromSource = async (w: number, h: number, q: number): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(sourceImg, 0, 0, w, h);
    return canvasToJpegBlob(canvas, q);
  };

  for (let scaleAttempt = 0; scaleAttempt < 24; scaleAttempt += 1) {
    for (const q of qualities) {
      const candidate = await encodeFromSource(width, height, q);
      if (!candidate) continue;

      const b64 = await blobToBase64Pure(candidate);
      const jsonLen = estimateHeroUploadJsonPayloadChars(b64, {
        fileName: opts.fileName,
        userId: opts.userId,
        originalFileSize: candidate.size,
      });

      if (jsonLen <= maxChars) {
        if (candidate.size < source.size * 0.99 || scaleAttempt > 0 || q < 0.88) {
          console.info('[compressHeroJpegForNetlifyPayload] Compressed hero JPEG for upload', {
            originalBytes: source.size,
            outBytes: candidate.size,
            quality: q,
            width,
            height,
            jsonPayloadChars: jsonLen,
            maxJsonPayloadChars: maxChars,
          });
        }
        return candidate;
      }
    }

    const nextW = Math.max(MIN_UPLOAD_WIDTH, Math.floor(width * 0.92));
    const nextH = Math.max(MIN_UPLOAD_HEIGHT, Math.round(nextW / CROP_ASPECT));
    if (nextW === width && nextH === height) {
      break;
    }
    width = nextW;
    height = nextH;
  }

  console.error('[compressHeroJpegForNetlifyPayload] Could not fit hero JPEG under payload cap', {
    maxJsonPayloadChars: maxChars,
    lastWidth: width,
    lastHeight: height,
    sourceBytes: source.size,
  });

  throw new Error(
    `Hero image could not be compressed under the upload size limit (${maxChars} JSON chars). Try a simpler photo or lower resolution source.`
  );
}
