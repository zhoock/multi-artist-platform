import { enqueueTrackProcessing } from '../enqueueTrackProcessing';
import { PROCESSING_ERROR_WORKER_NOT_CONFIGURED } from '../trackProcessingErrors';
import { resetTrackProcessingGateForTests } from '../../../../services/audio-asset-worker/src/trackProcessingGate';

jest.mock('../../../../services/audio-asset-worker/src/processTrackJobRetry', () => ({
  processTrackJobWithRetry: jest.fn(),
}));

jest.mock('../../../../services/audio-asset-worker/src/processors/ffmpegTranscoder', () => ({
  checkFfmpegToolsAvailable: jest.fn(),
}));

jest.mock('../trackProcessingFailure', () => ({
  markTrackProcessingEnqueueFailed: jest.fn(),
}));

import { processTrackJobWithRetry } from '../../../../services/audio-asset-worker/src/processTrackJobRetry';
import { checkFfmpegToolsAvailable } from '../../../../services/audio-asset-worker/src/processors/ffmpegTranscoder';
import { markTrackProcessingEnqueueFailed } from '../trackProcessingFailure';
import { runInSiteTrackProcessor } from '../runInSiteTrackProcessor';

const payload = {
  userId: 'user-1',
  albumDbId: 'album-db-1',
  albumSlug: 'my-album',
  trackDbId: 'track-db-1',
  trackId: 'track-1',
  masterPath: 'users/user-1/audio/my-album/original/track.wav',
};

const originalFetch = global.fetch;

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, snapshot);
}

describe('audio processing pipeline', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    resetTrackProcessingGateForTests();
    restoreEnv(envSnapshot);
    delete process.env.ASSET_WORKER_URL;
    delete process.env.ASSET_WORKER_WEBHOOK_SECRET;
    delete process.env.CONTEXT;
    delete process.env.URL;
    delete process.env.DEPLOY_PRIME_URL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.NETLIFY_DEV;
    jest.mocked(checkFfmpegToolsAvailable).mockResolvedValue({ ffmpeg: true, ffprobe: true });
    jest.mocked(processTrackJobWithRetry).mockResolvedValue('completed');
    jest.mocked(markTrackProcessingEnqueueFailed).mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv(envSnapshot);
    resetTrackProcessingGateForTests();
  });

  test('upload enqueue creates a processing job and the processor accepts it', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
    }) as typeof fetch;

    const enqueued = await enqueueTrackProcessing(payload);

    expect(enqueued).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://worker.test/jobs/process-track',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      })
    );

    const started = await runInSiteTrackProcessor({
      authorization: 'Bearer secret',
      payload,
    });

    expect(started.statusCode).toBe(202);
    expect(started.body).toEqual({ accepted: true, trackId: 'track-1', result: 'completed' });
    expect(processTrackJobWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ trackDbId: 'track-db-1', masterPath: payload.masterPath })
    );
    expect(markTrackProcessingEnqueueFailed).not.toHaveBeenCalled();
  });

  test('processor unavailable returns a reachable error and does not claim the job started', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as typeof fetch;

    const result = await enqueueTrackProcessing(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('worker_unreachable');
      expect(result.message).toContain('ECONNREFUSED');
    }
  });

  test('retry after a temporary processor error starts the job', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => '',
      }) as typeof fetch;

    const first = await enqueueTrackProcessing(payload);
    const second = await enqueueTrackProcessing(payload);

    expect(first.ok).toBe(false);
    expect(second).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('a second retry while the job is in flight does not start a duplicate job', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';

    let release: (value: 'completed') => void = () => undefined;
    const jobStarted = new Promise<void>((resolve) => {
      jest.mocked(processTrackJobWithRetry).mockImplementationOnce(
        () =>
          new Promise((done) => {
            release = done;
            resolve();
          })
      );
    });

    const first = runInSiteTrackProcessor({
      authorization: 'Bearer secret',
      payload,
    });
    await jobStarted;

    const second = await runInSiteTrackProcessor({
      authorization: 'Bearer secret',
      payload,
    });

    expect(second).toEqual({
      statusCode: 202,
      body: { accepted: true, duplicate: true, trackId: 'track-1' },
    });
    expect(processTrackJobWithRetry).toHaveBeenCalledTimes(1);

    release('completed');
    await expect(first).resolves.toEqual({
      statusCode: 202,
      body: { accepted: true, trackId: 'track-1', result: 'completed' },
    });
  });

  test('production without processor config logs the missing variables', async () => {
    process.env.CONTEXT = 'production';
    delete process.env.URL;
    delete process.env.JWT_SECRET;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await enqueueTrackProcessing(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('worker_not_configured');
      expect(result.message).toContain(PROCESSING_ERROR_WORKER_NOT_CONFIGURED);
      expect(result.message).toContain('ASSET_WORKER_URL');
      expect(result.message).toContain('ASSET_WORKER_WEBHOOK_SECRET');
      expect(result.message).toContain('JWT_SECRET');
    }
    expect(errorSpy).toHaveBeenCalledWith(
      '[enqueueTrackProcessing] Worker not configured — cannot enqueue job',
      expect.objectContaining({
        missing: expect.arrayContaining(['ASSET_WORKER_URL', 'ASSET_WORKER_WEBHOOK_SECRET']),
      })
    );
    errorSpy.mockRestore();
  });

  test('production without an external worker starts the in-site processor', async () => {
    process.env.CONTEXT = 'production';
    process.env.URL = 'https://example.test';
    process.env.JWT_SECRET = 'platform-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
    }) as typeof fetch;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const enqueued = await enqueueTrackProcessing(payload);

    expect(enqueued).toEqual({ ok: true });
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/.netlify/functions/process-track-assets-background',
      expect.objectContaining({ method: 'POST' })
    );
    const request = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.headers['X-Audio-Processor-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(request.body).not.toContain('platform-secret');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ASSET_WORKER_URL is not set'),
      expect.objectContaining({ trackId: 'track-1' })
    );

    const rejected = await runInSiteTrackProcessor({
      authorization: 'Bearer platform-secret',
      rawBody: request.body,
      payload: JSON.parse(request.body) as typeof payload,
    });
    expect(rejected.statusCode).toBe(401);

    const started = await runInSiteTrackProcessor({
      signature: request.headers['X-Audio-Processor-Signature'],
      rawBody: request.body,
      payload: JSON.parse(request.body) as typeof payload,
    });
    expect(started.statusCode).toBe(202);
    if ('result' in started.body) {
      expect(started.body.result).toBe('completed');
    }
    warnSpy.mockRestore();
  });

  test('a loopback processor URL is rejected on production instead of being called', async () => {
    process.env.CONTEXT = 'production';
    process.env.ASSET_WORKER_URL = 'http://localhost:8090';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';
    global.fetch = jest.fn() as typeof fetch;

    const result = await enqueueTrackProcessing(payload);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('worker_not_configured');
      expect(result.message).toContain('loopback');
    }
  });

  test('missing ffmpeg marks the track failed and does not report completion', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';
    jest.mocked(checkFfmpegToolsAvailable).mockResolvedValue({ ffmpeg: false, ffprobe: false });

    const result = await runInSiteTrackProcessor({
      authorization: 'Bearer secret',
      payload,
    });

    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual(
      expect.objectContaining({ error: expect.stringContaining('ffmpeg=false') })
    );
    expect(processTrackJobWithRetry).not.toHaveBeenCalled();
    expect(markTrackProcessingEnqueueFailed).toHaveBeenCalledWith(
      'track-db-1',
      expect.stringContaining('ffmpeg=false')
    );
  });

  test('an already ready playback job is not run again', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';
    jest.mocked(processTrackJobWithRetry).mockResolvedValue('already_ready');

    const result = await runInSiteTrackProcessor({
      authorization: 'Bearer secret',
      payload,
    });

    expect(result.statusCode).toBe(202);
    if ('result' in result.body) {
      expect(result.body.result).toBe('already_ready');
    }
    expect(markTrackProcessingEnqueueFailed).not.toHaveBeenCalled();
  });
});
