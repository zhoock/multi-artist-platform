import { describe, expect, test } from '@jest/globals';
import {
  compressHeroJpegForNetlifyPayload,
  estimateHeroUploadJsonPayloadChars,
  HERO_UPLOAD_MAX_JSON_PAYLOAD_CHARS,
} from '../heroUploadPayload';

describe('estimateHeroUploadJsonPayloadChars', () => {
  test('base64 length implies JSON under payload cap for typical hero JPEG', () => {
    const fileBase64 = 'a'.repeat(3_000_000);
    const len = estimateHeroUploadJsonPayloadChars(fileBase64, {
      fileName: 'hero-test.jpg',
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      originalFileSize: 2_250_000,
    });
    expect(len).toBeLessThanOrEqual(HERO_UPLOAD_MAX_JSON_PAYLOAD_CHARS);
  });
});

describe('compressHeroJpegForNetlifyPayload', () => {
  test('small base64 estimate stays under cap (re-encode not required)', () => {
    const smallBase64 = 'a'.repeat(400_000);
    const len = estimateHeroUploadJsonPayloadChars(smallBase64, {
      fileName: 'hero-small.jpg',
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      originalFileSize: 300_000,
    });
    expect(len).toBeLessThanOrEqual(HERO_UPLOAD_MAX_JSON_PAYLOAD_CHARS);
  });
});
