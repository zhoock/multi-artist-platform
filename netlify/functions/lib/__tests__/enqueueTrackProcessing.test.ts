import { enqueueTrackProcessing } from '../enqueueTrackProcessing';
import { PROCESSING_ERROR_WORKER_NOT_CONFIGURED } from '../trackProcessingErrors';

describe('enqueueTrackProcessing', () => {
  const originalFetch = global.fetch;
  const originalWorkerUrl = process.env.ASSET_WORKER_URL;
  const originalSecret = process.env.ASSET_WORKER_WEBHOOK_SECRET;

  const payload = {
    userId: 'user-1',
    albumDbId: 'album-db-1',
    albumSlug: 'my-album',
    trackDbId: 'track-db-1',
    trackId: 'track-1',
    masterPath: 'users/user-1/audio/my-album/original/track.wav',
  };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ASSET_WORKER_URL = originalWorkerUrl;
    process.env.ASSET_WORKER_WEBHOOK_SECRET = originalSecret;
  });

  test('returns worker_not_configured when env vars are missing', async () => {
    delete process.env.ASSET_WORKER_URL;
    delete process.env.ASSET_WORKER_WEBHOOK_SECRET;

    const result = await enqueueTrackProcessing(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('worker_not_configured');
      expect(result.message).toBe(PROCESSING_ERROR_WORKER_NOT_CONFIGURED);
    }
  });

  test('returns worker_rejected when worker responds with non-2xx', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    }) as typeof fetch;

    const result = await enqueueTrackProcessing(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('worker_rejected');
      expect(result.message).toContain('503');
    }
  });

  test('returns ok when worker accepts the job', async () => {
    process.env.ASSET_WORKER_URL = 'http://worker.test';
    process.env.ASSET_WORKER_WEBHOOK_SECRET = 'secret';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
    }) as typeof fetch;

    const result = await enqueueTrackProcessing(payload);

    expect(result).toEqual({ ok: true });
  });
});
