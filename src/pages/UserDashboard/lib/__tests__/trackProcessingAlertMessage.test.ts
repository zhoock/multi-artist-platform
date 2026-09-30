import { buildTrackProcessingFailedAfterUploadMessage } from '../trackProcessingAlertMessage';

describe('buildTrackProcessingFailedAfterUploadMessage', () => {
  test('shows the server processing error instead of hiding it behind the generic fallback', () => {
    const message = buildTrackProcessingFailedAfterUploadMessage(
      [
        {
          processingError:
            '[[enqueue]]Audio processing worker is not configured. Missing configuration: ASSET_WORKER_URL.',
        },
      ],
      'Tracks were uploaded, but audio processing could not start.'
    );

    expect(message).toContain('Missing configuration: ASSET_WORKER_URL');
    expect(message).not.toBe('Tracks were uploaded, but audio processing could not start.');
  });

  test('uses the fallback when the upload response has no processor error', () => {
    expect(
      buildTrackProcessingFailedAfterUploadMessage(
        [{ processingError: null }],
        'Tracks were uploaded, but audio processing could not start.'
      )
    ).toBe('Tracks were uploaded, but audio processing could not start.');
  });
});
