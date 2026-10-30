import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWaveformPeaksJson } from '../../../../../src/shared/lib/audio/waveformPeaks.js';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'node:child_process';
import { generateWaveformPeaksJsonFile } from '../waveformPeaksFromAudio.js';

const spawnMock = jest.mocked(spawn) as jest.Mock;

function mockSpawnSuccess(stdoutChunks: Buffer[]): void {
  spawnMock.mockImplementation((_cmd, _args, _opts) => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: () => void };
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { end: () => undefined };
    queueMicrotask(() => {
      for (const chunk of stdoutChunks) {
        proc.stdout.emit('data', chunk);
      }
      proc.emit('close', 0);
    });
    return proc as never;
  });
}

function mockSpawnLaunchError(message: string): void {
  spawnMock.mockImplementation(() => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: () => void };
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { end: () => undefined };
    queueMicrotask(() => {
      proc.emit('error', new Error(message));
    });
    return proc as never;
  });
}

describe('generateWaveformPeaksJsonFile', () => {
  const priorFfmpegPath = process.env.FFMPEG_PATH;

  beforeEach(() => {
    spawnMock.mockReset();
    process.env.FFMPEG_PATH = '/bundled/ffmpeg-netlify';
  });

  afterEach(() => {
    if (priorFfmpegPath === undefined) {
      delete process.env.FFMPEG_PATH;
    } else {
      process.env.FFMPEG_PATH = priorFfmpegPath;
    }
  });

  test('spawns resolved ffmpeg binary with pcm decode args', async () => {
    const sample = Buffer.alloc(8);
    sample.writeFloatLE(0.5, 0);
    mockSpawnSuccess([sample]);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'waveform-peaks-'));
    const input = path.join(dir, 'in.mp3');
    const output = path.join(dir, 'out.json');
    await fs.writeFile(input, 'fake');

    await generateWaveformPeaksJsonFile(input, output, 1);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[0]).toBe('/bundled/ffmpeg-netlify');
    expect(spawnMock.mock.calls[0]?.[1]).toEqual([
      '-i',
      input,
      '-ac',
      '1',
      '-f',
      'f32le',
      'pipe:1',
    ]);
  });

  test('propagates spawn launch errors (ENOENT)', async () => {
    mockSpawnLaunchError('spawn ffmpeg ENOENT');

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'waveform-peaks-'));
    const input = path.join(dir, 'in.mp3');
    const output = path.join(dir, 'out.json');
    await fs.writeFile(input, 'fake');

    await expect(generateWaveformPeaksJsonFile(input, output, 1)).rejects.toThrow(
      'spawn ffmpeg ENOENT'
    );
  });

  test('writes waveform peaks JSON in v1 contract', async () => {
    const samples = new Float32Array([0, 1, 0.5, -0.25]);
    mockSpawnSuccess([Buffer.from(samples.buffer)]);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'waveform-peaks-'));
    const input = path.join(dir, 'in.mp3');
    const output = path.join(dir, 'out.json');
    await fs.writeFile(input, 'fake');

    const result = await generateWaveformPeaksJsonFile(input, output, 2);
    expect(result.pointCount).toBe(2);
    expect(result.sampleCount).toBe(4);

    const raw = JSON.parse(await fs.readFile(output, 'utf8')) as unknown;
    const parsed = validateWaveformPeaksJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.peaks).toHaveLength(2);
  });
});
