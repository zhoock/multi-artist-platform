import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { IInterface } from '@models';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { bootstrapPublicArtistPageSurfaces } from '@shared/lib/bootstrapPublicArtistPageSurfaces';
import { EmptyState } from '@shared/ui/emptyState';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type StemsPlaygroundVisitorEmptyStateProps = {
  ui: IInterface | null | undefined;
  artistSlug: string;
  artistHubPath: string;
};

const VISITOR_EMPTY_ICON_SIZE = 48;

export function StemsPlaygroundVisitorEmptyState({
  ui,
  artistSlug,
  artistHubPath,
}: StemsPlaygroundVisitorEmptyStateProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const stemsCopy = ui?.stems as Record<string, string | undefined> | undefined;
  const title = stemsCopy?.emptyTitle ?? 'Stems are not available yet';
  const description = stemsCopy?.emptyDescription ?? 'The artist has not published stems yet.';
  const goToArtistLabel = stemsCopy?.emptyGoToArtist ?? 'View artist';

  const handleGoToArtist = () => {
    bootstrapPublicArtistPageSurfaces(dispatch, artistSlug);
    navigate(artistHubPath, { replace: false });
  };

  return (
    <EmptyState
      layout="tab"
      className="stems-page__visitor-empty-state"
      icon={
        <SlidersHorizontalIcon
          {...dashboardActionIconProps({ size: VISITOR_EMPTY_ICON_SIZE, strokeWidth: 1.5 })}
        />
      }
      title={title}
      description={description}
      primaryAction={{
        label: goToArtistLabel,
        onClick: handleGoToArtist,
        buttonProps: { className: 'stems-page__visitor-empty-action' },
      }}
      actionsVariant="plain"
    />
  );
}
