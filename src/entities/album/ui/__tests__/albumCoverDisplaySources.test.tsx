import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import CatalogAlbumCover from '../CatalogAlbumCover';
import { getAlbumCoverAdminVariantUrls } from '@shared/lib/albumCoverUrl';
import { MiniPlayer } from '@features/player/ui/PlayerShell/MiniPlayer';

jest.mock('@shared/lib/hooks/useImageColor', () => ({
  useImageColor: () => ({ current: null }),
  clearImageColorCache: jest.fn(),
}));

const TEST_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';
const COVER_KEY = 'smolyanoe-chuchelko-Cover-23-remastered';

const noopForwardHandlers = {
  onMouseDown: jest.fn(),
  onMouseUp: jest.fn(),
  onMouseLeave: jest.fn(),
  onTouchStart: jest.fn(),
  onTouchEnd: jest.fn(),
};

describe('display-only album cover image sources', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn((query: string) => ({
        matches: query.includes('768px'),
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('CatalogAlbumCover renders direct CDN URLs', () => {
    render(<CatalogAlbumCover img={COVER_KEY} userId={TEST_USER_ID} fullName="Album" />);

    const img = screen.getByRole('img', { name: /обложка альбома/i });
    expect(img.getAttribute('src')).toContain(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/`
    );
    expect(img.getAttribute('src')).not.toContain('/api/proxy-image');
  });

  test('MiniPlayer renders direct CDN URLs', () => {
    render(
      <MiniPlayer
        title="Track"
        cover={COVER_KEY}
        userId={TEST_USER_ID}
        isPlaying={false}
        onToggle={jest.fn()}
        onExpand={jest.fn()}
        forwardHandlers={noopForwardHandlers}
      />
    );

    const img = screen.getByRole('img', { name: /обложка альбома/i });
    expect(img.getAttribute('src')).toContain(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/`
    );
    expect(img.getAttribute('src')).not.toContain('/api/proxy-image');
  });

  test('admin thumbnails use direct CDN URLs', () => {
    const urls = getAlbumCoverAdminVariantUrls(COVER_KEY, TEST_USER_ID);

    expect(urls.webp).toContain(`${SUPABASE_URL}/storage/v1/object/public/user-media/`);
    expect(urls.webp).toContain(`${COVER_KEY}-128.webp`);
    expect(urls.webp).not.toContain('/api/proxy-image');
    expect(urls.jpg).toContain(`${COVER_KEY}-128.jpg`);
  });
});

describe('call sites opt into CDN album covers', () => {
  test('Album page passes imageSource="cdn"', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/Album/Album.tsx'), 'utf8');
    expect(source).toContain('imageSource="cdn"');
  });

  test('Checkout modal passes imageSource="cdn"', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/entities/service/ui/AlbumCheckoutModal.tsx'),
      'utf8'
    );
    expect(source).toContain('imageSource="cdn"');
  });

  test('Payment Success passes imageSource="cdn"', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/PaymentSuccess/PaymentSuccess.tsx'),
      'utf8'
    );
    expect(source).toContain('imageSource="cdn"');
  });
});

describe('AudioPlayer keeps proxy album covers', () => {
  test('AudioPlayer does not opt into CDN album covers', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/player/ui/AudioPlayer/AudioPlayer.tsx'),
      'utf8'
    );
    expect(source).not.toContain('imageSource="cdn"');
    expect(source).not.toContain("imageSource={'cdn'}");
  });
});
