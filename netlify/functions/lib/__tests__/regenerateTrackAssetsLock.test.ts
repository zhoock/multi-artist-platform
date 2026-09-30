import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../enqueueTrackProcessing', () => ({
  enqueueTrackProcessing: jest.fn(),
}));

jest.mock('../trackProcessingFailure', () => ({
  markTrackProcessingEnqueueFailed: jest.fn(),
}));

jest.mock('../track-pipeline-schema', () => ({
  tracksTableHasPipelineColumns: jest.fn().mockResolvedValue(true),
  trackAssetsTableExists: jest.fn().mockResolvedValue(true),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers');
  return {
    ...actual,
    requireArtistAccount: jest.fn(() => 'user-1'),
  };
});

import { enqueueTrackProcessing } from '../enqueueTrackProcessing';
import { query } from '../db';
import { handler } from '../../regenerate-track-assets';

const event = {
  httpMethod: 'POST',
  headers: { authorization: 'Bearer token' },
  body: JSON.stringify({ albumId: 'album-1', trackId: 'track-1' }),
  isBase64Encoded: false,
} as HandlerEvent;

function trackRow(processingStatus: string, lockStale: boolean) {
  return {
    id: 'track-db-1',
    master_path: 'users/user-1/audio/album-1/original/track.wav',
    album_db_id: 'album-db-1',
    album_slug: 'album-1',
    processing_status: processingStatus,
    processing_lock_stale: lockStale,
  };
}

describe('regenerate-track-assets lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(enqueueTrackProcessing).mockResolvedValue({ ok: true });
  });

  async function post(processingStatus: string, lockStale = false) {
    jest.mocked(query).mockResolvedValueOnce({
      rows: [trackRow(processingStatus, lockStale)],
      rowCount: 1,
    } as never);
    const response = await handler(event, {} as never);
    if (!response) throw new Error('handler returned void');
    return {
      statusCode: response.statusCode,
      body: JSON.parse(response.body || '{}') as {
        data: { enqueued: boolean; reason?: string; processingStatus: string };
      },
    };
  }

  test('pending and processing do not start a second job', async () => {
    const pending = await post('pending');
    const processing = await post('processing');

    expect(pending.body.data).toEqual({
      trackId: 'track-1',
      enqueued: false,
      reason: 'already_running',
      processingStatus: 'pending',
    });
    expect(processing.body.data.reason).toBe('already_running');
    expect(enqueueTrackProcessing).not.toHaveBeenCalled();
  });

  test('a failed track starts a new job', async () => {
    const response = await post('failed');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.enqueued).toBe(true);
    expect(enqueueTrackProcessing).toHaveBeenCalledTimes(1);
  });

  test('a ready track is not processed again without force', async () => {
    const response = await post('ready');

    expect(response.body.data).toEqual(
      expect.objectContaining({
        enqueued: false,
        reason: 'already_ready',
        processingStatus: 'ready',
      })
    );
    expect(enqueueTrackProcessing).not.toHaveBeenCalled();
  });

  test('a stale processing claim can be started again', async () => {
    const response = await post('processing', true);

    expect(response.body.data.enqueued).toBe(true);
    expect(enqueueTrackProcessing).toHaveBeenCalledTimes(1);
  });
});
