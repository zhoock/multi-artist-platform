import { Disc3 as Disc3Icon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type AlbumsEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateAlbum: () => void;
};

const ALBUMS_EMPTY_ICON_SIZE = 108;

export function AlbumsEmptyState({ ui, onCreateAlbum }: AlbumsEmptyStateProps) {
  const d = ui?.dashboard;

  return (
    <div className="user-dashboard__tab-empty" role="status">
      <div className="user-dashboard__tab-empty-inner">
        <Disc3Icon
          className="user-dashboard__tab-empty-icon"
          {...dashboardActionIconProps({ size: ALBUMS_EMPTY_ICON_SIZE })}
        />
        <h3 className="user-dashboard__tab-empty-title">
          {d?.albumsEmptyTitle ?? 'No albums yet'}
        </h3>
        <p className="user-dashboard__tab-empty-description">
          {d?.albumsEmptyDescription ??
            'Upload your first album to share your music with the world and build your catalog.'}
        </p>
        <button type="button" className="user-dashboard__tab-empty-cta" onClick={onCreateAlbum}>
          <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{d?.createYourFirstAlbum ?? 'Create Your First Album'}</span>
        </button>
      </div>
    </div>
  );
}
