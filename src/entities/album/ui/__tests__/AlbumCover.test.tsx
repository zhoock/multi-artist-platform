import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import AlbumCover from '../AlbumCover';

jest.mock('@shared/lib/hooks/useImageColor', () => ({
  useImageColor: () => ({ current: null }),
  clearImageColorCache: jest.fn(),
}));

const TEST_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';
const COVER_KEY = 'smolyanoe-chuchelko-Cover-23-remastered';

describe('AlbumCover imageSource', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('default imageSource uses proxy URLs', () => {
    render(
      <AlbumCover
        img={COVER_KEY}
        userId={TEST_USER_ID}
        fullName="Album"
        size={448}
        densities={[1]}
      />
    );

    const img = screen.getByRole('img', { name: /обложка альбома/i });
    expect(img.getAttribute('src')).toContain('proxy-image?path=');
    expect(img.getAttribute('src')).not.toContain('supabase.co');
  });

  test('imageSource="cdn" uses Supabase public URLs', () => {
    render(
      <AlbumCover
        img={COVER_KEY}
        userId={TEST_USER_ID}
        fullName="Album"
        size={448}
        densities={[1]}
        imageSource="cdn"
      />
    );

    const img = screen.getByRole('img', { name: /обложка альбома/i });
    expect(img.getAttribute('src')).toContain(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/`
    );
    expect(img.getAttribute('src')).toContain(
      `${COVER_KEY}-448.webp?v=${encodeURIComponent(String(1_700_000_000_000))}`
    );
    expect(img.getAttribute('src')).not.toContain('/api/proxy-image');
  });
});
