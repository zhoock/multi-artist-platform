import { createAction } from '@reduxjs/toolkit';

import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

export const applyTrackLyricsBundle = createAction<TrackLyricsBundle>('trackLyrics/apply');
