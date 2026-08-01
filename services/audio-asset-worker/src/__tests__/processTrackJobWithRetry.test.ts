jest.mock('../processTrackJob.js', () => ({
  processTrackJob: jest.fn(),
}));

jest.mock('../lib/logOperationalEvent.js', () => ({
  logOperationalEvent: jest.fn(),
  OPERATIONAL_EVENT_LOCK_RETRIES_EXHAUSTED: 'audio_asset_job_lock_retries_exhausted',
}));

import { processTrackJob } from '../processTrackJob.js';
import {
  logOperationalEvent,
  OPERATIONAL_EVENT_LOCK_RETRIES_EXHAUSTED,
} from '../lib/logOperationalEvent.js';
import { processTrackJobWithRetry } from '../processTrackJobRetry.js';
import type { ProcessTrackJobPayload } from '../pipeline/types.js';

const payload: ProcessTrackJobPayload = {
  userId: 'u1',
  albumDbId: 'a1',
  albumSlug: 'album',
  trackDbId: 'td1',
  trackId: 't1',
  masterPath: 'users/u1/audio/album/original/track.wav',
};

describe('processTrackJobWithRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(processTrackJob).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns immediately when job completes', async () => {
    jest.mocked(processTrackJob).mockResolvedValueOnce('completed');
    await expect(
      processTrackJobWithRetry(payload, { maxAttempts: 3, baseDelayMs: 100 })
    ).resolves.toBe('completed');
    expect(processTrackJob).toHaveBeenCalledTimes(1);
  });

  it('retries on skipped then succeeds', async () => {
    jest
      .mocked(processTrackJob)
      .mockResolvedValueOnce('skipped')
      .mockResolvedValueOnce('completed');

    const promise = processTrackJobWithRetry(payload, { maxAttempts: 3, baseDelayMs: 100 });
    await jest.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe('completed');
    expect(processTrackJob).toHaveBeenCalledTimes(2);
  });

  it('returns skipped after max attempts', async () => {
    jest.mocked(processTrackJob).mockResolvedValue('skipped');

    const promise = processTrackJobWithRetry(payload, { maxAttempts: 2, baseDelayMs: 100 });
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toBe('skipped');
    expect(processTrackJob).toHaveBeenCalledTimes(2);
  });

  it('emits operational log when lock retries are exhausted', async () => {
    jest.mocked(processTrackJob).mockResolvedValue('skipped');

    const promise = processTrackJobWithRetry(
      { ...payload, stages: ['generate-waveform'] },
      { maxAttempts: 2, baseDelayMs: 100 }
    );
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(200);
    await promise;

    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: OPERATIONAL_EVENT_LOCK_RETRIES_EXHAUSTED,
        level: 'error',
        trackId: payload.trackId,
        trackDbId: payload.trackDbId,
        stages: ['generate-waveform'],
        generators: ['waveform'],
        attempts: 2,
        reason: 'advisory_lock_not_acquired',
      })
    );
  });
});
