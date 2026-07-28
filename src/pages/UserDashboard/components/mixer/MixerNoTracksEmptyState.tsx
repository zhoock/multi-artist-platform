import { ArrowRight as ArrowRightIcon, Music2 as Music2Icon } from 'lucide-react';

import type { IInterface } from '@models';
import { EmptyState } from '@shared/ui/emptyState';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type MixerNoTracksEmptyStateProps = {
  ui: IInterface | null | undefined;
  onGoToAlbum: () => void;
  className?: string;
};

const MIXER_NO_TRACKS_ICON_SIZE = 48;

export function MixerNoTracksEmptyState({
  ui,
  onGoToAlbum,
  className,
}: MixerNoTracksEmptyStateProps) {
  const m = ui?.dashboard?.mixer;

  return (
    <EmptyState
      layout="inline"
      className={className}
      icon={
        <Music2Icon
          {...dashboardActionIconProps({ size: MIXER_NO_TRACKS_ICON_SIZE, strokeWidth: 1.5 })}
        />
      }
      title={m?.noTracksTitle ?? 'Add a track first'}
      description={m?.noTracksDescription ?? 'Stems can only be uploaded for existing tracks.'}
      primaryAction={{
        label: m?.noTracksAction ?? 'Go to album',
        onClick: onGoToAlbum,
        icon: <ArrowRightIcon {...dashboardActionIconProps({ size: 18 })} />,
      }}
      actionsVariant="dashboard"
    />
  );
}
