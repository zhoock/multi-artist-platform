import { HeartHandshake as HeartHandshakeIcon, Search as SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type CollectionEmptyStateProps = {
  ui: IInterface | null | undefined;
};

const COLLECTION_EMPTY_ICON_SIZE = 108;

export function CollectionEmptyState({ ui }: CollectionEmptyStateProps) {
  const t = ui?.dashboard?.archive;

  return (
    <div className="user-dashboard__tab-empty" role="status">
      <div className="user-dashboard__tab-empty-inner">
        <HeartHandshakeIcon
          className="user-dashboard__tab-empty-icon"
          {...dashboardActionIconProps({ size: COLLECTION_EMPTY_ICON_SIZE })}
        />
        <h3 className="user-dashboard__tab-empty-title">
          {t?.emptyTitle ?? 'Your collection is empty'}
        </h3>
        <p className="user-dashboard__tab-empty-description user-dashboard__tab-empty-description--multiline">
          {t?.emptyDescription ??
            'Support your favorite artists and get access to exclusive tracks, articles, stems and album downloads.'}
        </p>
        <Link to="/" className="user-dashboard__tab-empty-cta">
          <SearchIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{t?.discoverArtists ?? 'Discover Artists'}</span>
        </Link>
      </div>
    </div>
  );
}
