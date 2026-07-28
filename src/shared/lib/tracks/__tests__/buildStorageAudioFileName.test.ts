import {
  buildStorageAudioFileName,
  slugifyOriginalFileBaseForStorage,
} from '../buildStorageAudioFileName';

describe('buildStorageAudioFileName', () => {
  test('slugifies Cyrillic filenames to ASCII-only storage keys', () => {
    expect(slugifyOriginalFileBaseForStorage('03-Фиджийская русалка Барнума-2496HD.wav')).toBe(
      '03-2496HD'
    );
    expect(buildStorageAudioFileName('uuid-1', '03-Фиджийская русалка Барнума-2496HD.wav')).toBe(
      'uuid-1__03-2496HD.wav'
    );
  });

  test('falls back to track slug when only digits remain', () => {
    expect(slugifyOriginalFileBaseForStorage('03-Фиджийская.wav')).toBe('track');
  });
});
