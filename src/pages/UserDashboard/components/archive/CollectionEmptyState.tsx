import { HeartHandshake as HeartHandshakeIcon, Search as SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { IInterface } from '@models';
import { DashboardEmptyState, DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type CollectionEmptyStateProps = {
  ui: IInterface | null | undefined;
  embedded?: boolean;
};

const COLLECTION_EMPTY_ICON_SIZE = 108;

export function CollectionEmptyState({ ui, embedded = false }: CollectionEmptyStateProps) {
  const t = ui?.dashboard?.archive;

  return (
    <DashboardEmptyState
      variant="tab"
      className={embedded ? 'collection__embedded-empty-state' : undefined}
      icon={
        <HeartHandshakeIcon {...dashboardActionIconProps({ size: COLLECTION_EMPTY_ICON_SIZE })} />
      }
      title={t?.emptyTitle ?? 'Your collection is empty'}
      description={
        t?.emptyDescription ??
        'Add artists to your collection to access their exclusive content and updates.'
      }
      action={
        <DashboardButton variant="primary" as={Link} to="/">
          <SearchIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{t?.discoverArtists ?? 'Find artists'}</span>
        </DashboardButton>
      }
    />
  );
}
