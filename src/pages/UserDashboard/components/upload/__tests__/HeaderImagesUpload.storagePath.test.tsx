import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';

const deleteHeroImageMock = jest.fn<(imageUrl: string) => Promise<boolean>>();

jest.mock('@shared/api/storage', () => ({
  uploadFile: jest.fn(),
  deleteHeroImage: (imageUrl: string) => deleteHeroImageMock(imageUrl),
}));

jest.mock('@shared/lib/auth', () => ({
  getUser: () => ({ id: 'af97f741-1111-4222-8333-444444444444' }),
}));

jest.mock('../../modals/cover/CoverImageCropModal', () => ({
  CoverImageCropModal: () => null,
}));

import { HeaderImagesUpload } from '../HeaderImagesUpload';

const OWNER = 'af97f741-1111-4222-8333-444444444444';
const CANONICAL = `users/${OWNER}/hero/hero-36924b53-1920.jpg`;
const CANONICAL_2 = `users/${OWNER}/hero/hero-63382ec4-1920.jpg`;

function renderUpload(
  currentImages: string[],
  onImagesUpdated?: (urls: string[]) => void
): HTMLImageElement[] {
  renderWithProviders(
    <HeaderImagesUpload currentImages={currentImages} onImagesUpdated={onImagesUpdated} />
  );
  return screen.queryAllByRole('img') as HTMLImageElement[];
}

function srcOf(image: HTMLImageElement): string {
  return image.getAttribute('src') ?? '';
}

describe('HeaderImagesUpload — storage path is converted at the render boundary', () => {
  beforeEach(() => {
    deleteHeroImageMock.mockReset();
    deleteHeroImageMock.mockResolvedValue(true);
  });

  test('builds a proxy URL from a canonical storage path', () => {
    const [image] = renderUpload([CANONICAL]);

    // Fails if the preview stops converting: the raw storage path is not a usable <img src>.
    expect(srcOf(image)).toBe(buildProxyImageUrlFromStoragePath(CANONICAL));
    expect(srcOf(image)).not.toBe(CANONICAL);
    expect(srcOf(image)).toContain('proxy-image');
  });

  test('rewrites a legacy localhost URL onto the current origin', () => {
    const legacy = `http://localhost:8080/.netlify/functions/proxy-image?path=${encodeURIComponent(CANONICAL)}`;

    const [image] = renderUpload([legacy]);

    // Defence-in-depth for values still sitting in client state / the DB.
    expect(srcOf(image)).toBe(buildProxyImageUrlFromStoragePath(CANONICAL));
    expect(srcOf(image)).not.toContain(':8080');
  });

  test('leaves an already-usable /api/proxy-image URL alone', () => {
    const url = `/api/proxy-image?path=${encodeURIComponent(CANONICAL)}`;

    const [image] = renderUpload([url]);

    expect(srcOf(image)).toBe(url);
  });

  test('leaves a bare filename alone', () => {
    const [image] = renderUpload(['hero-main']);

    expect(srcOf(image)).toBe('hero-main');
  });

  test('resolves an image-set() value to a single preview URL', () => {
    const imageSet = `image-set(url('${CANONICAL}') 1x)`;

    const [image] = renderUpload([imageSet]);

    expect(srcOf(image)).toBe(buildProxyImageUrlFromStoragePath(CANONICAL));
  });

  test('renders every image in stored order', () => {
    const images = renderUpload([CANONICAL_2, CANONICAL]);

    expect(images.map(srcOf)).toEqual([
      buildProxyImageUrlFromStoragePath(CANONICAL_2),
      buildProxyImageUrlFromStoragePath(CANONICAL),
    ]);
  });
});

describe('HeaderImagesUpload — edits keep canonical values', () => {
  beforeEach(() => {
    deleteHeroImageMock.mockReset();
    deleteHeroImageMock.mockResolvedValue(true);
  });

  test('remove emits the remaining canonical paths, not preview URLs', async () => {
    const onImagesUpdated = jest.fn<(urls: string[]) => void>();
    renderUpload([CANONICAL, CANONICAL_2], onImagesUpdated);

    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить изображение' })[0]);

    await waitFor(() => expect(onImagesUpdated).toHaveBeenCalled());

    // This array is exactly what useSettingsPage POSTs to /api/user-profile.
    expect(onImagesUpdated).toHaveBeenCalledWith([CANONICAL_2]);
  });

  test('remove sends the canonical storage path to delete-hero-image', async () => {
    renderUpload([CANONICAL, CANONICAL_2], jest.fn());

    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить изображение' })[0]);

    await waitFor(() => expect(deleteHeroImageMock).toHaveBeenCalled());
    expect(deleteHeroImageMock).toHaveBeenCalledWith(CANONICAL);
  });

  test('removing the last image emits an empty array', async () => {
    const onImagesUpdated = jest.fn<(urls: string[]) => void>();
    renderUpload([CANONICAL], onImagesUpdated);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить изображение' }));

    await waitFor(() => expect(onImagesUpdated).toHaveBeenCalledWith([]));
  });
});
