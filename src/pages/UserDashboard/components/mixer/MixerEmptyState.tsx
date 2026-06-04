import { SlidersHorizontal as SlidersHorizontalIcon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type MixerEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateAlbum: () => void;
};

const MIXER_EMPTY_ICON_SIZE = 108;

export function MixerEmptyState({ ui, onCreateAlbum }: MixerEmptyStateProps) {
  const m = ui?.dashboard?.mixer;

  return (
    <div className="user-dashboard__tab-empty" role="status">
      <div className="user-dashboard__tab-empty-inner">
        <SlidersHorizontalIcon
          className="user-dashboard__tab-empty-icon"
          {...dashboardActionIconProps({ size: MIXER_EMPTY_ICON_SIZE })}
        />
        <h3 className="user-dashboard__tab-empty-title">
          {m?.emptyTitle ?? 'No albums available'}
        </h3>
        <p className="user-dashboard__tab-empty-description">
          {m?.emptyDescription ?? 'Create an album to add stems to the mixer.'}
        </p>
        <button type="button" className="user-dashboard__tab-empty-cta" onClick={onCreateAlbum}>
          <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{m?.createAlbum ?? 'Create album'}</span>
        </button>
      </div>
    </div>
  );
}
