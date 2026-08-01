import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import {
  buildWaveformPeaksFromSamples,
  DEFAULT_WAVEFORM_POINT_COUNT,
  serializeWaveformPeaks,
} from '../../../../src/shared/lib/audio/waveformPeaks.js';

export type WaveformPeaksGenerationResult = {
  pointCount: number;
  sampleCount: number;
};

/** Decode input audio to mono f32le PCM via ffmpeg stdout, then write peaks JSON. */
export async function generateWaveformPeaksJsonFile(
  inputPath: string,
  outputPath: string,
  pointCount: number = DEFAULT_WAVEFORM_POINT_COUNT
): Promise<WaveformPeaksGenerationResult> {
  const samples = await decodeMonoPcmFromAudio(inputPath);
  const built = buildWaveformPeaksFromSamples(samples, pointCount);
  await fs.writeFile(outputPath, serializeWaveformPeaks(built.peaks, built.pointCount), 'utf8');
  return { pointCount: built.pointCount, sampleCount: samples.length };
}

async function decodeMonoPcmFromAudio(inputPath: string): Promise<Float32Array> {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const args = ['-i', inputPath, '-ac', '1', '-f', 'f32le', 'pipe:1'];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg pcm exited ${code}: ${stderr.slice(-2000)}`));
    });
  });

  const buf = Buffer.concat(chunks);
  const sampleCount = Math.floor(buf.length / 4);
  if (sampleCount === 0) {
    return new Float32Array(0);
  }

  const aligned = buf.byteOffset % 4 === 0;
  if (aligned) {
    return new Float32Array(buf.buffer, buf.byteOffset, sampleCount);
  }

  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, sampleCount);
}
