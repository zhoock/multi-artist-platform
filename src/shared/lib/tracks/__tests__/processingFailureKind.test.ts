import {
  formatEnqueueProcessingError,
  parseProcessingError,
} from '@shared/lib/tracks/processingFailureKind';

describe('processingFailureKind', () => {
  test('formatEnqueueProcessingError adds enqueue prefix', () => {
    expect(formatEnqueueProcessingError('Worker unavailable')).toBe(
      '[[enqueue]]Worker unavailable'
    );
  });

  test('parseProcessingError detects enqueue failures', () => {
    expect(parseProcessingError('[[enqueue]]Worker unavailable')).toEqual({
      kind: 'enqueue',
      message: 'Worker unavailable',
    });
  });

  test('parseProcessingError treats unprefixed errors as pipeline failures', () => {
    expect(parseProcessingError('ffmpeg exited 1: invalid data')).toEqual({
      kind: 'pipeline',
      message: 'ffmpeg exited 1: invalid data',
    });
  });

  test('parseProcessingError treats unprefixed worker errors as pipeline failures', () => {
    expect(
      parseProcessingError('Audio processing worker is unavailable. Please try again later.')
    ).toEqual({
      kind: 'pipeline',
      message: 'Audio processing worker is unavailable. Please try again later.',
    });
  });
});
