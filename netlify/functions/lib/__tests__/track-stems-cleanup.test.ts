/**
 * Stem Storage cleanup when a track is explicitly deleted (admin).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
  STORAGE_BUCKET_NAME: 'user-media',
}));

jest.mock('../stems-access', () => ({
  fetchStemManifestFromStorage: jest.fn(),
}));

jest.mock('../track-storage-cleanup', () => ({
  removeTrackStoragePaths: jest.fn(),
}));

import { createSupabaseAdminClient } from '../supabase';
import { fetchStemManifestFromStorage } from '../stems-access';
import { removeTrackStoragePaths } from '../track-storage-cleanup';
import { collectTrackStemStoragePaths, removeTrackStemStorage } from '../track-stems-cleanup';
import { getStemsFolderPath } from '../stem-storage-path-shared';

const mockCreateSupabaseAdminClient = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;
const mockFetchStemManifestFromStorage = fetchStemManifestFromStorage as jest.MockedFunction<
  typeof fetchStemManifestFromStorage
>;
const mockRemoveTrackStoragePaths = removeTrackStoragePaths as jest.MockedFunction<
  typeof removeTrackStoragePaths
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ALBUM_ID = 'my-album';
const TRACK_A = '1';
const TRACK_B = '2';

function mockListStemFiles(files: string[]) {
  const folder = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_A);
  const list = jest.fn(async () => ({
    data: files.map((name) => ({ name, metadata: { size: 1 } })),
    error: null,
  }));
  mockCreateSupabaseAdminClient.mockReturnValue({
    storage: {
      from: () => ({ list }),
    },
  } as never);
  return { list, folder };
}

describe('track-stems-cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(null);
    mockFetchStemManifestFromStorage.mockResolvedValue([]);
    mockRemoveTrackStoragePaths.mockResolvedValue(undefined);
  });

  test('collectTrackStemStoragePaths lists all files in the track stem folder', async () => {
    const { folder } = mockListStemFiles(['stems.json', 'stem-abc.wav', 'stem-def.wav']);

    const paths = await collectTrackStemStoragePaths(USER_ID, ALBUM_ID, TRACK_A);

    expect(paths.sort()).toEqual(
      [`${folder}/stem-abc.wav`, `${folder}/stem-def.wav`, `${folder}/stems.json`].sort()
    );
    expect(mockFetchStemManifestFromStorage).toHaveBeenCalled();
  });

  test('collectTrackStemStoragePaths merges manifest entries with folder listing', async () => {
    const folder = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_A);
    mockCreateSupabaseAdminClient.mockReturnValue({
      storage: {
        from: () => ({
          list: jest.fn(async (prefix: string) => {
            if (prefix === folder) {
              return {
                data: [
                  { name: 'stems.json', metadata: { size: 1 } },
                  { name: 'stem-orphan.opus', metadata: { size: 1 } },
                  { name: 'original', metadata: null },
                ],
                error: null,
              };
            }
            if (prefix === `${folder}/original`) {
              return {
                data: [{ name: 'stem-leftover.wav', metadata: { size: 1 } }],
                error: null,
              };
            }
            return { data: [], error: null };
          }),
        }),
      },
    } as never);
    mockFetchStemManifestFromStorage.mockResolvedValue([
      { id: 's1', name: 'Bass', category: 'bass', file: 'stem-live.opus' },
    ]);

    const paths = await collectTrackStemStoragePaths(USER_ID, ALBUM_ID, TRACK_A);

    expect(paths.sort()).toEqual(
      [
        `${folder}/stems.json`,
        `${folder}/stem-orphan.opus`,
        `${folder}/stem-live.opus`,
        `${folder}/original/stem-leftover.wav`,
      ].sort()
    );
  });

  test('collectTrackStemStoragePaths falls back to manifest when folder list is empty', async () => {
    mockCreateSupabaseAdminClient.mockReturnValue({
      storage: { from: () => ({ list: jest.fn(async () => ({ data: [], error: null })) }) },
    } as never);
    mockFetchStemManifestFromStorage.mockResolvedValue([
      { id: 's1', name: 'Drums', category: 'drums', file: 'stem-one.wav' },
    ]);

    const paths = await collectTrackStemStoragePaths(USER_ID, ALBUM_ID, TRACK_A);
    const folder = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_A);

    expect(paths.sort()).toEqual([`${folder}/stem-one.wav`, `${folder}/stems.json`].sort());
  });

  test('removeTrackStemStorage calls removeTrackStoragePaths for collected paths', async () => {
    mockListStemFiles(['stems.json', 'stem-x.mp3']);

    await removeTrackStemStorage(USER_ID, ALBUM_ID, TRACK_A);

    expect(mockRemoveTrackStoragePaths).toHaveBeenCalledTimes(1);
    const arg = mockRemoveTrackStoragePaths.mock.calls[0][0] as string[];
    expect(arg).toHaveLength(2);
    expect(arg.every((p) => p.includes(`/${TRACK_A}/`))).toBe(true);
  });

  test('isolation: stem paths are scoped by logical trackId', async () => {
    const folderA = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_A);
    const folderB = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_B);
    expect(folderA).not.toBe(folderB);

    mockCreateSupabaseAdminClient.mockImplementation(() => {
      const list = jest.fn(async (_prefix: string) => {
        if (_prefix === folderA) {
          return {
            data: [{ name: 'stem-a.wav', metadata: { size: 1 } }],
            error: null,
          };
        }
        if (_prefix === folderB) {
          return {
            data: [{ name: 'stem-b.wav', metadata: { size: 1 } }],
            error: null,
          };
        }
        return { data: [], error: null };
      });
      return { storage: { from: () => ({ list }) } } as never;
    });

    const pathsA = await collectTrackStemStoragePaths(USER_ID, ALBUM_ID, TRACK_A);
    const pathsB = await collectTrackStemStoragePaths(USER_ID, ALBUM_ID, TRACK_B);

    expect(pathsA).toEqual([`${folderA}/stem-a.wav`, `${folderA}/stems.json`]);
    expect(pathsB).toEqual([`${folderB}/stem-b.wav`, `${folderB}/stems.json`]);
  });

  test('re-upload: new trackId uses a different stem folder (no reuse of old stems)', () => {
    const oldFolder = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_A);
    const newFolder = getStemsFolderPath(USER_ID, ALBUM_ID, TRACK_B);
    expect(newFolder).not.toBe(oldFolder);
    expect(oldFolder).toContain(`/${TRACK_A}`);
    expect(newFolder).toContain(`/${TRACK_B}`);
  });
});
