/**
 * P1-7 Chain 2 — OLD cover cleanup after successful DB save (best-effort).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(),
}));

import { createSupabaseAdminClient } from '../supabase';
import {
  buildCoverVariantStoragePaths,
  cleanupSupersededAlbumCoversBestEffort,
  normalizeCoverBaseName,
} from '../album-cover-storage';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OLD_BASE = 'album_cover_old_uuid_artist-Cover-album';
const NEW_BASE = 'album_cover_new_uuid_artist-Cover-album';

const mockedCreateSupabaseAdminClient = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('album-cover-storage cleanup', () => {
  test('normalizeCoverBaseName strips suffix and extension', () => {
    expect(normalizeCoverBaseName(`${OLD_BASE}-448.webp`)).toBe(OLD_BASE);
    expect(normalizeCoverBaseName(OLD_BASE)).toBe(OLD_BASE);
  });

  test('buildCoverVariantStoragePaths includes all derivative paths', () => {
    const paths = buildCoverVariantStoragePaths(USER_ID, OLD_BASE);
    expect(paths).toContain(`users/${USER_ID}/albums/${OLD_BASE}-448.webp`);
    expect(paths).toContain(`users/${USER_ID}/albums/${OLD_BASE}-1344.jpg`);
  });

  test('Test 6 — cleanup failure after DB save is non-fatal (logged, not thrown)', async () => {
    const removed: string[] = [];
    const supabase = {
      storage: {
        from: jest.fn(() => ({
          remove: jest.fn(async (paths: string[]) => {
            removed.push(...paths);
            return { error: { message: 'storage unavailable' } };
          }),
        })),
      },
    };
    mockedCreateSupabaseAdminClient.mockReturnValue(supabase as never);

    await expect(
      cleanupSupersededAlbumCoversBestEffort(USER_ID, [OLD_BASE], NEW_BASE)
    ).resolves.toBeUndefined();

    expect(removed.length).toBeGreaterThan(0);
  });

  test('Test 1 — removes OLD base after DB points to NEW', async () => {
    const removed: string[] = [];
    const supabase = {
      storage: {
        from: jest.fn(() => ({
          remove: jest.fn(async (paths: string[]) => {
            removed.push(...paths);
            return { error: null };
          }),
        })),
      },
    };
    mockedCreateSupabaseAdminClient.mockReturnValue(supabase as never);

    await cleanupSupersededAlbumCoversBestEffort(USER_ID, [OLD_BASE], NEW_BASE);

    expect(removed.some((p) => p.includes(OLD_BASE))).toBe(true);
    expect(removed.some((p) => p.includes(NEW_BASE))).toBe(false);
  });

  test('skips cleanup when new base matches old base', async () => {
    const supabase = {
      storage: {
        from: jest.fn(() => ({
          remove: jest.fn(async () => ({ error: null })),
        })),
      },
    };
    mockedCreateSupabaseAdminClient.mockReturnValue(supabase as never);

    await cleanupSupersededAlbumCoversBestEffort(USER_ID, [OLD_BASE], OLD_BASE);

    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});
