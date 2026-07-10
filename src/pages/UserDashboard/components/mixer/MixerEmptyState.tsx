import { SlidersHorizontal as SlidersHorizontalIcon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { DashboardEmptyState, DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type MixerEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateAlbum: () => void;
};

const MIXER_EMPTY_ICON_SIZE = 108;

export function MixerEmptyState({ ui, onCreateAlbum }: MixerEmptyStateProps) {
  const m = ui?.dashboard?.mixer;

  return (
    <DashboardEmptyState
      variant="tab"
      icon={
        <SlidersHorizontalIcon {...dashboardActionIconProps({ size: MIXER_EMPTY_ICON_SIZE })} />
      }
      title={m?.emptyTitle ?? 'No albums available'}
      description={m?.emptyDescription ?? 'Create an album to add stems to the mixer.'}
      action={
        <DashboardButton variant="primary" onClick={onCreateAlbum}>
          <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{m?.createAlbum ?? 'Create album'}</span>
        </DashboardButton>
      }
    />
  );
}
