import { formatStorageUploadError, resolveTrackUploadErrorCopy } from '../trackUploadErrorMessages';

describe('trackUploadErrorMessages', () => {
  test('returns Russian message for oversized file without English server detail', () => {
    const message = formatStorageUploadError(
      413,
      'Payload Too Large',
      'The object exceeded the maximum allowed size',
      'ru'
    );

    expect(message).toBe('Файл слишком большой для загрузки. Максимальный размер — 50 МБ.');
    expect(message).not.toMatch(/too large|maximum allowed size/i);
  });

  test('returns English defaults for en locale', () => {
    expect(resolveTrackUploadErrorCopy('en').fileTooLarge).toContain('50 MB');
    expect(resolveTrackUploadErrorCopy('ru').fileTooLarge).toContain('50 МБ');
  });
});
