import type { AppDispatch } from '@shared/model/appStore/types';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { trackLyricsEntityKey } from '@shared/lib/lyrics/types';

import { applyTrackLyricsBundle } from '../model/actions';

/**
 * Persist bundle under canonical `bundle.lang` and mirror to UI lang when they differ
 * so `resolveTrackLyricsBundle` preferred-locale lookup matches Redux keys.
 */
export function dispatchTrackLyricsBundle(
  dispatch: AppDispatch,
  bundle: TrackLyricsBundle,
  uiLang?: string
): string[] {
  const writtenKeys: string[] = [];

  dispatch(applyTrackLyricsBundle(bundle));
  writtenKeys.push(trackLyricsEntityKey(bundle.albumId, bundle.trackId, bundle.lang));

  const ui = uiLang?.trim();
  if (ui && ui !== bundle.lang && bundle.state !== 'empty') {
    dispatch(applyTrackLyricsBundle({ ...bundle, lang: ui }));
    writtenKeys.push(trackLyricsEntityKey(bundle.albumId, bundle.trackId, ui));
  }

  return writtenKeys;
}
