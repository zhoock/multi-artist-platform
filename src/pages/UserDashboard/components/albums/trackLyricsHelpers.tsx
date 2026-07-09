import React from 'react';
import {
  Eye as EyeIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshCwIcon,
} from 'lucide-react';

import type { TrackData } from '@entities/album/lib/transformAlbumData';
import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

export type LyricsAction = 'edit' | 'prev' | 'sync' | 'add';

export function getLyricsStatusText(status: TrackData['lyricsStatus'], ui: IInterface | null) {
  switch (status) {
    case 'synced':
      return ui?.dashboard?.lyricsSynchronized ?? 'Synchronized';
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

export function getLyricsCardActions(status: TrackData['lyricsStatus']): LyricsAction[] {
  switch (status) {
    case 'synced':
    case 'text-only':
      return ['edit', 'sync'];
    case 'empty':
      return ['add'];
    default:
      return [];
  }
}

export function getLyricsPreviewLines(track: TrackData, maxLines: number = 3): string[] {
  if (track.syncedLyrics?.length) {
    return track.syncedLyrics
      .map((line) => line.text.trim())
      .filter(Boolean)
      .slice(0, maxLines);
  }

  if (track.lyricsText?.trim()) {
    return track.lyricsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, maxLines);
  }

  return [];
}
