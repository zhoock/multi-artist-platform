import { Disc3 as Disc3Icon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { DashboardEmptyState, DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type AlbumsEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateAlbum: () => void;
};

const ALBUMS_EMPTY_ICON_SIZE = 108;

export function AlbumsEmptyState({ ui, onCreateAlbum }: AlbumsEmptyStateProps) {
  const d = ui?.dashboard;

  return (
    <DashboardEmptyState
      variant="tab"
      icon={<Disc3Icon {...dashboardActionIconProps({ size: ALBUMS_EMPTY_ICON_SIZE })} />}
      title={d?.albumsEmptyTitle ?? 'No albums yet'}
      description={
        d?.albumsEmptyDescription ??
        'Upload your first album to share your music with the world and build your catalog.'
      }
      action={
        <DashboardButton variant="primary" onClick={onCreateAlbum}>
          <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{d?.createYourFirstAlbum ?? 'Create Your First Album'}</span>
        </DashboardButton>
      }
    />
  );
}
