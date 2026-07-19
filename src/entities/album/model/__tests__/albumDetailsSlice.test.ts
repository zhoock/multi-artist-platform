import { describe, expect, test, beforeEach } from '@jest/globals';

import { createMockAlbumDetails } from './albumDetailsFixtures';
import {
  adoptAlbumDetailsAlbumId,
  albumDetailsReducer,
  fetchAlbumDetailsPage,
  type AlbumDetailsState,
} from '../albumDetailsSlice';
import { resetAlbumDetailsStaleForTests } from '../albumDetailsStale';

function makeState(partial: Partial<AlbumDetailsState> = {}): AlbumDetailsState {
  return {
    status: 'idle',
    error: null,
    errorCode: null,
    data: null,
    fetchContextKey: null,
    artistSlug: null,
    albumId: null,
    lastUpdated: null,
    ...partial,
  };
}

describe('albumDetailsSlice rename / SWR', () => {
  beforeEach(() => {
    resetAlbumDetailsStaleForTests();
  });

  test('adoptAlbumDetailsAlbumId remaps slot identity and keeps last-good payload', () => {
    const data = createMockAlbumDetails({
      albumId: 'stand-up',
      slug: 'stand-up',
      title: 'Stand Up',
    });
    const state = albumDetailsReducer(
      makeState({
        status: 'succeeded',
        data,
        artistSlug: 'jethro-tull',
        albumId: 'stand-up',
        fetchContextKey: 'albumDetails:jethro-tull:stand-up',
        lastUpdated: 1,
      }),
      adoptAlbumDetailsAlbumId({
        previousAlbumId: 'stand-up',
        albumId: 'stand-up-remastered',
        artistSlug: 'jethro-tull',
      })
    );

    expect(state.albumId).toBe('stand-up-remastered');
    expect(state.fetchContextKey).toBe('albumDetails:jethro-tull:stand-up-remastered');
    expect(state.data?.albumId).toBe('stand-up-remastered');
    expect(state.data?.slug).toBe('stand-up-remastered');
    expect(state.data?.title).toBe('Stand Up');
    expect(state.status).toBe('succeeded');
  });

  test('adoptAlbumDetailsAlbumId ignores unrelated slot', () => {
    const data = createMockAlbumDetails({ albumId: 'other', slug: 'other' });
    const state = albumDetailsReducer(
      makeState({
        status: 'succeeded',
        data,
        artistSlug: 'jethro-tull',
        albumId: 'other',
        fetchContextKey: 'albumDetails:jethro-tull:other',
      }),
      adoptAlbumDetailsAlbumId({
        previousAlbumId: 'stand-up',
        albumId: 'stand-up-remastered',
        artistSlug: 'jethro-tull',
      })
    );

    expect(state.albumId).toBe('other');
    expect(state.data?.albumId).toBe('other');
  });

  test('pending fetch keeps last-good data across identity change (SWR)', () => {
    const oldData = createMockAlbumDetails({
      albumId: 'stand-up',
      slug: 'stand-up',
      title: 'Stand Up',
    });
    const state = albumDetailsReducer(
      makeState({
        status: 'succeeded',
        data: oldData,
        artistSlug: 'jethro-tull',
        albumId: 'stand-up',
        fetchContextKey: 'albumDetails:jethro-tull:stand-up',
        lastUpdated: 1,
      }),
      fetchAlbumDetailsPage.pending('req-1', {
        force: true,
        artistSlug: 'jethro-tull',
        albumId: 'stand-up-remastered',
      })
    );

    expect(state.status).toBe('loading');
    expect(state.data).toEqual(oldData);
    expect(state.albumId).toBe('stand-up-remastered');
    expect(state.fetchContextKey).toBe('albumDetails:jethro-tull:stand-up-remastered');
  });
});
