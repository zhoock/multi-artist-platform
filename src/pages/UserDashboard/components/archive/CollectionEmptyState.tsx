import { HeartHandshake as HeartHandshakeIcon, Search as SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { IInterface } from '@models';
import { DashboardEmptyState, DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type CollectionEmptyStateProps = {
  ui: IInterface | null | undefined;
};

const COLLECTION_EMPTY_ICON_SIZE = 108;

export function CollectionEmptyState({ ui }: CollectionEmptyStateProps) {
  const t = ui?.dashboard?.archive;

  return (
    <DashboardEmptyState
      variant="tab"
      icon={
        <HeartHandshakeIcon {...dashboardActionIconProps({ size: COLLECTION_EMPTY_ICON_SIZE })} />
      }
      title={t?.emptyTitle ?? 'Your collection is empty'}
      description={
        t?.emptyDescription ??
        'Support your favorite artists and get access to exclusive tracks, articles, stems and album downloads.'
      }
      descriptionMultiline
      action={
        <DashboardButton variant="primary" as={Link} to="/">
          <SearchIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{t?.discoverArtists ?? 'Discover Artists'}</span>
        </DashboardButton>
      }
    />
  );
}
