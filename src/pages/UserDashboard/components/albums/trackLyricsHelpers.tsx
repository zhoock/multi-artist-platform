import React from 'react';
import {
  Eye as EyeIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react';

import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import type { IInterface } from '@models';
import {
  getLyricsActionsForState,
  getLyricsPreviewLinesFromBundle,
  type LyricsAction,
} from '@shared/lib/lyrics';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

export type { LyricsAction };

export function getLyricsStatusText(state: TrackLyricsBundle['state'], ui: IInterface | null) {
  switch (state) {
    case 'text-only':
      return ui?.dashboard?.lyricsNotSynchronized ?? 'Not synchronized';
    case 'empty':
      return ui?.dashboard?.noLyrics ?? 'No lyrics';
    default:
      return '';
  }
}

export function getLyricsActionLabel(action: LyricsAction, ui: IInterface | null): string {
  switch (action) {
    case 'edit':
      return ui?.dashboard?.editLyrics ?? 'Edit lyrics';
    case 'prev':
      return ui?.dashboard?.previewLyrics ?? 'Preview lyrics';
    case 'sync':
      return ui?.dashboard?.syncLyricsTitle ?? 'Sync lyrics';
    case 'add':
      return ui?.dashboard?.addLyrics ?? 'Add lyrics';
    default:
      return '';
  }
}

export function renderLyricsActionIcon(action: LyricsAction) {
  const iconProps = dashboardActionIconProps();

  switch (action) {
    case 'edit':
      return <PencilIcon {...iconProps} />;
    case 'prev':
      return <EyeIcon {...iconProps} />;
    case 'sync':
      return <RefreshCwIcon {...iconProps} />;
    case 'add':
      return <PlusIcon {...iconProps} />;
    default:
      return null;
  }
}

export function getLyricsCardActions(lyrics: TrackLyricsBundle): LyricsAction[] {
  return getLyricsActionsForState(lyrics.state);
}

export function getLyricsPreviewLines(lyrics: TrackLyricsBundle, maxLines: number = 3): string[] {
  return getLyricsPreviewLinesFromBundle(lyrics, maxLines);
}
