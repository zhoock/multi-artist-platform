import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function runFfmpeg(
  inputPath: string,
  outputPath: string,
  outputArgs: string[]
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const args = ['-y', '-i', inputPath, ...outputArgs, outputPath];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

export interface FfprobeResult {
  duration: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  fileSize: number | null;
}

export async function runFfprobe(filePath: string): Promise<FfprobeResult> {
  const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath];

  const stdout = await new Promise<string>((resolve, reject) => {
    const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c: Buffer) => {
      out += c.toString();
    });
    proc.stderr.on('data', (c: Buffer) => {
      err += c.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`ffprobe exited ${code}: ${err.slice(-1000)}`));
    });
  });

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string; size?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      bit_rate?: string;
    }>;
  };

  const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');
  const durationRaw = parsed.format?.duration;
  const duration =
    durationRaw != null && Number.isFinite(parseFloat(durationRaw))
      ? Math.round(parseFloat(durationRaw) * 100) / 100
      : null;

  const bitrateRaw = audioStream?.bit_rate ?? parsed.format?.bit_rate;
  const bitrate =
    bitrateRaw != null && Number.isFinite(parseInt(bitrateRaw, 10))
      ? parseInt(bitrateRaw, 10)
      : null;

  const sampleRateRaw = audioStream?.sample_rate;
  const sampleRate =
    sampleRateRaw != null && Number.isFinite(parseInt(sampleRateRaw, 10))
      ? parseInt(sampleRateRaw, 10)
      : null;

  const fileSizeRaw = parsed.format?.size;
  const fileSize =
    fileSizeRaw != null && Number.isFinite(parseInt(fileSizeRaw, 10))
      ? parseInt(fileSizeRaw, 10)
      : null;

  return {
    duration,
    bitrate,
    sampleRate,
    channels: audioStream?.channels ?? null,
    codec: audioStream?.codec_name ?? null,
    fileSize,
  };
}

export async function getFfmpegVersionLabel(): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (c: Buffer) => {
      out += c.toString();
    });
    proc.on('close', () => {
      const first = out.split('\n')[0]?.trim();
      resolve(first || 'ffmpeg-unknown');
    });
    proc.on('error', () => resolve('ffmpeg-unknown'));
  });
}

export type FfmpegToolAvailability = {
  ffmpeg: boolean;
  ffprobe: boolean;
};

/** Returns which CLI tools are on PATH (spawn must not throw ENOENT). */
export async function checkFfmpegToolsAvailable(): Promise<FfmpegToolAvailability> {
  const check = (cmd: string) =>
    new Promise<boolean>((resolve) => {
      const proc = spawn(cmd, ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

  const [ffmpeg, ffprobe] = await Promise.all([check('ffmpeg'), check('ffprobe')]);
  return { ffmpeg, ffprobe };
}
