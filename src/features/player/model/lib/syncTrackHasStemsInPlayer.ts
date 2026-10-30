import { getStore } from '@shared/model/appStore';
import { playerActions } from '@features/player/model/slice/playerSlice';

export type SyncTrackHasStemsInPlayerPayload = {
  albumId: string;
  trackId: string;
  hasStems: boolean;
};

/** Updates matching queue rows after a successful stems manifest write (no playback side effects). */
export function syncTrackHasStemsInPlayer(payload: SyncTrackHasStemsInPlayerPayload): void {
  try {
    getStore().dispatch(playerActions.syncTrackHasStemsInQueue(payload));
  } catch {
    // Store may be unavailable during SSR or isolated unit tests.
  }
}
