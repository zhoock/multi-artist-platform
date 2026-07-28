import { Music2 as Music2Icon, Upload as UploadIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { IInterface } from '@models';
import { EmptyState } from '@shared/ui/emptyState';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type AlbumTracksEmptyStateProps = {
  ui: IInterface | null | undefined;
  isOwner: boolean;
  ownerDashboardAlbumId?: string | null;
};

const ALBUM_TRACKS_EMPTY_ICON_SIZE = 56;

export function AlbumTracksEmptyState({
  ui,
  isOwner,
  ownerDashboardAlbumId,
}: AlbumTracksEmptyStateProps) {
  const navigate = useNavigate();
  const dashboardCopy = ui?.dashboard;

  const title = isOwner
    ? (dashboardCopy?.albumNoTracksOwnerTitle ?? 'Add your first track')
    : (dashboardCopy?.albumNoTracksVisitorTitle ?? 'No tracks have been published yet.');

  const description = isOwner
    ? (dashboardCopy?.albumNoTracksOwnerDescription ?? 'You can publish the album after that.')
    : (dashboardCopy?.albumNoTracksVisitorDescription ??
      "The artist hasn't added any published tracks to this album yet.");

  const handleUploadTracks = () => {
    if (!ownerDashboardAlbumId) {
      navigate('/dashboard-new/albums');
      return;
    }
    navigate(`/dashboard-new/albums?uploadTracks=${encodeURIComponent(ownerDashboardAlbumId)}`);
  };

  return (
    <EmptyState
      layout="inline"
      className="album-tracks-empty"
      actionsVariant={isOwner ? 'dashboard' : 'plain'}
      icon={
        <Music2Icon
          {...dashboardActionIconProps({ size: ALBUM_TRACKS_EMPTY_ICON_SIZE, strokeWidth: 1.5 })}
        />
      }
      title={title}
      description={description}
      primaryAction={
        isOwner
          ? {
              label: dashboardCopy?.albumNoTracksOwnerAction ?? 'Upload',
              onClick: handleUploadTracks,
              icon: <UploadIcon {...dashboardActionIconProps({ size: 18 })} />,
            }
          : undefined
      }
    />
  );
}
