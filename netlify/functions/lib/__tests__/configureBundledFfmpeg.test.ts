import { existsSync } from 'node:fs';
import path from 'node:path';

import { configureBundledFfmpeg, isLambdaFfmpegBundleRuntime } from '../configureBundledFfmpeg';

const linuxFfprobe = path.join(process.cwd(), 'node_modules/ffprobe-static/bin/linux/x64/ffprobe');

describe('configureBundledFfmpeg', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test('local runtime uses PATH tools and does not select Linux ffprobe', () => {
    delete process.env.LAMBDA_TASK_ROOT;
    process.env.FFPROBE_PATH = linuxFfprobe;

    const result = configureBundledFfmpeg();

    expect(isLambdaFfmpegBundleRuntime()).toBe(false);
    expect(result.ffmpeg).toBe('ffmpeg');
    expect(result.ffprobe).toBe('ffprobe');
    expect(process.env.FFPROBE_PATH).toBeUndefined();
    expect(existsSync(linuxFfprobe)).toBe(true);
  });

  test('netlify dev on darwin uses PATH even when LAMBDA_TASK_ROOT is set', () => {
    process.env.LAMBDA_TASK_ROOT = '/Users/dev/project/.netlify/functions-serve/process-stem';
    process.env.NETLIFY_DEV = 'true';
    process.env.FFPROBE_PATH = linuxFfprobe;

    const result = configureBundledFfmpeg();

    expect(isLambdaFfmpegBundleRuntime()).toBe(false);
    expect(result.ffmpeg).toBe('ffmpeg');
    expect(result.ffprobe).toBe('ffprobe');
    expect(process.env.FFPROBE_PATH).toBeUndefined();
  });

  test('lambda runtime keeps bundled Linux ffprobe path when present', () => {
    process.env.LAMBDA_TASK_ROOT = '/var/task';
    delete process.env.NETLIFY_DEV;
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;

    const result = configureBundledFfmpeg();

    expect(isLambdaFfmpegBundleRuntime()).toBe(true);
    if (existsSync(linuxFfprobe)) {
      expect(result.ffprobe).toBe(linuxFfprobe);
      expect(process.env.FFPROBE_PATH).toBe(linuxFfprobe);
    }
  });
});
