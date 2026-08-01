import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil as PencilIcon, Trash2 as Trash2Icon, Replace as ReplaceIcon } from 'lucide-react';

import type { TrackData } from '@entities/album/lib/transformEditableAlbumData';
import type { IInterface, DashboardTrackVisibilityLabels } from '@models';
import { useLang } from '@app/providers/lang';
import {
  TRACK_VISIBILITY_OPTIONS,
  normalizeTrackVisibility,
  type TrackVisibility,
} from '@shared/lib/tracks/trackVisibility';
import { filterVisibilityOptionsByMonetization } from '@shared/lib/payment/artistMonetization';
import { resolveEffectiveContentVisibility } from '@shared/lib/payment/artistMonetization';
import { useArtistMonetization } from '@shared/lib/payment/ArtistMonetizationContext';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { DashboardCard, DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  DASHBOARD_ROW_STATE_FLASH_CLASS,
  DASHBOARD_ROW_FLASH_RGB_VAR,
  getDashboardRowStateFlashRgb,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';
import {
  DashboardAccessMenuPortal,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../../lib/useDashboardAccessMenu';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { TrackLyricsPanel } from './TrackLyricsPanel';
import { TrackProcessingStatus } from './TrackProcessingStatus';
import type { LyricsAction } from './trackLyricsHelpers';

type DashboardUi = NonNullable<IInterface['dashboard']>;
type DashboardUiWithTrackAccess = DashboardUi & {
  trackVisibility?: DashboardTrackVisibilityLabels;
  trackAccessAriaLabel?: string;
};

export type SortableTrackItemProps = {
  track: TrackData;
  /** Порядковый номер для UI (1-based), не путать с track.id (UUID) */
  displayIndex: number;
  albumId: string;
  lyricsAlbumId: string;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: (albumId: string, trackId: string, trackTitle: string) => void;
  onEdit?: (albumId: string, trackId: string, trackTitle: string) => void;
  onTitleChange?: (albumId: string, trackId: string, newTitle: string) => Promise<void>;
  onVisibilityChange: (
    albumId: string,
    trackId: string,
    visibility: TrackVisibility
  ) => Promise<void>;
  onLyricsAction: (
    action: LyricsAction,
    albumId: string,
    trackId: string,
    trackTitle: string
  ) => void;
  onPreloadLyrics?: () => void;
  rowFlash?: DashboardRowFlash;
  ui?: IInterface;
  retryingTrackProcessingId?: string | null;
  onRetryTrackProcessing?: (albumId: string, trackId: string) => void;
  replacingTrackId?: string | null;
  onReplaceTrackAudio?: (albumId: string, trackId: string, trackTitle: string, file: File) => void;
  replaceAudioDisabled?: boolean;
  suppressProcessingStatus?: boolean;
};

export function SortableTrackItem({
  track,
  displayIndex,
  albumId,
  lyricsAlbumId,
  isOpen,
  onToggle,
  onDelete,
  onEdit,
  onTitleChange,
  onVisibilityChange,
  onLyricsAction,
  onPreloadLyrics,
  rowFlash,
  ui,
  retryingTrackProcessingId,
  onRetryTrackProcessing,
  replacingTrackId,
  onReplaceTrackAudio,
  replaceAudioDisabled = false,
  suppressProcessingStatus = false,
}: SortableTrackItemProps) {
  const { lang } = useLang();
  const { monetizationEnabled } = useArtistMonetization();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(track.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceAudioInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    triggerRef: accessBtnRef,
    menuRef: accessMenuRef,
    menuOpen: accessMenuOpen,
    menuStyle,
    portalMount: trackAccessPortalMount,
    toggleMenu: toggleAccessMenu,
    closeMenu: closeAccessMenu,
  } = useDashboardAccessMenu({
    getPortalRoot: (_trigger) => resolveDashboardAccessMenuPortalFromElement(containerRef.current),
  });
  const rawTrackVisibility = normalizeTrackVisibility(track.visibility);
  const trackVisibility = resolveEffectiveContentVisibility(
    rawTrackVisibility,
    monetizationEnabled
  );

  const trackVisibilityMenuOptions = useMemo(() => {
    const d = ui?.dashboard as DashboardUiWithTrackAccess | undefined;
    const t = d?.trackVisibility;
    const en = lang === 'en';
    const fallbacks = {
      public: {
        title: en ? 'Open to everyone' : 'Открыт для всех',
        description: en ? 'Track is available to all visitors' : 'Трек доступен всем посетителям',
      },
      subscribersOnly: {
        title: en ? 'Subscribers only' : 'Только для подписчиков',
        description: en
          ? 'Available to subscribers with active artist support'
          : 'Доступен подписчикам с активной поддержкой артиста',
      },
      hidden: {
        title: en ? 'Hidden' : 'Скрыт',
        description: en
          ? 'Not shown in the tracklist on the site'
          : 'Не отображается в треклисте на сайте',
      },
    } as const;

    return filterVisibilityOptionsByMonetization(
      TRACK_VISIBILITY_OPTIONS.map((opt) => {
        const block =
          opt.value === 'public'
            ? t?.public
            : opt.value === 'hidden'
              ? t?.hidden
              : t?.subscribersOnly;
        const fb =
          opt.value === 'public'
            ? fallbacks.public
            : opt.value === 'hidden'
              ? fallbacks.hidden
              : fallbacks.subscribersOnly;
        return {
          value: opt.value,
          label: block?.title ?? fb.title,
          description: block?.description ?? fb.description,
        };
      }),
      monetizationEnabled
    );
  }, [lang, monetizationEnabled, ui?.dashboard]);

  const trackAccessAria =
    (ui?.dashboard as DashboardUiWithTrackAccess | undefined)?.trackAccessAriaLabel ??
    'Track access';

  useEffect(() => {
    if (!isEditing) {
      setEditedTitle(track.title);
    }
  }, [track.title, isEditing]);

  const handleEdit = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditedTitle(track.title);
      setIsEditing(true);
    },
    [track.title]
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  const handleTitleBlur = async () => {
    if (editedTitle.trim() !== track.title && editedTitle.trim() !== '' && onTitleChange) {
      await onTitleChange(albumId, track.id, editedTitle.trim());
    } else if (editedTitle.trim() === '') {
      setEditedTitle(track.title);
    }
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setEditedTitle(track.title);
      setIsEditing(false);
    }
  };

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(albumId, track.id, track.title);
    },
    [albumId, track.id, track.title, onDelete]
  );

  const pickVisibility = useCallback(
    async (v: TrackVisibility) => {
      if (v === rawTrackVisibility) {
        closeAccessMenu();
        return;
      }
      closeAccessMenu();
      void onVisibilityChange(albumId, track.id, v);
    },
    [albumId, track.id, rawTrackVisibility, onVisibilityChange, closeAccessMenu]
  );

  const handleHeaderClick = () => {
    if (isEditing) {
      return;
    }
    onToggle();
  };

  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHeaderClick();
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  const trackRowFlashProps = rowFlash
    ? {
        className: DASHBOARD_ROW_STATE_FLASH_CLASS,
        style: {
          [DASHBOARD_ROW_FLASH_RGB_VAR]: getDashboardRowStateFlashRgb(rowFlash.visibility),
        } as React.CSSProperties,
        'data-visibility-flash': rowFlash.visibility,
      }
    : {};

  return (
    <>
      <div
        ref={combinedRef}
        style={{ ...style, ...trackRowFlashProps.style }}
        className={clsx('user-dashboard__expanded-track-row', 'dashboard-track-row', {
          'user-dashboard__expanded-track-row--dragging': isDragging,
          [trackRowFlashProps.className ?? '']: Boolean(trackRowFlashProps.className),
        })}
        id={`dashboard-track-row-${track.id}`}
        data-visibility-flash={trackRowFlashProps['data-visibility-flash']}
      >
        <DashboardCard
          as="article"
          interactive
          className={clsx(
            'user-dashboard__expanded-track-card',
            isOpen && 'user-dashboard__expanded-track-card--expanded'
          )}
        >
          <div
            className={clsx('user-dashboard__expanded-track-header', {
              'user-dashboard__expanded-track-header--access-menu-open': accessMenuOpen,
            })}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            onClick={handleHeaderClick}
            onKeyDown={handleHeaderKeyDown}
          >
            <div
              {...attributes}
              {...listeners}
              className="user-dashboard__expanded-track-drag user-dashboard__track-drag-handle"
              title={ui?.dashboard?.dragToReorder ?? 'Drag to reorder'}
              aria-label={ui?.dashboard?.dragToReorder ?? 'Drag to reorder'}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="user-dashboard__track-drag-icon">⋮⋮</span>
            </div>

            <span className="user-dashboard__expanded-track-chevron" aria-hidden>
              <DashboardExpandChevron expanded={isOpen} />
            </span>

            <span className="user-dashboard__expanded-track-number">
              {String(displayIndex).padStart(2, '0')}
            </span>

            <div className="user-dashboard__expanded-track-title-slot">
              {isEditing ? (
                <input
                  key={`edit-${track.id}-${isEditing}`}
                  ref={inputRef}
                  type="text"
                  className="dashboard-form-input user-dashboard__expanded-track-title-input"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="user-dashboard__expanded-track-title">{track.title}</span>
              )}
            </div>

            <span className="user-dashboard__expanded-track-duration">{track.duration}</span>

            <TrackProcessingStatus
              track={track}
              ui={ui}
              albumId={albumId}
              trackId={track.id}
              retrying={retryingTrackProcessingId === track.id}
              onRetry={onRetryTrackProcessing}
              suppressed={suppressProcessingStatus}
            />

            <span className="user-dashboard__expanded-track-access-slot">
              <button
                ref={accessBtnRef}
                type="button"
                className="user-dashboard__track-access-button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAccessMenu(e);
                }}
                aria-expanded={accessMenuOpen}
                aria-haspopup="menu"
                aria-label={trackAccessAria}
              >
                <span className="user-dashboard__track-access-button-icon" aria-hidden>
                  <TrackVisibilityIcon visibility={trackVisibility} size={18} />
                </span>
              </button>
            </span>

            <div className="user-dashboard__expanded-track-actions">
              {onReplaceTrackAudio ? (
                <>
                  <input
                    ref={replaceAudioInputRef}
                    type="file"
                    accept="audio/*,.wav,.flac,.aiff,.aif,.mp3,.m4a,.ogg,.opus"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onReplaceTrackAudio(albumId, track.id, track.title, file);
                      }
                      if (e.target) {
                        e.target.value = '';
                      }
                    }}
                  />
                  <DashboardButton
                    variant="icon"
                    disabled={
                      replaceAudioDisabled ||
                      isEditing ||
                      replacingTrackId === track.id ||
                      retryingTrackProcessingId === track.id
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      replaceAudioInputRef.current?.click();
                    }}
                    aria-label={ui?.dashboard?.replaceTrackAudio ?? 'Replace audio'}
                    title={ui?.dashboard?.replaceTrackAudio ?? 'Replace audio'}
                  >
                    <ReplaceIcon {...dashboardActionIconProps()} />
                  </DashboardButton>
                </>
              ) : null}
              <DashboardButton
                variant="icon"
                disabled={isEditing}
                aria-pressed={isEditing}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(e);
                }}
                aria-label={ui?.dashboard?.editTrack ?? 'Edit track'}
              >
                <PencilIcon {...dashboardActionIconProps()} />
              </DashboardButton>
              <DashboardButton
                variant="icon"
                destructive
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e);
                }}
                aria-label={ui?.dashboard?.deleteTrack ?? 'Delete track'}
              >
                <Trash2Icon {...dashboardActionIconProps()} />
              </DashboardButton>
            </div>
          </div>

          {isOpen ? (
            <div className="user-dashboard__expanded-track-body">
              <TrackLyricsPanel
                track={track}
                albumId={lyricsAlbumId}
                ui={ui ?? null}
                lang={lang}
                onLyricsAction={onLyricsAction}
                onPreloadLyrics={onPreloadLyrics}
              />
            </div>
          ) : null}
        </DashboardCard>
      </div>

      <DashboardAccessMenuPortal
        menuRef={accessMenuRef}
        open={accessMenuOpen}
        portalMount={trackAccessPortalMount}
        menuStyle={menuStyle}
      >
        {trackVisibilityMenuOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="menuitem"
            className={clsx('user-dashboard__track-access-menu-item', {
              'user-dashboard__track-access-menu-item--active': opt.value === trackVisibility,
            })}
            onClick={() => void pickVisibility(opt.value)}
          >
            <span className="user-dashboard__track-access-menu-item-icon" aria-hidden>
              <TrackVisibilityIcon visibility={opt.value} size={18} />
            </span>
            <span className="user-dashboard__track-access-menu-item-text">
              <span className="user-dashboard__track-access-menu-item-title">{opt.label}</span>
              <span className="user-dashboard__track-access-menu-item-desc">{opt.description}</span>
            </span>
            {opt.value === trackVisibility ? (
              <span className="user-dashboard__track-access-menu-check" aria-hidden>
                ✓
              </span>
            ) : (
              <span className="user-dashboard__track-access-menu-check-spacer" aria-hidden />
            )}
          </button>
        ))}
      </DashboardAccessMenuPortal>
    </>
  );
}
