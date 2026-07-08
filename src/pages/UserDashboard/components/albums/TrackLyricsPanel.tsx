import React from 'react';
import { Plus as PlusIcon } from 'lucide-react';

import type { TrackData } from '@entities/album/lib/transformAlbumData';
import type { IInterface } from '@models';
import { DashboardAction, DashboardIconButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  getLyricsActionLabel,
  getLyricsActions,
  getLyricsStatusText,
  renderLyricsActionIcon,
  trackHasSyncedLyrics,
  type LyricsAction,
} from './trackLyricsHelpers';

type TrackLyricsPanelProps = {
  track: TrackData;
  albumId: string;
  ui: IInterface | null;
  lang: 'en' | 'ru';
  onLyricsAction: (
    action: LyricsAction,
    albumId: string,
    trackId: string,
    trackTitle: string
  ) => void;
};

export function TrackLyricsPanel({
  track,
  albumId,
  ui,
  lang,
  onLyricsAction,
}: TrackLyricsPanelProps) {
  const statusText = getLyricsStatusText(track.lyricsStatus, ui);
  const isEmpty = track.lyricsStatus === 'empty';
  const lyricsActions = getLyricsActions(track.lyricsStatus, trackHasSyncedLyrics(track));

  const description =
    lang !== 'ru'
      ? 'Manage synchronized lyrics for this track.'
      : 'Управляйте синхронизированным текстом для этого трека.';

  return (
    <div className="albums-tab__track-lyrics">
      <div className="albums-tab__track-lyrics-header">
        <div>
          <h4 className="albums-tab__subsection-title">{ui?.dashboard?.lyrics ?? 'Lyrics'}</h4>
          <p className="albums-tab__track-lyrics-description">{description}</p>
        </div>
        {isEmpty ? (
          <DashboardAction
            className="albums-tab__add-lyrics"
            onClick={() => onLyricsAction('add', albumId, track.id, track.title)}
          >
            <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
            {ui?.dashboard?.addLyrics ?? 'Add lyrics'}
          </DashboardAction>
        ) : null}
      </div>

      {!isEmpty ? (
        <div className="albums-tab__track-lyrics-row">
          <span className="albums-tab__track-lyrics-name">{track.title}</span>
          <span className="albums-tab__track-lyrics-status">{statusText}</span>
          <div className="albums-tab__track-lyrics-actions">
            {lyricsActions.map((action) => {
              const actionLabel = getLyricsActionLabel(action, ui);

              return (
                <DashboardIconButton
                  key={action}
                  onClick={() => onLyricsAction(action, albumId, track.id, track.title)}
                  aria-label={actionLabel}
                  title={actionLabel}
                >
                  {renderLyricsActionIcon(action)}
                </DashboardIconButton>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
