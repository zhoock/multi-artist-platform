import { describe, expect, it, jest } from '@jest/globals';

import type { TrackUploadData } from '@shared/api/tracks';
import { emptyAudioTechnicalMetadata } from '@shared/lib/audio/audioTechnicalMetadata';

import {
  commitTrackUploadBatchToDb,
  resolveTrackUploadBatchPostStorageDecision,
  shouldProceedWithTrackUploadDbCommit,
} from '../trackUploadBatchCommit';

const mockTrack = (id: string): TrackUploadData => ({
  ...emptyAudioTechnicalMetadata(),
  fileName: `${id}.mp3`,
  duration: 120,
  trackId: id,
  storagePath: `users/u1/audio/album/original/${id}.mp3`,
  url: `https://example.com/${id}.mp3`,
  translations: { en: { title: id } },
});

describe('resolveTrackUploadBatchPostStorageDecision', () => {
  it('returns cancel when aborted before any file completes', () => {
    const controller = new AbortController();
    controller.abort();

    expect(resolveTrackUploadBatchPostStorageDecision(controller.signal, 0)).toEqual({
      action: 'cancel',
    });
  });

  it('returns cancel when aborted after one file reaches tracksData', () => {
    const controller = new AbortController();
    controller.abort();

    expect(resolveTrackUploadBatchPostStorageDecision(controller.signal, 1)).toEqual({
      action: 'cancel',
    });
  });

  it('returns cancel when aborted after several files reach tracksData', () => {
    const controller = new AbortController();
    controller.abort();

    expect(resolveTrackUploadBatchPostStorageDecision(controller.signal, 3)).toEqual({
      action: 'cancel',
    });
  });

  it('returns all_failed when not aborted and no tracks uploaded', () => {
    const controller = new AbortController();

    expect(resolveTrackUploadBatchPostStorageDecision(controller.signal, 0)).toEqual({
      action: 'all_failed',
    });
  });

  it('returns commit when not aborted and tracks uploaded', () => {
    const controller = new AbortController();

    expect(resolveTrackUploadBatchPostStorageDecision(controller.signal, 2)).toEqual({
      action: 'commit',
    });
  });
});

describe('commitTrackUploadBatchToDb', () => {
  it('calls uploadTracks exactly once when not cancelled', async () => {
    const controller = new AbortController();
    const tracksData = [mockTrack('t1'), mockTrack('t2')];
    const uploadTracksFn = jest.fn<CommitTrackUploadBatchToDbUploadFn>().mockResolvedValue({
      success: true,
      data: tracksData.map((track) => ({
        trackId: track.trackId,
        title: track.translations.en?.title ?? '',
        url: track.url,
        storagePath: track.storagePath,
      })),
    });

    const result = await commitTrackUploadBatchToDb({
      abortSignal: controller.signal,
      albumId: 'album-1',
      lang: 'en',
      tracksData,
      uploadTracksFn,
    });

    expect(result.status).toBe('committed');
    expect(uploadTracksFn).toHaveBeenCalledTimes(1);
    expect(uploadTracksFn).toHaveBeenCalledWith('album-1', 'en', tracksData);
  });

  it('does not call uploadTracks when aborted before DB commit', async () => {
    const controller = new AbortController();
    controller.abort();
    const uploadTracksFn = jest.fn<CommitTrackUploadBatchToDbUploadFn>();

    const result = await commitTrackUploadBatchToDb({
      abortSignal: controller.signal,
      albumId: 'album-1',
      lang: 'en',
      tracksData: [mockTrack('t1')],
      uploadTracksFn,
    });

    expect(result.status).toBe('cancelled');
    expect(uploadTracksFn).not.toHaveBeenCalled();
  });

  it('race: abort after storage completes but before DB commit skips uploadTracks', async () => {
    const controller = new AbortController();
    expect(resolveTrackUploadBatchPostStorageDecision(controller.signal, 1).action).toBe('commit');

    controller.abort();
    expect(shouldProceedWithTrackUploadDbCommit(controller.signal)).toBe(false);

    const uploadTracksFn = jest.fn<CommitTrackUploadBatchToDbUploadFn>();
    const result = await commitTrackUploadBatchToDb({
      abortSignal: controller.signal,
      albumId: 'album-1',
      lang: 'en',
      tracksData: [mockTrack('t1')],
      uploadTracksFn,
    });

    expect(result.status).toBe('cancelled');
    expect(uploadTracksFn).not.toHaveBeenCalled();
  });
});

type CommitTrackUploadBatchToDbUploadFn = (
  albumId: string,
  lang: 'en' | 'ru',
  tracks: TrackUploadData[]
) => Promise<{
  success: boolean;
  data?: Array<{ trackId: string; title: string; url: string; storagePath: string }>;
}>;
