import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Binaries shipped with the function via netlify.toml included_files.
 * Only the Linux build used by Netlify Lambda is included — not every
 * platform binary from ffprobe-static (that package exceeds the function size limit).
 */
const FFMPEG_RELATIVE = 'node_modules/ffmpeg-static/ffmpeg';
const FFPROBE_RELATIVE = 'node_modules/ffprobe-static/bin/linux/x64/ffprobe';

function firstExisting(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Netlify Dev on macOS emulates Lambda but must use host ffmpeg/ffprobe (Linux bundle does not exec). */
export function isLocalNetlifyDevFfmpegRuntime(): boolean {
  return process.env.NETLIFY_DEV === 'true' && process.platform === 'darwin';
}

/** Production/deployed Lambda — bundled Linux ffmpeg/ffprobe from included_files. */
export function isLambdaFfmpegBundleRuntime(): boolean {
  if (!process.env.LAMBDA_TASK_ROOT?.trim()) {
    return false;
  }
  if (isLocalNetlifyDevFfmpegRuntime()) {
    return false;
  }
  return true;
}

/**
 * Local netlify dev / macOS host: use ffmpeg/ffprobe on PATH.
 * Avoids pointing at ffprobe-static's Linux ELF binary (spawn fails on macOS with exec format error).
 */
function configureLocalFfmpegTools(): { ffmpeg: string; ffprobe: string } {
  const explicitFfmpeg = process.env.FFMPEG_PATH?.trim();
  const explicitFfprobe = process.env.FFPROBE_PATH?.trim();

  if (explicitFfmpeg && existsSync(explicitFfmpeg)) {
    const ffprobe = explicitFfprobe && existsSync(explicitFfprobe) ? explicitFfprobe : 'ffprobe';
    process.env.FFMPEG_PATH = explicitFfmpeg;
    process.env.FFPROBE_PATH = ffprobe;
    return { ffmpeg: explicitFfmpeg, ffprobe };
  }

  delete process.env.FFMPEG_PATH;
  delete process.env.FFPROBE_PATH;
  return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
}

export function configureBundledFfmpeg(): { ffmpeg: string | null; ffprobe: string | null } {
  if (!isLambdaFfmpegBundleRuntime()) {
    return configureLocalFfmpegTools();
  }

  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd()].filter((root): root is string =>
    Boolean(root)
  );

  let ffmpeg = process.env.FFMPEG_PATH?.trim() || null;
  let ffprobe = process.env.FFPROBE_PATH?.trim() || null;

  if (!ffmpeg || !existsSync(ffmpeg)) {
    ffmpeg = firstExisting(roots.map((root) => path.join(root, FFMPEG_RELATIVE)));
    if (ffmpeg) process.env.FFMPEG_PATH = ffmpeg;
  }

  if (!ffprobe || !existsSync(ffprobe)) {
    ffprobe = firstExisting(roots.map((root) => path.join(root, FFPROBE_RELATIVE)));
    if (ffprobe) process.env.FFPROBE_PATH = ffprobe;
  }

  if (!ffmpeg || !ffprobe) {
    console.error(
      '[configureBundledFfmpeg] Bundled ffmpeg binaries were not found in the function bundle',
      {
        ffmpeg: Boolean(ffmpeg),
        ffprobe: Boolean(ffprobe),
        roots,
      }
    );
  }

  return { ffmpeg, ffprobe };
}
