import type { RootState } from '@shared/model/appStore/types';
import { trackLyricsEntityKey } from '@shared/lib/lyrics/types';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';

import { selectTrackLyricsBundle } from './selectors';

export function describeTrackLyricsEntities(
  state: RootState,
  albumId: string,
  trackId: string | number
): Array<{ key: string; state: string }> {
  const id = normalizeTrackIdString(String(trackId)) || String(trackId);
  const album = albumId.trim();
  return (['ru', 'en'] as const).map((lang) => {
    const key = trackLyricsEntityKey(album, id, lang);
    const bundle = selectTrackLyricsBundle(state, album, id, lang);
    return { key, state: bundle?.state ?? 'missing' };
  });
}
