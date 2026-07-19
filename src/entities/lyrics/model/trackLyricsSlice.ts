import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { fetchAlbums } from '@entities/album/model/albumsSlice';
import type { IAlbums } from '@models';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { trackLyricsEntityKey } from '@shared/lib/lyrics/types';

import { applyTrackLyricsBundle } from './actions';

export type TrackLyricsState = {
  entities: Record<string, TrackLyricsBundle>;
};

const initialState: TrackLyricsState = {
  entities: {},
};

export function extractLyricsFromAlbums(albums: IAlbums[]): TrackLyricsBundle[] {
  const bundles: TrackLyricsBundle[] = [];
  for (const album of albums) {
    const albumId = album.albumId || '';
    if (!albumId) continue;
    for (const track of album.tracks ?? []) {
      const lyrics = (track as { lyrics?: TrackLyricsBundle }).lyrics;
      if (lyrics) {
        bundles.push(lyrics);
      }
    }
  }
  return bundles;
}

const trackLyricsSlice = createSlice({
  name: 'trackLyrics',
  initialState,
  reducers: {
    hydrateTrackLyricsFromAlbums(state, action: PayloadAction<IAlbums[]>) {
      for (const bundle of extractLyricsFromAlbums(action.payload)) {
        state.entities[trackLyricsEntityKey(bundle.albumId, bundle.trackId, bundle.lang)] = bundle;
      }
    },
    resetTrackLyricsState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(applyTrackLyricsBundle, (state, action) => {
      const bundle = action.payload;
      state.entities[trackLyricsEntityKey(bundle.albumId, bundle.trackId, bundle.lang)] = bundle;
    });
    builder.addCase(fetchAlbums.fulfilled, (state, action) => {
      if (action.payload.staleAbort) return;
      // Public surfaces no longer use fat albums; hydrate lyrics only from Dashboard CRUD.
      if (action.payload.writeTarget !== 'dashboard') return;
      for (const bundle of extractLyricsFromAlbums(action.payload.albums)) {
        state.entities[trackLyricsEntityKey(bundle.albumId, bundle.trackId, bundle.lang)] = bundle;
      }
    });
  },
});

export const { hydrateTrackLyricsFromAlbums, resetTrackLyricsState } = trackLyricsSlice.actions;
export const trackLyricsReducer = trackLyricsSlice.reducer;
