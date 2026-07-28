import { Music2 as Music2Icon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { EmptyState } from '@shared/ui/emptyState';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type AlbumNoTracksEmptyStateProps = {
  ui: IInterface | null | undefined;
  onUploadTracks: () => void;
  layout?: 'card' | 'inline';
  className?: string;
};

const ALBUM_NO_TRACKS_ICON_SIZE = 48;

export function AlbumNoTracksEmptyState({
  ui,
  onUploadTracks,
  layout = 'inline',
  className,
}: AlbumNoTracksEmptyStateProps) {
  const d = ui?.dashboard;

  return (
    <EmptyState
      layout={layout}
      className={className}
      icon={
        <Music2Icon
          {...dashboardActionIconProps({ size: ALBUM_NO_TRACKS_ICON_SIZE, strokeWidth: 1.5 })}
        />
      }
      title={d?.albumNoTracksOwnerTitle ?? 'Add your first track'}
      description={d?.albumNoTracksOwnerDescription ?? 'You can publish the album after that.'}
      primaryAction={{
        label: d?.albumNoTracksOwnerAction ?? 'Upload',
        onClick: onUploadTracks,
        icon: <UploadIcon {...dashboardActionIconProps({ size: 18 })} />,
      }}
      actionsVariant="dashboard"
    />
  );
}
