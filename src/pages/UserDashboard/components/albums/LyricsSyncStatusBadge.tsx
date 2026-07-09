import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import type { IInterface } from '@models';
import { StatusBadge, type StatusBadgeVariant } from '@shared/ui/statusBadge';

import { getLyricsStatusText } from './trackLyricsHelpers';

type LyricsSyncStatusBadgeProps = {
  lyrics: TrackLyricsBundle;
  ui: IInterface | null;
};

function lyricsStatusVariant(state: TrackLyricsBundle['state']): StatusBadgeVariant | null {
  switch (state) {
    case 'text-only':
      return 'readyToPublish';
    default:
      return null;
  }
}

export function LyricsSyncStatusBadge({ lyrics, ui }: LyricsSyncStatusBadgeProps) {
  const variant = lyricsStatusVariant(lyrics.state);

  if (!variant) {
    return null;
  }

  return <StatusBadge variant={variant}>{getLyricsStatusText(lyrics.state, ui)}</StatusBadge>;
}
