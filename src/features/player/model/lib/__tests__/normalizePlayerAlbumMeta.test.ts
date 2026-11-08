import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { getAlbumCoverPublicUrl } from '@shared/lib/albumCoverPublicUrl';

import { normalizePlayerAlbumMeta, resolvePlayerCoverImg } from '../normalizePlayerAlbumMeta';
import { syncPlayerAlbumMetaFromCurrentTrack } from '../syncPlayerAlbumMetaFromCurrentTrack';
import type { PlayerState } from '@features/player/model/types/playerSchema';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';
const COVER_OBJ = {
  img: 'album_cover_uuid_artist-Cover-rubber-soul.jpg',
  playerBackground: {
    primary: [190, 107, 37] as [number, number, number],
    secondary: [26, 82, 77] as [number, number, number],
  },
};

describe('normalizePlayerAlbumMeta', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('extracts img base from new JSONB cover object', () => {
    const meta = normalizePlayerAlbumMeta({
      albumId: 'rubber-soul',
      album: 'Rubber Soul',
      artist: 'Artist',
      fullName: 'Artist — Rubber Soul',
      cover: COVER_OBJ as unknown as string,
      userId: USER_ID,
    });

    expect(meta.cover).toBe('album_cover_uuid_artist-Cover-rubber-soul');
    expect(meta.playerBackground).toEqual(COVER_OBJ.playerBackground);
  });

  test('resolvePlayerCoverImg builds public Storage URL for -128 webp', () => {
    const img = resolvePlayerCoverImg(COVER_OBJ);
    expect(img).toBe('album_cover_uuid_artist-Cover-rubber-soul');

    const url = getAlbumCoverPublicUrl({
      userId: USER_ID,
      fileNameOrCoverKey: img!,
      suffix: '-128.webp',
    });

    expect(url).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${USER_ID}/albums/album_cover_uuid_artist-Cover-rubber-soul-128.webp`
    );
  });

  test('syncPlayerAlbumMetaFromCurrentTrack keeps string cover when queue carries JSONB cover', () => {
    const state = {
      playlist: [
        {
          id: 't1',
          title: 'Track',
          duration: 180,
          src: 'a.mp3',
          queueAlbumMeta: {
            albumId: 'rubber-soul',
            album: 'Rubber Soul',
            fullName: null,
            cover: COVER_OBJ as unknown as string,
            userId: USER_ID,
            playerBackground: COVER_OBJ.playerBackground,
          },
        },
      ],
      currentTrackIndex: 0,
      albumMeta: {
        albumId: 'rubber-soul',
        album: 'Rubber Soul',
        artist: 'Artist',
        fullName: 'Artist — Rubber Soul',
        cover: 'stale-wrong',
        userId: USER_ID,
      },
    } as unknown as PlayerState;

    syncPlayerAlbumMetaFromCurrentTrack(state);

    expect(state.albumMeta?.cover).toBe('album_cover_uuid_artist-Cover-rubber-soul');
    expect(state.albumMeta?.playerBackground).toEqual(COVER_OBJ.playerBackground);
  });
});
