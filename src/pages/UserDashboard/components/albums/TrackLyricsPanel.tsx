import React from 'react';
import { FileText as FileTextIcon, Plus as PlusIcon } from 'lucide-react';

import type { TrackData } from '@entities/album/lib/transformAlbumData';
import type { IInterface } from '@models';
import { DashboardCta, DashboardEmptyState, DashboardIconButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  formatLyricsLineCount,
  getLyricsActionLabel,
  getLyricsCardActions,
  getLyricsLineCount,
  getLyricsPreviewLines,
  getLyricsStatusText,
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
  const statusText = getLyricsStatusText(track.lyricsStatus, ui);
  const isEmpty = track.lyricsStatus === 'empty';

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

  const previewLines = getLyricsPreviewLines(track);
  const lineCount = getLyricsLineCount(track);
  const lyricsActions = getLyricsCardActions(track.lyricsStatus);

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

        <div className="albums-tab__track-lyrics-card-side">
          <div className="albums-tab__track-lyrics-card-meta">
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

          {lineCount > 0 ? (
            <div className="albums-tab__track-lyrics-line-count">
              {formatLyricsLineCount(lineCount, lang)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
