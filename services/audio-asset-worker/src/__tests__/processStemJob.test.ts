import { jest, describe, expect, test, beforeEach } from '@jest/globals';

jest.mock('../lib/storage.js', () => ({
  createPipelineStorage: jest.fn(),
}));

jest.mock('../pipeline/transcodePipelineOutput.js', () => ({
  contentTypeForPipelineExtension: jest.fn(() => 'audio/opus'),
  transcodeLocalFileToPipelineOutput: jest.fn(),
}));

import { createPipelineStorage } from '../lib/storage.js';
import { transcodeLocalFileToPipelineOutput } from '../pipeline/transcodePipelineOutput.js';
import { processStemJob } from '../processStemJob.js';

const mockStorage = {
  downloadToFile: jest.fn<() => Promise<void>>(),
  uploadFile: jest.fn<() => Promise<void>>(),
  removeFile: jest.fn<() => Promise<void>>(),
};

describe('processStemJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createPipelineStorage).mockReturnValue(mockStorage);
    jest.mocked(transcodeLocalFileToPipelineOutput).mockResolvedValue({
      duration: 120,
      bitrate: 128_000,
      sampleRate: 48_000,
      channels: 2,
      codec: 'opus',
      fileSize: 1_900_000,
    });
  });

  test('transcodes master, uploads opus playback, deletes master', async () => {
    const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const masterPath = `users/${userId}/audio/album-1/t-1/original/stem-x.wav`;

    const result = await processStemJob({
      userId,
      albumId: 'album-1',
      trackId: 't-1',
      masterPath,
      masterFileName: 'stem-x.wav',
    });

    expect(result.fileName).toBe('stem-x.opus');
    expect(result.playbackPath).toBe(`users/${userId}/audio/album-1/t-1/stem-x.opus`);
    expect(result.fileSize).toBe(1_900_000);
    expect(mockStorage.downloadToFile).toHaveBeenCalledWith(masterPath, expect.any(String));
    expect(mockStorage.uploadFile).toHaveBeenCalledWith(
      result.playbackPath,
      expect.any(String),
      'audio/opus'
    );
    expect(mockStorage.removeFile).toHaveBeenCalledWith(masterPath);
  });
});
