import type { TrackData } from '@entities/album/lib/transformAlbumData';
import type { IInterface } from '@models';
import { StatusBadge, type StatusBadgeVariant } from '@shared/ui/statusBadge';

import { getLyricsStatusText } from './trackLyricsHelpers';

type LyricsSyncStatusBadgeProps = {
  status: TrackData['lyricsStatus'];
  ui: IInterface | null;
};

function lyricsStatusVariant(status: TrackData['lyricsStatus']): StatusBadgeVariant | null {
  switch (status) {
    case 'synced':
      return 'published';
    case 'text-only':
      return 'readyToPublish';
    default:
      return null;
  }
}

export function LyricsSyncStatusBadge({ status, ui }: LyricsSyncStatusBadgeProps) {
  const variant = lyricsStatusVariant(status);

  if (!variant) {
    return null;
  }

  return <StatusBadge variant={variant}>{getLyricsStatusText(status, ui)}</StatusBadge>;
}
