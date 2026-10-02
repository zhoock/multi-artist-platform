/** @jest-environment jsdom */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { Route, Routes } from 'react-router-dom';
import type { IArticles } from '@models';
import { getImageUrl } from '@shared/api/albums';
import { renderWithProviders } from '@shared/lib/test-utils';
import { getProxyImagePath } from '@shared/lib/proxyImageEnvironment';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { ArticlePage } from '../ui/ArticlePage';

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'Test Artist',
    isLoading: false,
  }),
}));

jest.mock('@shared/lib/uniqueUploadFileSuffix', () => ({
  uniqueUploadFileSuffix: () => 'fixed-suffix-001',
}));

jest.mock('@shared/api/storage', () => ({
  uploadFile: jest.fn(),
}));

import { uploadFile } from '@shared/api/storage';
import { uploadArticleBlockImage } from '../../UserDashboard/components/blocks/uploadArticleBlockImage';
import { blocksToDetails } from '../../UserDashboard/components/modals/article/EditArticleModalV2.utils';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PHOTO_NAME = 'IMG_4521.JPG';
const RAW_KEY = `article_fixed-suffix-001_${PHOTO_NAME}`;
const STORAGE_KEY = sanitizeFileName(RAW_KEY);
const PRODUCTION_ORIGIN = 'https://smolyanoechuchelko.ru';

function storagePathFor(fileName: string): string {
  return `users/${USER_ID}/articles/${fileName}`;
}

function productionProxyUrl(storagePath: string): string {
  return `${PRODUCTION_ORIGIN}${getProxyImagePath(PRODUCTION_ORIGIN)}?path=${encodeURIComponent(storagePath)}`;
}

function renderPublicArticle(img: string) {
  const article: IArticles = {
    articleId: 'test-article',
    userId: USER_ID,
    nameArticle: 'Session notes',
    description: 'Notes',
    date: '2024-01-01',
    img: '',
    details: [
      {
        id: 1,
        type: 'image',
        blockKind: 'image',
        img,
        caption: 'Session photo',
      },
    ],
  };

  return renderWithProviders(
    <Routes>
      <Route path="/articles/:articleId" element={<ArticlePage />} />
    </Routes>,
    {
      initialEntries: ['/articles/test-article'],
      preloadedState: {
        lang: { current: 'en' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [article],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: null,
          inFlightFetchContextKey: null,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    }
  );
}

function renderedImageStoragePath(): string {
  const img = document.querySelector('.article__media-figure img');
  expect(img).not.toBeNull();
  expect(img).toHaveAttribute('alt', 'Session photo');
  const src = img?.getAttribute('src') ?? '';
  expect(src).not.toBe('');
  const path = new URL(src, 'http://localhost').searchParams.get('path');
  expect(path).toBeTruthy();
  return path as string;
}

describe('article block image upload → public src', () => {
  beforeEach(() => {
    jest.mocked(uploadFile).mockReset();
    jest.mocked(uploadFile).mockResolvedValue('https://example.supabase.co/storage/v1/object/ok');
  });

  test('saved article image src is the sanitized storage object on the production proxy URL', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], PHOTO_NAME, { type: 'image/jpeg' });

    const imageKey = await uploadArticleBlockImage(file);

    expect(imageKey).toBe(STORAGE_KEY);
    expect(imageKey).not.toBe(RAW_KEY);
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'articles',
        fileName: STORAGE_KEY,
      })
    );

    const persisted = JSON.parse(
      JSON.stringify(blocksToDetails([{ id: 'block-1', type: 'image', imageKey: imageKey! }]))
    ) as { img: string }[];

    expect(persisted[0].img).toBe(STORAGE_KEY);

    renderPublicArticle(persisted[0].img);

    const path = renderedImageStoragePath();
    const objectPath = storagePathFor(STORAGE_KEY);
    expect(path).toBe(objectPath);
    expect(path).not.toContain('IMG_4521.JPG');

    const productionUrl = productionProxyUrl(objectPath);
    expect(getProxyImagePath('smolyanoechuchelko.ru')).toBe('/api/proxy-image');
    expect(productionUrl).toBe(
      `${PRODUCTION_ORIGIN}/api/proxy-image?path=${encodeURIComponent(objectPath)}`
    );
    expect(new URL(productionUrl).searchParams.get('path')).toBe(path);
  });

  test('a previously stored raw photo name still resolves to the object that upload wrote', () => {
    renderPublicArticle(RAW_KEY);

    const path = renderedImageStoragePath();
    expect(path).toBe(storagePathFor(STORAGE_KEY));
    expect(decodeURIComponent(path)).not.toContain('IMG_4521.JPG');
    expect(new URL(productionProxyUrl(path)).searchParams.get('path')).toBe(
      storagePathFor(STORAGE_KEY)
    );
  });

  test('does not rewrite album or article cover object names', () => {
    const albumKey = 'album_cover_uuid_artist-Cover-album-448.webp';
    const coverKey = 'article_cover_uuid_Photo.jpg';

    const albumPath = new URL(
      getImageUrl(albumKey, '.jpg', { userId: USER_ID, category: 'albums' })!,
      'http://localhost'
    ).searchParams.get('path');
    const coverPath = new URL(
      getImageUrl(coverKey, '.jpg', { userId: USER_ID, category: 'articles' })!,
      'http://localhost'
    ).searchParams.get('path');

    expect(albumPath).toBe(`users/${USER_ID}/albums/${albumKey}`);
    expect(coverPath).toBe(`users/${USER_ID}/articles/${coverKey}`);
  });
});
