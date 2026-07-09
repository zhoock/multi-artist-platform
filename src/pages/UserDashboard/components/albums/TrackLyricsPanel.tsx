import React from 'react';
import { FileText as FileTextIcon, Plus as PlusIcon } from 'lucide-react';

import type { TrackData } from '@entities/album/lib/transformAlbumData';
import { resolveTrackLyricsBundle } from '@entities/lyrics';
import type { IInterface } from '@models';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { DashboardCta, DashboardEmptyState, DashboardIconButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { LyricsSyncStatusBadge } from './LyricsSyncStatusBadge';
import {
  getLyricsActionLabel,
  getLyricsCardActions,
  getLyricsPreviewLines,
  renderLyricsActionIcon,
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
  // track.lyrics is hydration fallback only; trackLyricsSlice is the runtime source of truth.
  const lyrics = useAppSelector((state) =>
    resolveTrackLyricsBundle(state, albumId, track.id, track.lyrics)
  );
  const isEmpty = lyrics.state === 'empty';

  const emptyTitle = lang !== 'ru' ? 'No lyrics yet' : 'Текста пока нет';

  const emptyDescription =
    lang !== 'ru'
      ? 'Add synchronized lyrics so listeners can follow the song in real time.'
      : 'Добавьте синхронизированный текст, чтобы слушатели могли следить за песней в реальном времени.';

  if (isEmpty) {
    return (
      <div className="albums-tab__track-lyrics">
        <DashboardEmptyState
          variant="card"
          icon={
            <FileTextIcon
              {...dashboardActionIconProps({
                size: 48,
                strokeWidth: 1.5,
              })}
            />
          }
          title={emptyTitle}
          description={emptyDescription}
          action={
            <DashboardCta
              className="albums-tab__add-lyrics"
              onClick={() => onLyricsAction('add', albumId, track.id, track.title)}
            >
              <PlusIcon {...dashboardActionIconProps({ size: 18 })} />
              {ui?.dashboard?.addLyrics ?? 'Add Lyrics'}
            </DashboardCta>
          }
        />
      </div>
    );
  }

  const previewLines = getLyricsPreviewLines(lyrics);
  const lyricsActions = getLyricsCardActions(lyrics);

  return (
    <div className="albums-tab__track-lyrics">
      <div className="albums-tab__track-lyrics-card">
        <div className="albums-tab__track-lyrics-card-icon" aria-hidden>
          <FileTextIcon {...dashboardActionIconProps({ size: 32, strokeWidth: 1.25 })} />
        </div>

        <div className="albums-tab__track-lyrics-preview">
          {previewLines.map((line, index) => (
            <p
              key={`${track.id}-preview-${index}`}
              className="albums-tab__track-lyrics-preview-line"
            >
              {line}
            </p>
          ))}
        </div>

        <div className="albums-tab__track-lyrics-card-meta">
          <LyricsSyncStatusBadge lyrics={lyrics} ui={ui} />
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
      </div>
    </div>
  );
}
